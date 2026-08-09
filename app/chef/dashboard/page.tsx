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
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-sm font-medium text-neutral-500">{label}</p>

      <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
        {value.toLocaleString("fr-FR")}
      </p>

      <p className="mt-1 text-xs text-neutral-500">
        {description}
      </p>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}

function QuickAction({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-400 hover:shadow-sm"
    >
      <p className="font-medium text-neutral-900">{title}</p>
      <p className="mt-1 text-xs text-neutral-500">{description}</p>
    </Link>
  );
}

export default async function ChefDashboard() {
  const supabase = await createClient();

  // Utilisateur connecté
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Profil du chef
  const { data: profile } = await supabase
    .from("profiles")
    .select("nom, prenom, etablissement_id")
    .eq("id", user.id)
    .single();

  const etablissementId = profile?.etablissement_id;

  if (!etablissementId) {
    return (
      <main className="min-h-screen bg-neutral-50 p-6 sm:p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-semibold text-red-800">
            Établissement introuvable
          </h1>

          <p className="mt-2 text-sm text-red-700">
            Votre compte chef d'établissement n'est associé à aucun établissement.
          </p>
        </div>
      </main>
    );
  }

  // Établissement du chef
  const { data: etablissement } = await supabase
    .from("etablissements")
    .select("id, nom, ville, statut")
    .eq("id", etablissementId)
    .single();

  // Statistiques de l'établissement
  const [
    elevesResult,
    enseignantsResult,
    parentsResult,
    classesResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("etablissement_id", etablissementId)
      .eq("role", "eleve"),

    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("etablissement_id", etablissementId)
      .eq("role", "enseignant"),

    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("etablissement_id", etablissementId)
      .eq("role", "parent"),

    supabase
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("etablissement_id", etablissementId),
  ]);

  const nombreEleves = elevesResult.count ?? 0;
  const nombreEnseignants = enseignantsResult.count ?? 0;
  const nombreParents = parentsResult.count ?? 0;
  const nombreClasses = classesResult.count ?? 0;

  return (
    <main className="min-h-screen bg-neutral-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">

        {/* EN-TÊTE */}
        <header className="mb-8">
          <p className="mb-1 text-sm font-medium text-neutral-500">
            EGS • Chef d'établissement
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
                Bonjour{profile?.prenom ? `, ${profile.prenom}` : ""} 👋
              </h1>

              <p className="mt-2 text-sm text-neutral-500 sm:text-base">
                Voici la situation actuelle de votre établissement.
              </p>

              {etablissement && (
                <p className="mt-2 text-sm font-medium text-neutral-700">
                  {etablissement.nom}
                  {etablissement.ville
                    ? ` • ${etablissement.ville}`
                    : ""}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/chef/eleves/nouveau"
                className="rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
              >
                + Nouvel élève
              </Link>

              <Link
                href="/chef/dashboard"
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:border-neutral-300"
              >
                Actualiser
              </Link>
            </div>
          </div>
        </header>

        {/* STATISTIQUES */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <StatCard
            label="Élèves"
            value={nombreEleves}
            description="Élèves de l'établissement"
            href="/chef/eleves"
          />

          <StatCard
            label="Enseignants"
            value={nombreEnseignants}
            description="Enseignants enregistrés"
            href="/chef/enseignants"
          />

          <StatCard
            label="Parents"
            value={nombreParents}
            description="Parents enregistrés"
            href="/chef/parents"
          />

          <StatCard
            label="Classes"
            value={nombreClasses}
            description="Classes configurées"
          />

        </section>

        {/* CONTENU */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">

          {/* SITUATION */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">

            <div className="mb-6">
              <h2 className="font-semibold text-neutral-950">
                Situation de l'établissement
              </h2>

              <p className="mt-1 text-sm text-neutral-500">
                Vue synthétique de vos principaux effectifs.
              </p>
            </div>

            <div className="space-y-5">

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-neutral-600">
                    Élèves
                  </span>

                  <span className="font-semibold text-neutral-900">
                    {nombreEleves}
                  </span>
                </div>

                <div className="h-2 rounded-full bg-neutral-100">
                  <div
                    className="h-2 rounded-full bg-neutral-900"
                    style={{
                      width: `${Math.min(nombreEleves, 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-neutral-600">
                    Enseignants
                  </span>

                  <span className="font-semibold text-neutral-900">
                    {nombreEnseignants}
                  </span>
                </div>

                <div className="h-2 rounded-full bg-neutral-100">
                  <div
                    className="h-2 rounded-full bg-neutral-700"
                    style={{
                      width: `${Math.min(nombreEnseignants * 3, 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-neutral-600">
                    Parents
                  </span>

                  <span className="font-semibold text-neutral-900">
                    {nombreParents}
                  </span>
                </div>

                <div className="h-2 rounded-full bg-neutral-100">
                  <div
                    className="h-2 rounded-full bg-neutral-500"
                    style={{
                      width: `${Math.min(nombreParents, 100)}%`,
                    }}
                  />
                </div>
              </div>

            </div>

            <div className="mt-7 rounded-xl bg-neutral-50 p-4">
              <p className="text-sm font-medium text-neutral-900">
                Statut de l'établissement
              </p>

              <p className="mt-1 text-sm text-neutral-500">
                Abonnement :{" "}
                <span className="font-medium text-neutral-900">
                  {etablissement?.statut ?? "—"}
                </span>
              </p>
            </div>

          </div>

          {/* ACTIONS RAPIDES */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">

            <h2 className="font-semibold text-neutral-950">
              Actions rapides
            </h2>

            <p className="mt-1 text-sm text-neutral-500">
              Accédez rapidement aux opérations principales.
            </p>

            <div className="mt-5 grid gap-3">

              <QuickAction
                href="/chef/eleves/nouveau"
                title="+ Ajouter un élève"
                description="Enregistrer un nouvel élève."
              />

              <QuickAction
                href="/chef/enseignants"
                title="👨‍🏫 Gérer les enseignants"
                description="Consulter et gérer les enseignants."
              />

              <QuickAction
                href="/chef/eleves"
                title="🎓 Gérer les élèves"
                description="Consulter les élèves de l'établissement."
              />

              <QuickAction
                href="/chef/parents"
                title="👨‍👩‍👧 Gérer les parents"
                description="Consulter les parents et leurs enfants."
              />

            </div>

          </div>

        </section>

        {/* MODULES */}
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">

          <div className="mb-5">
            <h2 className="font-semibold text-neutral-950">
              Gestion de l'établissement
            </h2>

            <p className="mt-1 text-sm text-neutral-500">
              Accès aux principaux modules administratifs.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

            <QuickAction
              href="/chef/enseignants"
              title="Enseignants"
              description="Gestion des enseignants."
            />

            <QuickAction
              href="/chef/eleves"
              title="Élèves"
              description="Gestion des élèves."
            />

            <QuickAction
              href="/chef/parents"
              title="Parents"
              description="Gestion des parents."
            />

            <QuickAction
              href="/emploi-du-temps"
              title="Emploi du temps"
              description="Consulter les emplois du temps."
            />

          </div>

        </section>

      </div>
    </main>
  );
    }
