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

  const { data: { user } } = await supabase.auth.getUser();

  const { data: classe } = await supabase
    .from("classes")
    .select("nom, annee_scolaire")
    .eq("id", classeId)
    .single();

  const { data: matiere } = await supabase
    .from("matieres")
    .select("nom")
    .eq("id", matiereId)
    .single();

  const { data: eleves } = await supabase
    .from("eleves")
    .select("id, matricule, profiles ( nom, prenom )")
    .eq("classe_id", classeId);

  const { data: notes } = await supabase
    .from("notes")
    .select("*")
    .eq("classe_id", classeId)
    .eq("matiere_id", matiereId)
    .eq("trimestre", trimestre);

  return (
    <NotesTable
      classeId={classeId}
      matiereId={matiereId}
      trimestre={trimestre}
      classeNom={classe?.nom ?? ""}
      matiereNom={matiere?.nom ?? ""}
      anneeScolaire={classe?.annee_scolaire ?? ""}
      enseignantId={user?.id ?? ""}
      eleves={(eleves ?? []) as any}
      notesExistantes={notes ?? []}
    />
  );
}
