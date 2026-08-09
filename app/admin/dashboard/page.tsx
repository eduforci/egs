import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

function StatCard({
  label,
  value,
  description,
  href,
}: {
  label: string;
  value: number;
  description: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-500">{label}</p>

          <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            {value.toLocaleString("fr-FR")}
          </p>

          <p className="mt-1 text-xs text-neutral-500">
            {description}
          </p>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
          <span className="text-lg font-semibold">
            {label.charAt(0)}
          </span>
        </div>
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

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

export default async function AdminDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    profileResult,
    etablissementsResult,
    enseignantsResult,
    elevesResult,
    classesResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("prenom, nom")
      .eq("id", user?.id ?? "")
      .maybeSingle(),

    supabase
      .from("etablissements")
      .select("id, nom, ville, statut, created_at")
      .order("created_at", { ascending: false }),

    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "enseignant"),

    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "eleve"),

    supabase
      .from("classes")
      .select("id", { count: "exact", head: true }),
  ]);

  const etablissements = etablissementsResult.data ?? [];

  const totalEtablissements = etablissements.length;

  const actifs = etablissements.filter(
    (e) => e.statut === "actif"
  ).length;

  const enAttente = etablissements.filter(
    (e) => e.statut === "en_attente"
  ).length;

  const suspendus = etablissements.filter(
    (e) => e.statut === "suspendu" || e.statut === "expire"
  ).length;

  const userProfile = profileResult.data;

  return (
    <main className="min-h-screen bg-neutral-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">

        {/* EN-TÊTE */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-sm font-medium text-neutral-500">
              EGS • Super Admin
            </p>

            <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
              Bonjour
              {userProfile?.prenom
                ? `, ${userProfile.prenom}`
                : ""}{" "}
              👋
            </h1>

            <p className="mt-2 text-sm text-neutral-500 sm:text-base">
              Voici une vue globale de votre plateforme de gestion scolaire.
            </p>
          </div>

          <Link
            href="/admin/etablissements/nouveau"
            className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            + Nouvel établissement
          </Link>
        </header>

        {/* STATISTIQUES */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <StatCard
            label="Établissements"
            value={totalEtablissements}
            description={`${actifs} actif(s) actuellement`}
            href="/admin/etablissements"
          />

          <StatCard
            label="Élèves"
            value={elevesResult.count ?? 0}
            description="Profils élèves enregistrés"
          />

          <StatCard
            label="Enseignants"
            value={enseignantsResult.count ?? 0}
            description="Profils enseignants enregistrés"
          />

          <StatCard
            label="Classes"
            value={classesResult.count ?? 0}
            description="Classes configurées"
          />

        </section>

        {/* CONTENU PRINCIPAL */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">

          {/* ÉTABLISSEMENTS RÉCENTS */}
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">

            <div className="flex items-center justify-between border-b border-neutral-100 p-5">

              <div>
                <h2 className="font-semibold text-neutral-950">
                  Établissements récents
                </h2>

                <p className="mt-1 text-xs text-neutral-500">
                  Les derniers établissements enregistrés dans EGS.
                </p>
              </div>

              <Link
                href="/admin/etablissements"
                className="text-sm font-medium text-neutral-700 hover:text-black"
              >
                Voir tout →
              </Link>

            </div>

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">
                      Établissement
                    </th>

                    <th className="px-5 py-3 font-medium">
                      Ville
                    </th>

                    <th className="px-5 py-3 font-medium">
                      Statut
                    </th>
                  </tr>
                </thead>

                <tbody>

                  {etablissements.slice(0, 6).map((etablissement) => (
                    <tr
                      key={etablissement.id}
                      className="border-t border-neutral-100"
                    >
                      <td className="px-5 py-4 font-medium text-neutral-900">
                        {etablissement.nom}
                      </td>

                      <td className="px-5 py-4 text-neutral-500">
                        {etablissement.ville || "—"}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge
                          status={etablissement.statut}
                        />
                      </td>
                    </tr>
                  ))}

                  {etablissements.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-10 text-center text-sm text-neutral-500"
                      >
                        Aucun établissement enregistré pour le moment.
                      </td>
                    </tr>
                  )}

                </tbody>

              </table>

            </div>
          </div>

          {/* ABONNEMENTS */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">

            <h2 className="font-semibold text-neutral-950">
              État des abonnements
            </h2>

            <p className="mt-1 text-xs text-neutral-500">
              Répartition actuelle des établissements.
            </p>

            <div className="mt-6 space-y-4">

              {/* ACTIFS */}
              <div>

                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-neutral-600">
                    Actifs
                  </span>

                  <span className="font-semibold text-neutral-900">
                    {actifs}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-neutral-900"
                    style={{
                      width: `${
                        totalEtablissements
                          ? (actifs / totalEtablissements) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

              </div>

              {/* EN ATTENTE */}
              <div>

                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-neutral-600">
                    En attente
                  </span>

                  <span className="font-semibold text-neutral-900">
                    {enAttente}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-neutral-500"
                    style={{
                      width: `${
                        totalEtablissements
                          ? (enAttente / totalEtablissements) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

              </div>

              {/* SUSPENDUS */}
              <div>

                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-neutral-600">
                    Suspendus / expirés
                  </span>

                  <span className="font-semibold text-neutral-900">
                    {suspendus}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-neutral-300"
                    style={{
                      width: `${
                        totalEtablissements
                          ? (suspendus / totalEtablissements) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

              </div>

            </div>

            {/* GESTION RAPIDE */}
            <div className="mt-8 rounded-xl bg-neutral-50 p-4">

              <p className="text-sm font-medium text-neutral-900">
                Gestion rapide
              </p>

              <div className="mt-3 grid gap-2">

                <Link
                  href="/admin/etablissements"
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 hover:border-neutral-300"
                >
                  Gérer les établissements →
                </Link>

                <Link
                  href="/admin/etablissements/nouveau"
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 hover:border-neutral-300"
                >
                  Ajouter un établissement →
                </Link>

              </div>
            </div>

          </div>

        </section>

      </div>
    </main>
  );
        }
