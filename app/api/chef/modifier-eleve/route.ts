import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { journaliser } from "@/lib/audit";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();

  const rolesAutorises = ["administration", "chef", "directeur_etudes", "secretaire", "educateur", "super_admin"];
  if (!profile || !rolesAutorises.includes(profile.role)) {
    return NextResponse.json({ error: "Accès réservé au personnel administratif." }, { status: 403 });
  }

  const {
    eleveId,
    nom,
    prenom,
    adresse,
    photoUrl,
    statut,
    dateNaissance,
    lieuNaissance,
    statutAffecte,
    lv2,
    disciplineArtistique,
    regime,
  } = await request.json();

  if (!eleveId) {
    return NextResponse.json({ error: "Identifiant élève manquant." }, { status: 400 });
  }

  const nomPropre = typeof nom === "string" ? nom.trim() : undefined;
  const prenomPropre = typeof prenom === "string" ? prenom.trim() : undefined;
  if ((nomPropre !== undefined && !nomPropre) || (prenomPropre !== undefined && !prenomPropre)) {
    return NextResponse.json({ error: "Le nom et le prénom ne peuvent pas être vides." }, { status: 400 });
  }

  const statutsValides = ["actif", "inactif", "transfere", "diplome", "abandon"];
  if (statut && !statutsValides.includes(statut)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }

  const lv2Valides = ["Allemand", "Espagnol"];
  if (lv2 && !lv2Valides.includes(lv2)) {
    return NextResponse.json({ error: "LV2 invalide." }, { status: 400 });
  }

  const disciplinesValides = ["Dessin", "Musique"];
  if (disciplineArtistique && !disciplinesValides.includes(disciplineArtistique)) {
    return NextResponse.json({ error: "Discipline artistique invalide." }, { status: 400 });
  }

  const regimesValides = ["Boursier", "Non-boursier", "Demi-boursier"];
  if (regime && !regimesValides.includes(regime)) {
    return NextResponse.json({ error: "Régime invalide." }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: eleve, error: eleveError } = await admin
    .from("eleves")
    .select("id, etablissement_id")
    .eq("id", eleveId)
    .single();

  if (eleveError || !eleve) {
    return NextResponse.json({ error: "Élève introuvable." }, { status: 404 });
  }

  if (eleve.etablissement_id !== profile.etablissement_id) {
    return NextResponse.json({ error: "Accès refusé pour cet établissement." }, { status: 403 });
  }

  // État avant modification (pour le journal d'audit)
  const { data: avant } = await admin
    .from("eleves")
    .select("adresse, statut, date_naissance, lieu_naissance, statut_affecte, lv2, discipline_artistique, regime, photo_url")
    .eq("id", eleveId)
    .maybeSingle();
  const { data: profilAvant } = await admin
    .from("profiles")
    .select("nom, prenom")
    .eq("id", eleveId)
    .maybeSingle();

  // Nom et prénom : stockés dans profiles (même id que l'élève)
  if (nomPropre !== undefined || prenomPropre !== undefined) {
    const majProfil: Record<string, string> = {};
    if (nomPropre !== undefined) majProfil.nom = nomPropre;
    if (prenomPropre !== undefined) majProfil.prenom = prenomPropre;
    const { error: profilError } = await admin.from("profiles").update(majProfil).eq("id", eleveId);
    if (profilError) {
      return NextResponse.json({ error: profilError.message }, { status: 500 });
    }
  }

  const { error: updateError } = await admin
    .from("eleves")
    .update({
      adresse: adresse || null,
      photo_url: photoUrl || null,
      statut: statut || "actif",
      date_naissance: dateNaissance || null,
      lieu_naissance: lieuNaissance || null,
      statut_affecte: statutAffecte === undefined ? null : statutAffecte,
      lv2: lv2 || null,
      discipline_artistique: disciplineArtistique || null,
      regime: regime || "Non-boursier",
    })
    .eq("id", eleveId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Journal d'audit : seulement ce qui a vraiment changé
  const apres: Record<string, unknown> = {
    adresse: adresse || null,
    statut: statut || "actif",
    date_naissance: dateNaissance || null,
    lieu_naissance: lieuNaissance || null,
    statut_affecte: statutAffecte === undefined ? null : statutAffecte,
    lv2: lv2 || null,
    discipline_artistique: disciplineArtistique || null,
    regime: regime || "Non-boursier",
  };
  const diff: Record<string, { avant: unknown; apres: unknown }> = {};
  for (const [cle, valeur] of Object.entries(apres)) {
    const ancien = (avant as Record<string, unknown> | null)?.[cle] ?? null;
    if (ancien !== valeur) diff[cle] = { avant: ancien, apres: valeur };
  }
  if ((avant?.photo_url ?? null) !== (photoUrl || null)) {
    diff.photo = { avant: avant?.photo_url ? "oui" : "non", apres: photoUrl ? "oui" : "non" };
  }
  if (nomPropre !== undefined && profilAvant && profilAvant.nom !== nomPropre) {
    diff.nom = { avant: profilAvant.nom, apres: nomPropre };
  }
  if (prenomPropre !== undefined && profilAvant && profilAvant.prenom !== prenomPropre) {
    diff.prenom = { avant: profilAvant.prenom, apres: prenomPropre };
  }
  if (Object.keys(diff).length > 0) {
    await journaliser(admin, {
      etablissementId: profile.etablissement_id,
      acteurId: user.id,
      action: "eleve.modifie",
      cibleType: "eleve",
      cibleId: eleveId,
      cibleLibelle: `${prenomPropre ?? profilAvant?.prenom ?? ""} ${nomPropre ?? profilAvant?.nom ?? ""}`.trim(),
      details: diff,
    });
  }

  return NextResponse.json({ success: true });
}
