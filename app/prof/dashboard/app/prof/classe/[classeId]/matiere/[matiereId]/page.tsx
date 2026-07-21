import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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
    .select("nom, niveau")
    .eq("id", classeId)
    .single();

  const { data: matiere } = await supabase
    .from("matieres")
    .select("nom")
    .eq("id", matiereId)
    .single();

  const trimestres = [1, 2, 3];

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl font-semibold mb-1">
        {classe?.nom} — {matiere?.nom}
      </h1>
      <p className="text-neutral-500 mb-6">Choisissez un trimestre</p>

      <div className="grid grid-cols-1 gap-3 max-w-md">
        {trimestres.map((t) => (
          <Link
            key={t}
            href={`/prof/classe/${classeId}/matiere/${matiereId}/trimestre/${t}`}
            className="bg-white border rounded-xl p-4 font-medium hover:bg-neutral-50"
          >
            {t}er/ème trimestre
          </Link>
        ))}
      </div>
    </main>
  );
}
