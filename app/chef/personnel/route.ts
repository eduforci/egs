import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const ROLES_AUTORISES = [
  "enseignant",
  "educateur",
  "directeur_etudes",
  "comptable",
  "secretaire",
] as const;

type RoleAutorise = (typeof ROLES_AUTORISES)[number];

const PREFIXES: Record<RoleAutorise, string> = {
  enseignant: "ENS",
  educateur: "EDU",
  directeur_etudes: "DIR",
  comptable: "COM",
  secretaire: "SEC",
};

export async function POST(request: Request) {
  try {
    // ---------------------------------------------------------
    // 1. Vérifier l'utilisateur connecté
    // ---------------------------------------------------------

    const supabase = await createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Non authentifié." },
        { status: 401 }
      );
    }

    // ---------------------------------------------------------
    // 2. Vérifier que l'utilisateur est bien Chef
    // ---------------------------------------------------------

    const { data: chefProfile, error: chefError } = await supabase
      .from("profiles")
      .select("role, etablissement_id")
      .eq("id", user.id)
      .single();

    if (
      chefError ||
      !chefProfile ||
      chefProfile.role !== "chef"
    ) {
      return NextResponse.json(
        {
          error:
            "Accès réservé au chef d'établissement.",
        },
        { status: 403 }
      );
    }

    if (!chefProfile.etablissement_id) {
      return NextResponse.json(
        {
          error:
            "Votre compte n'est associé à aucun établissement.",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 3. Récupérer les données
    // ---------------------------------------------------------

    const body = await request.json();

    const {
      nom,
      prenom,
      role,
    } = body as {
      nom?: string;
      prenom?: string;
      role?: RoleAutorise;
    };

    if (!nom || !prenom || !role) {
      return NextResponse.json(
        {
          error:
            "Nom, prénom et rôle sont obligatoires.",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 4. Vérifier le rôle demandé
    // ---------------------------------------------------------

    if (!ROLES_AUTORISES.includes(role)) {
      return NextResponse.json(
        {
          error:
            "Ce rôle ne peut pas être créé par le Chef d'établissement.",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 5. Client administrateur Supabase
    // ---------------------------------------------------------

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ---------------------------------------------------------
    // 6. Générer un identifiant unique
    // ---------------------------------------------------------

    const prefix = PREFIXES[role];

    const { data: existants, error: identifiantError } =
      await admin
        .from("profiles")
        .select("identifiant")
        .like("identifiant", `${prefix}-%`);

    if (identifiantError) {
      return NextResponse.json(
        {
          error:
            "Impossible de générer l'identifiant.",
        },
        { status: 500 }
      );
    }

    const maxNumero = (existants ?? []).reduce(
      (max, profil) => {
        const match = profil.identifiant?.match(
          new RegExp(`^${prefix}-(\\d+)$`)
        );

        const numero = match
          ? parseInt(match[1], 10)
          : 0;

        return numero > max ? numero : max;
      },
      0
    );

    const numero = String(maxNumero + 1).padStart(
      4,
      "0"
    );

    const identifiant = `${prefix}-${numero}`;

    // ---------------------------------------------------------
    // 7. Email technique
    // ---------------------------------------------------------

    const emailTechnique =
      `${identifiant.toLowerCase()}@` +
      `${chefProfile.etablissement_id}.egs.local`;

    // ---------------------------------------------------------
    // 8. Mot de passe provisoire
    // ---------------------------------------------------------

    const motDePasseProvisoire =
      Math.random().toString(36).slice(-8) +
      "A1!";

    // ---------------------------------------------------------
    // 9. Créer le compte Auth
    // ---------------------------------------------------------

    const {
      data: nouvelUser,
      error: createError,
    } = await admin.auth.admin.createUser({
      email: emailTechnique,
      password: motDePasseProvisoire,
      email_confirm: true,
    });

    if (createError || !nouvelUser.user) {
      return NextResponse.json(
        {
          error:
            createError?.message ||
            "Erreur lors de la création du compte.",
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // 10. Créer le profil
    // ---------------------------------------------------------

    const { error: profileError } =
      await admin.from("profiles").insert({
        id: nouvelUser.user.id,
        role,
        etablissement_id:
          chefProfile.etablissement_id,
        nom: nom.trim(),
        prenom: prenom.trim(),
        identifiant,
        must_change_password: true,
      });

    // Si le profil échoue, supprimer le compte Auth créé
    if (profileError) {
      await admin.auth.admin.deleteUser(
        nouvelUser.user.id
      );

      return NextResponse.json(
        {
          error: profileError.message,
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // 11. Créations complémentaires selon le rôle
    // ---------------------------------------------------------

    if (role === "enseignant") {
      await admin.from("enseignants").insert({
        id: nouvelUser.user.id,
        etablissement_id:
          chefProfile.etablissement_id,
        statut: "actif",
      });
    }

    if (role === "educateur") {
      // Si une table éducateurs existe dans ton schéma,
      // nous pourrons l'alimenter ici.
    }

    // ---------------------------------------------------------
    // 12. Réponse
    // ---------------------------------------------------------

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
    console.error(
      "Erreur création personnel :",
      error
    );

    return NextResponse.json(
      {
        error:
          "Une erreur inattendue est survenue.",
      },
      { status: 500 }
    );
  }
        }
