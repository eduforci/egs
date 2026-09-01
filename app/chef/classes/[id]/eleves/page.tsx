import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ElevesDeLaClassePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: classeId } = await params;
  const supabase = await createClient();

  const { data: classe } = await supabase
    .from("classes")
    .select("nom, niveau")
    .eq("id", classeId)
    .single();

  const { data: elevesRaw } = await supabase
    .from("eleves")
    .select("id, matricule, statut, photo_url")
    .eq("classe_id", classeId);

  const eleves = elevesRaw ?? [];
  const ids = eleves.map((e) => e.id);

  const { data: profilsData } =
    ids.length > 0
      ? await supabase.from("profiles").select("id, nom, prenom").in("id", ids)
      : { data: [] as { id: string; nom: string; prenom: string }[] };

  const profilsMap = new Map((profilsData ?? []).map((p) => [p.id, p]));

  const elevesTries = eleves
    .map((e) => ({
      ...e,
      nom: profilsMap.get(e.id)?.nom ?? "",
      prenom: profilsMap.get(e.id)?.prenom ?? "",
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">
        Élèves — {classe?.nom ?? ""}
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        {elevesTries.length} élève(s)
      </p>

      {elevesTries.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun élève dans cette classe pour le moment.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {elevesTries.map((e) => (
            <Link
              key={e.id}
              href={`/chef/eleves/${e.id}`}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50"
            >
              <div className="w-9 h-9 rounded-full bg-gray-100 border overflow-hidden flex items-center justify-center shrink-0">
                {e.photo_url ? (
                  <img src={e.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-300 text-[10px]">Photo</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.nom} {e.prenom}</p>
                <p className="text-xs text-gray-400 font-mono">{e.matricule}</p>
              </div>

              <span
                className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  e.statut === "actif"
                    ? "bg-green-50 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {e.statut}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
                    }
