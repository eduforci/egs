import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Résultats d'examen PUBLIÉS par l'école, pour les enfants du parent connecté uniquement.
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: liens } = await admin.from("parents_eleves").select("eleve_id").eq("parent_id", user.id);
  const idsEleves = Array.from(new Set((liens ?? []).map((l: any) => l.eleve_id as string)));
  if (idsEleves.length === 0) {
    return NextResponse.json({ enfants: [], total: 0 });
  }

  const { data: profils } = await admin.from("profiles").select("id, nom, prenom").in("id", idsEleves);

  const { data: resultats, error } = await admin
    .from("examens_resultats_publies")
    .select("examen_id, eleve_id, classe_nom, points_obtenus, points_total, moyenne, mention, rang, decision, a_participe, publie_le")
    .in("eleve_id", idsEleves);

  // Table pas encore installée : on répond « aucun résultat » plutôt qu'une erreur.
  if (error) {
    return NextResponse.json({ enfants: [], total: 0, installe: false });
  }

  const idsExamens = Array.from(new Set((resultats ?? []).map((r: any) => r.examen_id as string)));
  const { data: examens } = idsExamens.length
    ? await admin
        .from("examens")
        .select("id, nom, annee_scolaire, categorie, resultats_publies_le")
        .in("id", idsExamens)
    : { data: [] as any[] };

  // Seuls les examens dont les résultats sont toujours publiés.
  const examenParId = new Map(
    (examens ?? []).filter((e: any) => e.resultats_publies_le).map((e: any) => [e.id, e])
  );
  const profilParId = new Map((profils ?? []).map((p: any) => [p.id, p]));

  let total = 0;
  const enfants = idsEleves.map((id) => {
    const p: any = profilParId.get(id);
    const liste = (resultats ?? [])
      .filter((r: any) => r.eleve_id === id && examenParId.has(r.examen_id))
      .map((r: any) => {
        const ex: any = examenParId.get(r.examen_id);
        return {
          examen_id: r.examen_id,
          examen_nom: ex.nom,
          annee_scolaire: ex.annee_scolaire ?? null,
          categorie: ex.categorie ?? null,
          classe_nom: r.classe_nom ?? null,
          moyenne: r.moyenne === null || r.moyenne === undefined ? null : Number(r.moyenne),
          points_obtenus: r.points_obtenus === null ? null : Number(r.points_obtenus),
          points_total: r.points_total === null ? null : Number(r.points_total),
          mention: r.mention ?? null,
          rang: r.rang ?? null,
          decision: r.decision ?? null,
          a_participe: r.a_participe !== false,
          publie_le: ex.resultats_publies_le as string,
        };
      })
      .sort((a, b) => (a.publie_le < b.publie_le ? 1 : -1));
    total += liste.length;
    return { id, nom: p?.nom ?? "", prenom: p?.prenom ?? "", resultats: liste };
  });

  return NextResponse.json({ enfants, total });
}
