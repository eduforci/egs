import { createClient } from "@/lib/supabase/server";
import EnseignantNav from "@/components/enseignant-nav";
import { libellePeriode, listePeriodes, normaliserNb } from "@/lib/periodes";

export const dynamic = "force-dynamic";

export default async function ChoixTrimestre({
  params,
}: {
  params: Promise<{ classeId: string; matiereId: string }>;
}) {
  const { classeId, matiereId } = await params;
  const supabase = await createClient();

  const { data: classe } = await supabase
    .from("classes")
    .select("nom, niveau, etablissement_id")
    .eq("id", classeId)
    .single();

  const { data: matiere } = await supabase
    .from("matieres")
    .select("nom")
    .eq("id", matiereId)
    .single();

  const { data: parametres } = await supabase
    .from("parametres_pedagogiques")
    .select("nb_trimestres")
    .eq("etablissement_id", classe?.etablissement_id ?? "")
    .maybeSingle();
  const nbPeriodes = normaliserNb(parametres?.nb_trimestres);
  const trimestres = listePeriodes(nbPeriodes);

  return (
    <main className="p-8">
      <div className="mb-6">
        <EnseignantNav />
      </div>
      <h1 className="font-display text-3xl font-semibold mb-1">
        {classe?.nom} — {matiere?.nom}
      </h1>
      <p className="text-neutral-500 mb-6">Choisissez une période</p>

      <div className="grid grid-cols-1 gap-3 max-w-md">
        {trimestres.map((t) => (
          <a
            key={t}
            href={`/prof/classe/${classeId}/matiere/${matiereId}/trimestre/${t}`}
            className="bg-white border rounded-xl p-4 font-medium hover:bg-neutral-50"
          >
            {libellePeriode(nbPeriodes, t)}
          </a>
        ))}
      </div>

      <a href="/prof/dashboard" className="inline-block mt-6 text-sm text-neutral-500 underline">
        ← Retour au tableau de bord
      </a>
    </main>
  );
}
