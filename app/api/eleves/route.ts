import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function genererMatricule() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `ELV${n}`;
}

function genererMotDePasseTemporaire() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { nom, prenom, classe_id, date_naissance } = body ?? {};

  if (!nom || !prenom || !classe_id) {
    return NextResponse.json(
      { error: "Nom, prénom et classe sont obligatoires." },
      { status: 400 }
    );
  }

  // 1. Vérifier que l'appelant est bien connecté et autorisé
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

  // 2. Vérifier que la classe appartient bien au même établissement
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

  // 3. Créer le compte (email interne synthétique, mot de passe temporaire)
  const admin = createAdminClient();

  let matricule = "";
  let userId = "";
  const motDePasse = genererMotDePasseTemporaire();

  for (let tentative = 0; tentative < 5; tentative++) {
    matricule = genererMatricule();
    const emailSynthetique = `${matricule.toLowerCase()}@eleves.egs.local`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: emailSynthetique,
      password: motDePasse,
      email_confirm: true,
    });

    if (!createError && created?.user) {
      userId = created.user.id;
      break;
    }

    // Collision improbable sur le matricule/email : on retente
    if (createError && !createError.message.includes("already")) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Impossible de générer un matricule unique. Réessayez." },
      { status: 500 }
    );
  }

  // 4. Profil + fiche élève
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    role: "eleve",
    etablissement_id: profile.etablissement_id,
    nom,
    prenom,
    identifiant: matricule,
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
    matricule,
    date_naissance: date_naissance || null,
  });

  if (eleveError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: eleveError.message }, { status: 500 });
  }

  return NextResponse.json({ matricule, motDePasse });
}
