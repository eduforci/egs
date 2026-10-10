import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const NB_NOTES_PAR_ENFANT = 8;

// Renvoie, pour le parent connecté et UNIQUEMENT pour ses propres enfants :
// le nom, le prénom, la classe et les dernières notes saisies par les enseignants.
// On passe par le serveur car un parent n'a pas le droit de lire directement
// la fiche (profiles) de son enfant ni les détails des évaluations.
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

  // Seuls les enfants liés à ce compte parent (filtre sur l'identifiant de la session).
  const { data: liens, error: liensErreur } = await admin
    .from("parents_eleves")
    .select("eleve_id")
    .eq("parent_id", user.id);
  if (liensErreur) {
    return NextResponse.json({ error: liensErreur.message }, { status: 500 });
  }

  const idsEleves = Array.from(new Set((liens ?? []).map((l: any) => l.eleve_id as string)));
  if (idsEleves.length === 0) {
    return NextResponse.json({ enfants: [] });
  }

  const [{ data: profils }, { data: eleves }] = await Promise.all([
    admin.from("profiles").select("id, nom, prenom").in("id", idsEleves),
    admin.from("eleves").select("id, matricule, classe_id").in("id", idsEleves),
  ]);

  const idsClasses = Array.from(
    new Set((eleves ?? []).map((e: any) => e.classe_id).filter(Boolean) as string[])
  );
  const { data: classes } = idsClasses.length
    ? await admin.from("classes").select("id, nom").in("id", idsClasses)
    : { data: [] as any[] };

  // Notes : on essaie avec la date de saisie ; si la colonne n'existe pas, on réessaie sans.
  let notesBrutes: any[] = [];
  const avecDate = await admin
    .from("notes")
    .select("eleve_id, evaluation_id, valeur, created_at")
    .in("eleve_id", idsEleves)
    .order("created_at", { ascending: false })
    .limit(400);
  if (!avecDate.error) {
    notesBrutes = avecDate.data ?? [];
  } else {
    const sansDate = await admin
      .from("notes")
      .select("eleve_id, evaluation_id, valeur")
      .in("eleve_id", idsEleves)
      .limit(400);
    notesBrutes = sansDate.data ?? [];
  }

  const idsEvaluations = Array.from(
    new Set(notesBrutes.map((n) => n.evaluation_id).filter(Boolean) as string[])
  );
  const { data: evaluations } = idsEvaluations.length
    ? await admin
        .from("evaluations")
        .select("id, matiere_id, libelle, bareme_max, date_evaluation")
        .in("id", idsEvaluations)
    : { data: [] as any[] };

  const idsMatieres = Array.from(
    new Set((evaluations ?? []).map((e: any) => e.matiere_id).filter(Boolean) as string[])
  );
  const { data: matieres } = idsMatieres.length
    ? await admin.from("matieres").select("id, nom").in("id", idsMatieres)
    : { data: [] as any[] };

  const profilParId = new Map((profils ?? []).map((p: any) => [p.id, p]));
  const eleveParId = new Map((eleves ?? []).map((e: any) => [e.id, e]));
  const classeParId = new Map((classes ?? []).map((c: any) => [c.id, c.nom]));
  const evaluationParId = new Map((evaluations ?? []).map((e: any) => [e.id, e]));
  const matiereParId = new Map((matieres ?? []).map((m: any) => [m.id, m.nom]));

  const enfants = idsEleves.map((id) => {
    const profil: any = profilParId.get(id);
    const eleve: any = eleveParId.get(id);

    const notes = notesBrutes
      .filter((n) => n.eleve_id === id && evaluationParId.has(n.evaluation_id))
      .map((n) => {
        const ev: any = evaluationParId.get(n.evaluation_id);
        const dateSaisie: string | null = n.created_at ?? null;
        const dateTri: string = dateSaisie ?? ev.date_evaluation ?? "";
        return {
          matiere: matiereParId.get(ev.matiere_id) ?? "Matière",
          libelle: ev.libelle ?? "",
          valeur: Number(n.valeur),
          sur: Number(ev.bareme_max ?? 20),
          date: ev.date_evaluation ?? null,
          saisie_le: dateSaisie,
          _tri: dateTri,
        };
      })
      .sort((a, b) => (a._tri < b._tri ? 1 : a._tri > b._tri ? -1 : 0))
      .slice(0, NB_NOTES_PAR_ENFANT)
      .map(({ _tri, ...reste }) => reste);

    return {
      id,
      nom: profil?.nom ?? "",
      prenom: profil?.prenom ?? "",
      matricule: eleve?.matricule ?? "",
      classe_nom: eleve?.classe_id ? classeParId.get(eleve.classe_id) ?? "" : "",
      notes,
    };
  });

  return NextResponse.json({ enfants });
}
