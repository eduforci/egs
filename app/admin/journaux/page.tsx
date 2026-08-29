import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const moduleStyles: Record<string, string> = {
  etablissements: "bg-[#0B3D2E]/10 text-[#0B3D2E] border-[#0B3D2E]/20",
  abonnements: "bg-[#C9962B]/15 text-[#8A6A1A] border-[#C9962B]/30",
  utilisateurs: "bg-blue-50 text-blue-700 border-blue-200",
  pointage: "bg-violet-50 text-violet-700 border-violet-200",
};

function ModuleBadge({ module }: { module: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${
        moduleStyles[module] ?? "bg-neutral-100 text-neutral-600 border-neutral-200"
      }`}
    >
      {module}
    </span>
  );
}

export default async function JournauxActivite({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; page?: string }>;
}) {
  const { module, page: pageParam } = await searchParams;
  const moduleFilter = module ?? "";
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let query = supabase
    .from("journaux_activite")
    .select(
      "id, etablissement_id, utilisateur_id, action, module, description, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (moduleFilter) {
    query = query.eq("module", moduleFilter);
  }

  const { data: journaux, count } = await query;

  // Jointures manuelles (pas de FK déclarée exploitable en nested select)
  const utilisateurIds = Array.from(
    new Set((journaux ?? []).map((j) => j.utilisateur_id).filter(Boolean))
  ) as string[];

  const etablissementIds = Array.from(
    new Set((journaux ?? []).map((j) => j.etablissement_id).filter(Boolean))
  ) as string[];

  const [{ data: profils }, { data: etablissements }] = await Promise.all([
    utilisateurIds.length > 0
      ? supabase.from("profiles").select("id, nom, prenom").in("id", utilisateurIds)
      : Promise.resolve({ data: [] as { id: string; nom: string; prenom: string }[] }),
    etablissementIds.length > 0
      ? supabase.from("etablissements").select("id, nom").in("id", etablissementIds)
      : Promise.resolve({ data: [] as { id: string; nom: string }[] }),
  ]);

  const profilMap = new Map((profils ?? []).map((p) => [p.id, p]));
  const etablissementMap = new Map((etablissements ?? []).map((e) => [e.id, e.nom]));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const modulesDisponibles = [
    "etablissements",
    "abonnements",
    "utilisateurs",
    "pointage",
  ];

  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (moduleFilter) params.set("module", moduleFilter);
    params.set("page", String(targetPage));
    return `/admin/journaux?${params.toString()}`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* EN-TÊTE */}
        <header className="mb-6">
          <p className="mb-1 text-sm font-medium text-[#0B3D2E]">
            Tableau de bord / Journaux d'activité
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1C1B18] sm:text-4xl">
            Journaux d'activité
          </h1>
          <p className="mt-2 text-sm text-[#8A8272]">
            {total} événement(s) enregistré(s)
          </p>
        </header>

        {/* FILTRE MODULE */}
        <form method="GET" className="mb-4 flex items-center gap-3">
          <select
            name="module"
            defaultValue={moduleFilter}
            className="rounded-xl border border-[#E7E2D6] bg-white px-3 py-2.5 text-sm text-[#1C1B18] focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]"
          >
            <option value="">Tous les modules</option>
            {modulesDisponibles.map((m) => (
              <option key={m} value={m} className="capitalize">
                {m}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#082C21]"
          >
            Filtrer
          </button>
        </form>

        {/* TIMELINE */}
        <div className="overflow-hidden rounded-2xl border border-[#E7E2D6] bg-white shadow-sm">
          {journaux && journaux.length > 0 ? (
            <ul className="divide-y divide-[#F1EEE4]">
              {journaux.map((j) => {
                const auteur = j.utilisateur_id
                  ? profilMap.get(j.utilisateur_id)
                  : null;

                return (
                  <li key={j.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B3D2E]/10 text-xs font-semibold text-[#0B3D2E]">
                      {auteur
                        ? `${auteur.prenom?.charAt(0) ?? ""}${auteur.nom?.charAt(0) ?? ""}`.toUpperCase()
                        : "S"}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[#1C1B18]">
                          {auteur ? `${auteur.prenom} ${auteur.nom}` : "Système"}
                        </span>
                        <ModuleBadge module={j.module} />
                      </div>

                      <p className="mt-1 text-sm text-[#6B6459]">
                        {j.description || j.action}
                      </p>

                      {j.etablissement_id && (
                        <p className="mt-1 text-xs text-[#8A8272]">
                          {etablissementMap.get(j.etablissement_id) ?? ""}
                        </p>
                      )}
                    </div>

                    <span className="shrink-0 whitespace-nowrap text-xs text-[#8A8272]">
                      {new Date(j.created_at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-[#8A8272]">
              Aucune activité enregistrée pour le moment.
            </p>
          )}

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#F1EEE4] px-5 py-3 text-sm">
              <span className="text-[#8A8272]">
                Page {page} sur {totalPages}
              </span>
              <div className="flex gap-2">
                <a
                  href={buildPageHref(Math.max(1, page - 1))}
                  className={`rounded-lg border border-[#E7E2D6] px-3 py-1.5 ${
                    page <= 1
                      ? "pointer-events-none text-[#C9C4B6]"
                      : "text-[#1C1B18] hover:border-[#0B3D2E]/30"
                  }`}
                >
                  Précédent
                </a>
                <a
                  href={buildPageHref(Math.min(totalPages, page + 1))}
                  className={`rounded-lg border border-[#E7E2D6] px-3 py-1.5 ${
                    page >= totalPages
                      ? "pointer-events-none text-[#C9C4B6]"
                      : "text-[#1C1B18] hover:border-[#0B3D2E]/30"
                  }`}
                >
                  Suivant
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
        }
