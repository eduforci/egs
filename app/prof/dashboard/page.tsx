import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: affectations, error } = await supabase
    .from("affectations_enseignant")
    .select(
      `
      id,
      classes ( id, nom, niveau, annee_scolaire ),
      matieres ( id, nom, coefficient_defaut )
    `
    )
    .eq("enseignant_id", user?.id);

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl font-semibold mb-4">
        Débogage temporaire
      </h1>
      <p className="mb-2"><strong>User ID connecté :</strong> {user?.id ?? "non connecté"}</p>
      <p className="mb-2"><strong>Erreur :</strong></p>
      <pre className="bg-red-50 p-3 rounded text-xs overflow-auto">
        {JSON.stringify(error, null, 2)}
      </pre>
      <p className="mb-2 mt-4"><strong>Données :</strong></p>
      <pre className="bg-neutral-50 p-3 rounded text-xs overflow-auto">
        {JSON.stringify(affectations, null, 2)}
      </pre>
    </main>
  );
}
