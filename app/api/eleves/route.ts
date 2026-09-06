import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const body = await request.json();
  const { nom, prenom, matricule, classe_id, date_naissance } = body ?? {};

  if (!nom || !prenom || !classe_id) {
    return NextResponse.json(
      { error: "Nom, prénom et classe sont obligatoires." },
      { status: 400 }
    );
  }

  const matriculeNettoye = matricule ? matricule.toString().trim() : "";
  const aUnMatricule = matriculeNettoye.length > 0;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();

  const rolesAutorises = ["chef", "directeur_etudes", "secretaire", "super_admin"];
  if (!profile || !rolesAutorises.includes(profile.role)) {
    return NextResponse.json(
      { error: "Vous n'êtes pas autorisé à créer un compte élève." },
      { status: 403 }
    );
  }

  if (!profile.etablissement_id) {
    return NextResponse.json(
      { error: "Aucun établissement associé à votre compte." },
      { status: 400 }
    );
  }

  const { data: classe } = await supabase
    .from("classes")
    .select("id, etablissement_id")
    .eq("id", classe_id)
    .single();

  if (!classe || classe.etablissement_id !== profile.etablissement_id) {
    return NextResponse.json(
      { error: "Classe invalide pour votre établissement." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Identifiant de connexion : le matricule officiel s'il existe, sinon un
  // identifiant provisoire (à mettre à jour plus tard via le suivi d'immatriculation)
  let identifiant = aUnMatricule ? matriculeNettoye : genererIdentifiantProvisoire();

  if (aUnMatricule) {
    const { data: matriculeExistant } = await admin
      .from("profiles")
      .select("id")
      .eq("identifiant", matriculeNettoye)
      .maybeSingle();

    if (matriculeExistant) {
      return NextResponse.json(
        { error: `Le matricule "${matriculeNettoye}" est déjà utilisé par un autre compte.` },
        { status: 409 }
      );
    }
  } else {
    // Boucle de sécurité si jamais deux identifiants provisoires générés coïncident
    for (let tentative = 0; tentative < 5; tentative++) {
      const { data: collision } = await admin
        .from("profiles")
        .select("id")
        .eq("identifiant", identifiant)
        .maybeSingle();
      if (!collision) break;
      identifiant = genererIdentifiantProvisoire();
    }
  }

  const motDePasse = genererMotDePasseTemporaire();
  // L'email est basé sur un jeton aléatoire indépendant du matricule, pour ne
  // jamais avoir à le modifier quand le vrai matricule arrivera plus tard.
  const emailSynthetique = `eleve-${genererJetonEmail()}@eleves.egs.local`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: emailSynthetique,
    password: motDePasse,
    email_confirm: true,
  });

  if (createError || !created?.user) {
    return NextResponse.json(
      { error: createError?.message || "Erreur lors de la création du compte." },
      { status: 500 }
    );
  }

  const userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    role: "eleve",
    etablissement_id: profile.etablissement_id,
    nom,
    prenom,
    identifiant,
    must_change_password: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: eleveError } = await admin.from("eleves").insert({
    id: userId,
    etablissement_id: profile.etablissement_id,
    classe_id,
    matricule: aUnMatricule ? matriculeNettoye : null,
    date_naissance: date_naissance || null,
    statut: "actif",
  });

  if (eleveError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: eleveError.message }, { status: 500 });
  }

  return NextResponse.json({ matricule: identifiant, motDePasse, provisoire: !aUnMatricule });
      }
