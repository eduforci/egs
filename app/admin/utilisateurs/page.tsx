import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  chef: "Chef d'établissement",
  directeur_etudes: "Directeur des études",
  enseignant: "Enseignant",
  comptable: "Comptable",
  caissier: "Caissier",
  secretaire: "Secrétaire",
  educateur: "Éducateur",
  parent: "Parent",
  eleve: "Élève",
};

const roleStyles: Record<string, string> = {
  super_admin: "bg-[#0B3D2E]/10 text-[#0B3D2E] border-[#0B3D2E]/20",
  chef: "bg-[#C9962B]/15 text-[#8A6A1A] border-[#C9962B]/30",
  directeur_etudes: "bg-blue-50 text-blue-700 border-blue-200",
  enseignant: "bg-violet-50 text-violet-700 border-violet-200",
  comptable: "bg-teal-50 text-teal-700 border-teal-200",
  caissier: "bg-cyan-50 text-cyan-700 border-cyan-200",
  secretaire: "bg-pink-50 text-pink-700 border-pink-200",
  educateur: "bg-orange-50 text-orange-700 border-orange-200",
  parent: "bg-neutral-100 text-neutral-700 border-neutral-200",
  eleve: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
        roleStyles[role] ?? "bg-neutral-100 text-neutral-600 border-neutral-200"
      }`}
    >
      {roleLabels[role] ?? role}
    </span>
  );
}

const PAGE_SIZE = 20;

export default async function UtilisateursListe({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const { q, role, page: pageParam } = await searchParams;
  const search = (q ?? "").trim();
  const roleFilter = role ?? "";
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select(
      "id, role, etablissement_id, nom, prenom, telephone, identifiant, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(
      `nom.ilike.%${search}%,prenom.ilike.%${search}%,identifiant.ilike.%${search}%`
    );
  }

  if (roleFilter) {
    query = query.eq("role", roleFilter);
  }

  const { data: profiles, count } = await query;

  // Jointure manuelle établissements (pas de FK déclarée entre profiles et etablissements)
  const etablissementIds = Array.from(
    new Set((profiles ?? []).map((p) => p.etablissement_id).filter(Boolean))
  ) as string[];

  const { data: etablissements } =
    etablissementIds.length > 0
      ? await supabase
          .from("etablissements")
          .select("id, nom")
          .in("id", etablissementIds)
      : { data: [] as { id: string; nom: string }[] };

  const etablissementMap = new Map(
    (etablissements ?? []).map((e) => [e.id, e.nom])
  );

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (roleFilter) params.set("role", roleFilter);
    params.set("page", String(targetPage));
    return `/admin/utilisateurs?${params.toString()}`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* EN-TÊTE */}
        <header className="mb-6">
          <p className="mb-1 text-sm font-medium text-[#0B3D2E]">
            Tableau de bord / Utilisateurs
          </p>

          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1C1B18] sm:text-4xl">
            Utilisateurs
          </h1>

          <p className="mt-2 text-sm text-[#8A8272]">
            {total} utilisateur(s){" "}
            {search || roleFilter ? "correspondant aux filtres" : "enregistré(s)"}
          </p>
        </header>

        {/* FILTRES */}
        <form method="GET" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-md">
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
              placeholder="Nom, prénom ou identifiant..."
              className="w-full rounded-xl border border-[#E7E2D6] bg-white py-2.5 pl-9 pr-3 text-sm text-[#1C1B18] placeholder:text-[#8A8272] focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]"
            />
          </div>

          <select
            name="role"
            defaultValue={roleFilter}
            className="rounded-xl border border-[#E7E2D6] bg-white px-3 py-2.5 text-sm text-[#1C1B18] focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]"
          >
            <option value="">Tous les rôles</option>
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
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

        {/* TABLEAU */}
        <div className="overflow-hidden rounded-2xl border border-[#E7E2D6] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF8F3] text-left text-xs uppercase tracking-wide text-[#8A8272]">
                <tr>
                  <th className="px-5 py-3 font-medium">Utilisateur</th>
                  <th className="px-5 py-3 font-medium">Rôle</th>
                  <th className="px-5 py-3 font-medium">Identifiant</th>
                  <th className="px-5 py-3 font-medium">Téléphone</th>
                  <th className="px-5 py-3 font-medium">Établissement</th>
                  <th className="px-5 py-3 font-medium">Inscrit le</th>
                </tr>
              </thead>

              <tbody>
                {profiles?.map((p) => {
                  const initials = `${p.prenom?.charAt(0) ?? ""}${
                    p.nom?.charAt(0) ?? ""
                  }`.toUpperCase();

                  return (
                    <tr key={p.id} className="border-t border-[#F1EEE4]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B3D2E]/10 text-xs font-semibold text-[#0B3D2E]">
                            {initials || "?"}
                          </div>
                          <span className="font-medium text-[#1C1B18]">
                            {p.prenom} {p.nom}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <RoleBadge role={p.role} />
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-[#6B6459]">
                        {p.identifiant || "—"}
                      </td>
                      <td className="px-5 py-4 text-[#8A8272]">
                        {p.telephone || "—"}
                      </td>
                      <td className="px-5 py-4 text-[#8A8272]">
                        {p.etablissement_id
                          ? etablissementMap.get(p.etablissement_id) ?? "—"
                          : "—"}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-[#8A8272]">
                        {new Date(p.created_at).toLocaleDateString("fr-FR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {(!profiles || profiles.length === 0) && (
              <p className="px-5 py-10 text-center text-sm text-[#8A8272]">
                Aucun utilisateur ne correspond aux filtres.
              </p>
            )}
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#F1EEE4] px-5 py-3 text-sm">
              <span className="text-[#8A8272]">
                Page {page} sur {totalPages}
              </span>
              <div className="flex gap-2">
                <Link
                  href={buildPageHref(Math.max(1, page - 1))}
                  aria-disabled={page <= 1}
                  className={`rounded-lg border border-[#E7E2D6] px-3 py-1.5 ${
                    page <= 1
                      ? "pointer-events-none text-[#C9C4B6]"
                      : "text-[#1C1B18] hover:border-[#0B3D2E]/30"
                  }`}
                >
                  Précédent
                </Link>
                <Link
                  href={buildPageHref(Math.min(totalPages, page + 1))}
                  aria-disabled={page >= totalPages}
                  className={`rounded-lg border border-[#E7E2D6] px-3 py-1.5 ${
                    page >= totalPages
                      ? "pointer-events-none text-[#C9C4B6]"
                      : "text-[#1C1B18] hover:border-[#0B3D2E]/30"
                  }`}
                >
                  Suivant
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
                                           }
