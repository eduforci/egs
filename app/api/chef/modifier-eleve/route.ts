import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

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

  const rolesAutorises = ["chef", "directeur_etudes", "secretaire", "educateur", "super_admin"];
  if (!profile || !rolesAutorises.includes(profile.role)) {
    return NextResponse.json({ error: "Accès réservé au personnel administratif." }, { status: 403 });
  }

  const {
    eleveId,
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

  return NextResponse.json({ success: true });
}
