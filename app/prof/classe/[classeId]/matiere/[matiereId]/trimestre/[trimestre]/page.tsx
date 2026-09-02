import { createClient } from "@/lib/supabase/server";
import NotesTable from "./notes-table";

export const dynamic = "force-dynamic";

export default async function TableauNotes({
  params,
}: {
  params: Promise<{ classeId: string; matiereId: string; trimestre: string }>;
}) {
  const { classeId, matiereId, trimestre } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: classe } = await supabase
    .from("classes")
    .select("nom, annee_scolaire, etablissement_id")
    .eq("id", classeId)
    .single();

  const { data: matiere } = await supabase
    .from("matieres")
    .select("nom")
    .eq("id", matiereId)
    .single();

  const { data: elevesRaw, error: elevesError } = await supabase
    .from("eleves")
    .select("id, matricule")
    .eq("classe_id", classeId);

  let eleves: any[] = [];
  let profilesError: string | null = null;

  if (elevesRaw && elevesRaw.length > 0) {
    const ids = elevesRaw.map((e) => e.id);

    const { data: profilesData, error: pErr } = await supabase
      .from("profiles")
      .select("id, nom, prenom")
      .in("id", ids);

    if (pErr) profilesError = pErr.message;

    eleves = elevesRaw.map((e) => ({
      id: e.id,
      matricule: e.matricule,
      profiles: profilesData?.find((p) => p.id === e.id) ?? null,
    }));
  }

  const { data: evaluations, error: evaluationsError } = await supabase
    .from("evaluations")
    .select(
      "id, categorie, bareme_max, coefficient, type_note, libelle, date_evaluation"
    )
    .eq("classe_id", classeId)
    .eq("matiere_id", matiereId)
    .eq("trimestre", trimestre)
    .eq("annee_scolaire", classe?.annee_scolaire ?? "")
    .order("date_evaluation", { ascending: true });

  const evaluationIds = (evaluations ?? []).map((e) => e.id);

  const { data: notes, error: notesError } =
    evaluationIds.length > 0
      ? await supabase
          .from("notes")
          .select("eleve_id, evaluation_id, valeur")
          .in("evaluation_id", evaluationIds)
      : {
          data: [] as {
            eleve_id: string;
            evaluation_id: string;
            valeur: number;
          }[],
          error: null,
        };

  const { data: observations } = await supabase
    .from("observations")
    .select("eleve_id, texte")
    .eq("matiere_id", matiereId)
    .eq("trimestre", trimestre)
    .eq("enseignant_id", user?.id);

  const { data: validation } = await supabase
    .from("validations_notes")
    .select("*")
    .eq("classe_id", classeId)
    .eq("matiere_id", matiereId)
    .eq("trimestre", trimestre)
    .eq("annee_scolaire", classe?.annee_scolaire ?? "")
    .maybeSingle();

  const { data: parametres } = await supabase
    .from("parametres_pedagogiques")
    .select("seuils_mentions")
    .eq("etablissement_id", classe?.etablissement_id ?? "")
    .maybeSingle();

  const erreurDiagnostic =
    elevesError?.message ||
    profilesError ||
    evaluationsError?.message ||
    notesError?.message ||
    null;

  return (
    <>
      {erreurDiagnostic && (
        <div className="max-w-5xl mx-auto mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
          Erreur technique lors du chargement : {erreurDiagnostic}
        </div>
      )}

      <NotesTable
        classeId={classeId}
        matiereId={matiereId}
        trimestre={trimestre}
        classeNom={classe?.nom ?? ""}
        matiereNom={matiere?.nom ?? ""}
        anneeScolaire={classe?.annee_scolaire ?? ""}
        etablissementId={classe?.etablissement_id ?? ""}
        enseignantId={user?.id ?? ""}
        eleves={eleves as any}
        evaluationsExistantes={evaluations ?? []}
        notesExistantes={notes ?? []}
        observationsExistantes={observations ?? []}
        validation={validation ?? null}
        seuilsMentions={
          (parametres?.seuils_mentions as Record<string, number>) ?? {}
        }
      />
    </>
  );
}
