import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES_AUTORISES = ["administration", "chef", "directeur_etudes", "super_admin"];

// Publie (ou retire) les résultats d'un examen pour les parents.
// À la publication, les résultats sont recalculés puis copiés tels quels :
// ce que le parent voit ne bouge plus tant que l'école ne republie pas.
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();
  if (!profil || !ROLES_AUTORISES.includes(profil.role)) {
    return NextResponse.json({ error: "Accès réservé à la direction de l'école." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const examenId = typeof body?.examenId === "string" ? body.examenId : "";
  const publier = body?.publier !== false;
  if (!examenId) {
    return NextResponse.json({ error: "Examen non précisé." }, { status: 400 });
  }

  // L'examen doit appartenir à l'école de l'utilisateur.
  const { data: examen } = await supabase
    .from("examens")
    .select("id, nom, etablissement_id")
    .eq("id", examenId)
    .maybeSingle();
  if (!examen || (profil.role !== "super_admin" && examen.etablissement_id !== profil.etablissement_id)) {
    return NextResponse.json({ error: "Examen introuvable dans votre école." }, { status: 404 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const AIDE_SQL =
    "Exécutez d'abord le script SQL « examens_resultats_publies » dans Supabase (SQL Editor).";

  // --- Retrait de la publication ---
  if (!publier) {
    const { error: erreurRetrait } = await admin
      .from("examens")
      .update({ resultats_publies_le: null })
      .eq("id", examenId);
    if (erreurRetrait) {
      return NextResponse.json({ error: `${erreurRetrait.message}. ${AIDE_SQL}` }, { status: 500 });
    }
    await admin.from("examens_resultats_publies").delete().eq("examen_id", examenId);
    return NextResponse.json({ publie: false });
  }

  // --- Publication : on recalcule avec les droits de l'utilisateur (comme la page Résultats) ---
  const { data: resultats, error: erreurCalcul } = await supabase.rpc("calculer_resultats_examen", {
    p_examen_id: examenId,
  });
  if (erreurCalcul) {
    return NextResponse.json({ error: `Calcul impossible : ${erreurCalcul.message}` }, { status: 500 });
  }

  const lignes = ((resultats as any[]) ?? []).filter((r) => r?.eleve_id);
  if (lignes.length === 0) {
    return NextResponse.json(
      { error: "Aucun résultat à publier : vérifiez les candidats et les notes de l'examen." },
      { status: 400 }
    );
  }

  const maintenant = new Date().toISOString();
  const aInserer = lignes.map((r) => ({
    examen_id: examenId,
    etablissement_id: examen.etablissement_id,
    eleve_id: r.eleve_id,
    classe_nom: r.classe_nom ?? null,
    serie: r.serie ?? null,
    points_obtenus: r.points_obtenus ?? null,
    points_total: r.points_total ?? null,
    moyenne: r.moyenne ?? null,
    mention: r.mention ?? null,
    rang: r.rang ?? null,
    decision: r.decision ?? null,
    a_participe: r.a_participe ?? null,
    publie_le: maintenant,
  }));

  // On remplace l'ancienne copie (republication possible après correction des notes).
  const { error: erreurSuppression } = await admin
    .from("examens_resultats_publies")
    .delete()
    .eq("examen_id", examenId);
  if (erreurSuppression) {
    return NextResponse.json({ error: `${erreurSuppression.message}. ${AIDE_SQL}` }, { status: 500 });
  }

  for (let i = 0; i < aInserer.length; i += 500) {
    const { error: erreurInsertion } = await admin
      .from("examens_resultats_publies")
      .insert(aInserer.slice(i, i + 500));
    if (erreurInsertion) {
      return NextResponse.json({ error: `Enregistrement impossible : ${erreurInsertion.message}` }, { status: 500 });
    }
  }

  const { error: erreurDate } = await admin
    .from("examens")
    .update({ resultats_publies_le: maintenant })
    .eq("id", examenId);
  if (erreurDate) {
    return NextResponse.json({ error: `${erreurDate.message}. ${AIDE_SQL}` }, { status: 500 });
  }

  return NextResponse.json({ publie: true, nbResultats: aInserer.length, publieLe: maintenant });
}
