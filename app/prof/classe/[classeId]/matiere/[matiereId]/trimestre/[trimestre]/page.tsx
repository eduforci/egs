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

  const { data: notes, error: notesError } = await supabase
    .from("notes")
    .select("*")
    .eq("classe_id", classeId)
    .eq("matiere_id", matiereId)
    .eq("trimestre", trimestre);

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

  // Barèmes configurés pour l'établissement (plus de valeurs fixées dans le code)
  const { data: baremes, error: baremesError } = await supabase
    .from("baremes_evaluations")
    .select("type_evaluation, bareme_max, poids, ordre")
    .eq("etablissement_id", classe?.etablissement_id ?? "")
    .order("ordre", { ascending: true });

  const erreurDiagnostic =
    elevesError?.message || profilesError || notesError?.message || baremesError?.message || null;

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
        enseignantId={user?.id ?? ""}
        eleves={eleves as any}
        notesExistantes={notes ?? []}
        observationsExistantes={observations ?? []}
        validation={validation ?? null}
        baremes={baremes ?? []}
      />
    </>
  );
          }
        
