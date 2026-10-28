import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";

function genererMotDePasseTemporaire() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function genererIdentifiantProvisoire() {
  const chiffres = "0123456789";
  let suffixe = "";
  for (let i = 0; i < 6; i++) {
    suffixe += chiffres[Math.floor(Math.random() * chiffres.length)];
  }
  return `PROV-${suffixe}`;
}

function genererJetonEmail() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // AJOUT ICI : photo_url
    const { nom, prenom, matricule, classe_id, date_naissance, photo_url } = body ?? {};

    if (!nom || !prenom || !classe_id) {
      return NextResponse.json(
        { error: "Nom, prénom et classe sont obligatoires." },
        { status: 400 }
      );
    }

    const matriculeNettoye = matricule ? matricule.toString().trim() : "";
    const aUnMatricule = matriculeNettoye.length > 0;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non connecté." }, { status: 401 });
    }

    const { data: profile, error: profileFetchError } = await supabase
      .from("profiles")
      .select("role, etablissement_id")
      .eq("id", user.id)
      .single();

    if (profileFetchError || !profile) {
      return NextResponse.json({ error: "Profil utilisateur introuvable." }, { status: 403 });
    }

    const rolesAutorises = ["administration", "chef", "directeur_etudes", "secretaire", "super_admin"];
    if (!rolesAutorises.includes(profile.role)) {
      return NextResponse.json({ error: "Vous n'êtes pas autorisé à créer un compte élève." }, { status: 403 });
    }

    if (!profile.etablissement_id) {
      return NextResponse.json({ error: "Aucun établissement associé à votre compte." }, { status: 400 });
    }

    const { data: classe, error: classeError } = await supabase
      .from("classes")
      .select("id, etablissement_id")
      .eq("id", classe_id)
      .single();

    if (classeError || !classe || classe.etablissement_id !== profile.etablissement_id) {
      return NextResponse.json({ error: "Classe invalide pour votre établissement." }, { status: 400 });
    }

    const aujourdHui = new Date().toISOString().slice(0, 10);
    const { data: anneeScolaire, error: anneeError } = await supabase
      .from("annees_scolaires")
      .select("id, libelle, date_debut_inscriptions, date_debut, date_fin, active")
      .eq("etablissement_id", profile.etablissement_id)
      .eq("active", true)
      .single();

    if (anneeError || !anneeScolaire) {
      return NextResponse.json({ error: "Aucune année scolaire active n'est configurée." }, { status: 400 });
    }

    const dateDebutInscriptions = anneeScolaire.date_debut_inscriptions || anneeScolaire.date_debut;
    if (aujourdHui < dateDebutInscriptions || aujourdHui > anneeScolaire.date_fin) {
      return NextResponse.json(
        { error: `Les inscriptions pour l'année ${anneeScolaire.libelle} ne sont pas ouvertes.` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    let identifiant = aUnMatricule ? matriculeNettoye : genererIdentifiantProvisoire();

    if (aUnMatricule) {
      const { data: matriculeExistant } = await admin.from("profiles").select("id").eq("identifiant", matriculeNettoye).maybeSingle();
      if (matriculeExistant) {
        return NextResponse.json({ error: `Le matricule "${matriculeNettoye}" est déjà utilisé.` }, { status: 409 });
      }
    } else {
      for (let tentative = 0; tentative < 5; tentative++) {
        const { data: collision } = await admin.from("profiles").select("id").eq("identifiant", identifiant).maybeSingle();
        if (!collision) break;
        identifiant = genererIdentifiantProvisoire();
      }
    }

    const motDePasse = genererMotDePasseTemporaire();
    const emailSynthetique = `eleve-${genererJetonEmail()}@eleves.egs.local`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: emailSynthetique,
      password: motDePasse,
      email_confirm: true,
    });

    if (createError || !created?.user) {
      return NextResponse.json({ error: createError?.message || "Erreur création compte." }, { status: 500 });
    }

    const userId = created.user.id;

    const { error: profileInsertError } = await admin.from("profiles").insert({
      id: userId,
      role: "eleve",
      etablissement_id: profile.etablissement_id,
      nom,
      prenom,
      identifiant,
      must_change_password: true,
    });

    if (profileInsertError) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileInsertError.message }, { status: 500 });
    }

    // MODIF ICI : ajout photo_url
    const { error: eleveError } = await admin.from("eleves").insert({
      id: userId,
      etablissement_id: profile.etablissement_id,
      classe_id,
      matricule: aUnMatricule ? matriculeNettoye : null,
      date_naissance: date_naissance || null,
      statut: "actif",
      nom,
      prenom,
      photo_url: photo_url || null, // <-- C'EST LA LIGNE QUI MANQUAIT
    });

    if (eleveError) {
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: eleveError.message }, { status: 500 });
    }

    await journaliser(admin, {
      etablissementId: profile.etablissement_id,
      acteurId: user.id,
      action: "eleve.cree",
      cibleType: "eleve",
      cibleId: userId,
      cibleLibelle: `${prenom} ${nom}`,
      details: { identifiant, provisoire: !aUnMatricule, photo_url },
    });

    return NextResponse.json({
      matricule: identifiant,
      motDePasse,
      provisoire: !aUnMatricule,
      anneeScolaire: anneeScolaire.libelle,
    });
  } catch (error) {
    console.error("Erreur création élève:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Une erreur inattendue est survenue." },
      { status: 500 }
    );
  }
}