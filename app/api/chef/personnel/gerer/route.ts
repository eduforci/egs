import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// Qui peut gérer qui :
// - administration : tout le personnel de son école (sauf elle-même pour le blocage)
// - chef / directeur_etudes : le personnel, sauf les comptes administration et chef
const ROLES_GESTIONNAIRES = ["administration", "chef", "directeur_etudes"];
const ROLES_PROTEGES_POUR_DELEGUES = ["administration", "chef"];
const ROLES_PERSONNEL = [
  "administration", "chef", "directeur_etudes", "enseignant",
  "comptable", "secretaire", "educateur", "caissier",
];

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

    const { data: moi } = await supabase
      .from("profiles")
      .select("role, etablissement_id")
      .eq("id", user.id)
      .single();

    if (!moi || !ROLES_GESTIONNAIRES.includes(moi.role) || !moi.etablissement_id) {
      return NextResponse.json({ error: "Accès réservé à l'administration de l'école." }, { status: 403 });
    }

    const body = await request.json();
    const { cibleId, action } = body as { cibleId?: string; action?: string };
    if (!cibleId || !action) {
      return NextResponse.json({ error: "Requête incomplète." }, { status: 400 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: cible } = await admin
      .from("profiles")
      .select("id, role, etablissement_id, nom, prenom")
      .eq("id", cibleId)
      .single();

    if (!cible || cible.etablissement_id !== moi.etablissement_id) {
      return NextResponse.json({ error: "Personne introuvable dans votre établissement." }, { status: 404 });
    }
    if (!ROLES_PERSONNEL.includes(cible.role)) {
      return NextResponse.json({ error: "Ce compte n'est pas un compte du personnel." }, { status: 400 });
    }
    if (moi.role !== "administration" && ROLES_PROTEGES_POUR_DELEGUES.includes(cible.role)) {
      return NextResponse.json({ error: "Seule l'administration peut gérer ce compte." }, { status: 403 });
    }

    // --- Modifier les coordonnées ---
    if (action === "modifier") {
      const nom = String(body.nom ?? "").trim();
      const prenom = String(body.prenom ?? "").trim();
      if (!nom || !prenom) {
        return NextResponse.json({ error: "Nom et prénom obligatoires." }, { status: 400 });
      }
      const maj: Record<string, string | null> = {
        nom,
        prenom,
        telephone: String(body.telephone ?? "").trim() || null,
      };
      if (body.fonction !== undefined) {
        maj.fonction = String(body.fonction ?? "").trim() || null;
      }
      const { error } = await admin.from("profiles").update(maj).eq("id", cibleId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // --- Bloquer / débloquer ---
    if (action === "bloquer" || action === "debloquer") {
      if (cibleId === user.id) {
        return NextResponse.json({ error: "Vous ne pouvez pas bloquer votre propre compte." }, { status: 400 });
      }
      const bloquer = action === "bloquer";
      const { error: banError } = await admin.auth.admin.updateUserById(cibleId, {
        ban_duration: bloquer ? "876000h" : "none",
      });
      if (banError) return NextResponse.json({ error: banError.message }, { status: 500 });

      const { error } = await admin.from("profiles").update({ actif: !bloquer }).eq("id", cibleId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // --- Nouveau mot de passe provisoire ---
    if (action === "reinitialiser_mdp") {
      const motDePasseProvisoire = Math.random().toString(36).slice(-8) + "A1!";
      const { error: pwError } = await admin.auth.admin.updateUserById(cibleId, {
        password: motDePasseProvisoire,
      });
      if (pwError) return NextResponse.json({ error: pwError.message }, { status: 500 });
      await admin.from("profiles").update({ must_change_password: true }).eq("id", cibleId);
      return NextResponse.json({ success: true, motDePasseProvisoire });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur serveur." }, { status: 500 });
  }
}
