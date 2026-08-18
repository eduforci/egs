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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { nom, prenom, matricule, classe_id, date_naissance } = body ?? {};

  if (!nom || !prenom || !matricule || !classe_id) {
    return NextResponse.json(
      { error: "Nom, prénom, matricule et classe sont obligatoires." },
      { status: 400 }
    );
  }

  const matriculeNettoye = matricule.toString().trim();

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

  const admin = createAdminClient();

  // 3. Le matricule est délivré par le ministère : on vérifie juste qu'il
  // n'est pas déjà utilisé dans EGS, sans jamais en générer un nous-mêmes.
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

  const motDePasse = genererMotDePasseTemporaire();
  const emailSynthetique = `${matriculeNettoye.toLowerCase()}@eleves.egs.local`;

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

  // 4. Profil + fiche élève
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    role: "eleve",
    etablissement_id: profile.etablissement_id,
    nom,
    prenom,
    identifiant: matriculeNettoye,
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
    matricule: matriculeNettoye,
    date_naissance: date_naissance || null,
    statut: "actif",
  });

  if (eleveError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: eleveError.message }, { status: 500 });
  }

  return NextResponse.json({ matricule: matriculeNettoye, motDePasse });
}
