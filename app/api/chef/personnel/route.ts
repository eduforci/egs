import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const ROLES_AUTORISES = [
  "enseignant",
  "educateur",
  "directeur_etudes",
  "comptable",
  "secretaire",
  "caissier",
] as const;

type RoleAutorise = (typeof ROLES_AUTORISES)[number];

const ROLES_CREATEURS = ["chef", "directeur_etudes"] as const;

// Préfixes distincts pour chaque rôle, afin d'éviter toute confusion :
// "directeur_etudes" utilise "DE" (et non "DIR", réservé au chef d'établissement).
const PREFIXES: Record<RoleAutorise, string> = {
  enseignant: "ENS",
  educateur: "EDU",
  directeur_etudes: "DE",
  comptable: "COM",
  secretaire: "SEC",
  caissier: "CAI",
};

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const { data: createurProfile, error: createurError } = await supabase
      .from("profiles")
      .select("role, etablissement_id")
      .eq("id", user.id)
      .single();

    if (
      createurError ||
      !createurProfile ||
      !ROLES_CREATEURS.includes(createurProfile.role as (typeof ROLES_CREATEURS)[number])
    ) {
      return NextResponse.json(
        { error: "Accès réservé au chef d'établissement ou au directeur des études." },
        { status: 403 }
      );
    }

    if (!createurProfile.etablissement_id) {
      return NextResponse.json({ error: "Votre compte n'est associé à aucun établissement." }, { status: 400 });
    }

    const body = await request.json();
    const { nom, prenom, role } = body as { nom?: string; prenom?: string; role?: RoleAutorise };

    if (!nom || !prenom || !role) {
      return NextResponse.json({ error: "Nom, prénom et rôle sont obligatoires." }, { status: 400 });
    }

    if (!ROLES_AUTORISES.includes(role)) {
      return NextResponse.json({ error: "Ce rôle ne peut pas être créé depuis cette page." }, { status: 400 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const prefix = PREFIXES[role];

    const { data: existants, error: identifiantError } = await admin
      .from("profiles")
      .select("identifiant")
      .like("identifiant", `${prefix}-%`);

    if (identifiantError) {
      return NextResponse.json({ error: "Impossible de générer l'identifiant." }, { status: 500 });
    }

    const maxNumero = (existants ?? []).reduce((max, profil) => {
      const match = profil.identifiant?.match(new RegExp(`^${prefix}-(\\d+)$`));
      const numero = match ? parseInt(match[1], 10) : 0;
      return numero > max ? numero : max;
    }, 0);

    const numero = String(maxNumero + 1).padStart(4, "0");
    const identifiant = `${prefix}-${numero}`;
    const emailTechnique = `${identifiant.toLowerCase()}@${createurProfile.etablissement_id}.egs.local`;
    const motDePasseProvisoire = Math.random().toString(36).slice(-8) + "A1!";

    const { data: nouvelUser, error: createError } = await admin.auth.admin.createUser({
      email: emailTechnique,
      password: motDePasseProvisoire,
      email_confirm: true,
    });

    if (createError || !nouvelUser.user) {
      return NextResponse.json({ error: createError?.message || "Erreur lors de la création du compte." }, { status: 500 });
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: nouvelUser.user.id,
      role,
      etablissement_id: createurProfile.etablissement_id,
      nom: nom.trim(),
      prenom: prenom.trim(),
      identifiant,
      must_change_password: true,
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(nouvelUser.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (role === "enseignant") {
      await admin.from("enseignants").insert({
        id: nouvelUser.user.id,
        etablissement_id: createurProfile.etablissement_id,
        statut: "actif",
      });
    }

    return NextResponse.json(
      {
        success: true,
        identifiant,
        motDePasseProvisoire,
        role,
        nom: nom.trim(),
        prenom: prenom.trim(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur création personnel :", error);
    return NextResponse.json({ error: "Une erreur inattendue est survenue." }, { status: 500 });
  }
  }
