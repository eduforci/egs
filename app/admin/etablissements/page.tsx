import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    actif: "bg-emerald-50 text-emerald-700 border-emerald-200",
    en_attente: "bg-amber-50 text-amber-700 border-amber-200",
    suspendu: "bg-red-50 text-red-700 border-red-200",
    expire: "bg-neutral-100 text-neutral-600 border-neutral-200",
  };

  const labels: Record<string, string> = {
    actif: "Actif",
    en_attente: "En attente",
    suspendu: "Suspendu",
    expire: "Expiré",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
        styles[status] ?? styles.expire
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

export default async function EtablissementsListe({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = (q ?? "").trim();

  const supabase = await createClient();

  let query = supabase
    .from("etablissements")
    .select("id, nom, ville, statut")
    .order("created_at", { ascending: false });

  if (search) {
    query = query.ilike("nom", `%${search}%`);
  }

  const { data: etablissements } = await query;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* EN-TÊTE */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-sm font-medium text-[#0B3D2E]">
              Tableau de bord / Établissements
            </p>

            <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1C1B18] sm:text-4xl">
              Établissements
            </h1>

            <p className="mt-2 text-sm text-[#8A8272]">
              {etablissements?.length ?? 0} établissement(s){" "}
              {search ? `pour « ${search} »` : "enregistré(s)"}
            </p>
          </div>

          <Link
            href="/admin/etablissements/nouveau"
            className="inline-flex items-center justify-center rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#082C21]"
          >
            + Nouvel établissement
          </Link>
        </header>

        {/* RECHERCHE */}
        <form method="GET" className="mb-4">
          <div className="relative max-w-md">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8272]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={search}
              placeholder="Rechercher un établissement..."
              className="w-full rounded-xl border border-[#E7E2D6] bg-white py-2.5 pl-9 pr-3 text-sm text-[#1C1B18] placeholder:text-[#8A8272] focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]"
            />
          </div>
        </form>

        {/* TABLEAU */}
        <div className="overflow-hidden rounded-2xl border border-[#E7E2D6] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF8F3] text-left text-xs uppercase tracking-wide text-[#8A8272]">
                <tr>
                  <th className="px-5 py-3 font-medium">Nom</th>
                  <th className="px-5 py-3 font-medium">Ville</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody>
                {etablissements?.map((e) => (
                  <tr key={e.id} className="border-t border-[#F1EEE4]">
                    <td className="px-5 py-4 font-medium text-[#1C1B18]">
                      {e.nom}
                    </td>
                    <td className="px-5 py-4 text-[#8A8272]">
                      {e.ville || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={e.statut} />
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <Link
                        href={`/admin/etablissements/${e.id}`}
                        className="text-sm font-medium text-[#0B3D2E] hover:underline"
                      >
                        Voir / Modifier
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(!etablissements || etablissements.length === 0) && (
              <p className="px-5 py-10 text-center text-sm text-[#8A8272]">
                {search
                  ? `Aucun établissement ne correspond à « ${search} ».`
                  : "Aucun établissement pour le moment."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
          }
