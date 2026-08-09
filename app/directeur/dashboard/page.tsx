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

function ActionCard({
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

      <p className="mt-1 text-xs text-neutral-500">
        {description}
      </p>
    </Link>
  );
}

export default async function DirecteurDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Profil du directeur
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
            Votre compte Directeur des études n'est associé à aucun
            établissement.
          </p>
        </div>
      </main>
    );
  }

  // Établissement
  const { data: etablissement } = await supabase
    .from("etablissements")
    .select("nom, ville, annee_scolaire_active")
    .eq("id", etablissementId)
    .single();

  // Données pédagogiques
  const [
    classesResult,
    matieresResult,
    notesResult,
    absencesResult,
    enseignantsResult,
  ] = await Promise.all([
    supabase
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("etablissement_id", etablissementId),

    supabase
      .from("matieres")
      .select("id", { count: "exact", head: true })
      .eq("etablissement_id", etablissementId),

    supabase
      .from("notes")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("absences")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("etablissement_id", etablissementId)
      .eq("role", "enseignant"),
  ]);

  const nombreClasses = classesResult.count ?? 0;
  const nombreMatieres = matieresResult.count ?? 0;
  const nombreNotes = notesResult.count ?? 0;
  const nombreAbsences = absencesResult.count ?? 0;
  const nombreEnseignants = enseignantsResult.count ?? 0;

  return (
    <main className="min-h-screen bg-neutral-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">

        {/* EN-TÊTE */}
        <header className="mb-8">
          <p className="mb-1 text-sm font-medium text-neutral-500">
            EGS • Direction des études
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
                Bonjour
                {profile?.prenom
                  ? `, ${profile.prenom}`
                  : ""}{" "}
                👋
              </h1>

              <p className="mt-2 text-sm text-neutral-500 sm:text-base">
                Voici la situation pédagogique de votre établissement.
              </p>

              <p className="mt-2 text-sm font-medium text-neutral-700">
                {etablissement?.nom ?? "Établissement"}
                {etablissement?.ville
                  ? ` • ${etablissement.ville}`
                  : ""}
              </p>

              {etablissement?.annee_scolaire_active && (
                <p className="mt-1 text-xs text-neutral-500">
                  Année scolaire :{" "}
                  {etablissement.annee_scolaire_active}
                </p>
              )}
            </div>

            <Link
              href="/emploi-du-temps"
              className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              📅 Emploi du temps
            </Link>
          </div>
        </header>

        {/* STATISTIQUES PÉDAGOGIQUES */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <StatCard
            label="Classes"
            value={nombreClasses}
            description="Classes de l'établissement"
          />

          <StatCard
            label="Matières"
            value={nombreMatieres}
            description="Matières configurées"
          />

          <StatCard
            label="Notes"
            value={nombreNotes}
            description="Notes enregistrées"
          />

          <StatCard
            label="Absences"
            value={nombreAbsences}
            description="Absences enregistrées"
          />

        </section>

        {/* CONTENU PRINCIPAL */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">

          {/* SUIVI PÉDAGOGIQUE */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">

            <div className="mb-6">
              <h2 className="font-semibold text-neutral-950">
                Suivi pédagogique
              </h2>

              <p className="mt-1 text-sm text-neutral-500">
                Les principaux indicateurs de l'activité pédagogique.
              </p>
            </div>

            <div className="space-y-5">

              <div className="rounded-xl bg-neutral-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-neutral-900">
                      Enseignants
                    </p>

                    <p className="mt-1 text-xs text-neutral-500">
                      Enseignants rattachés à l'établissement
                    </p>
                  </div>

                  <span className="text-xl font-semibold text-neutral-900">
                    {nombreEnseignants}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-neutral-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-neutral-900">
                      Notes saisies
                    </p>

                    <p className="mt-1 text-xs text-neutral-500">
                      Suivi des évaluations enregistrées
                    </p>
                  </div>

                  <span className="text-xl font-semibold text-neutral-900">
                    {nombreNotes}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-neutral-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-neutral-900">
                      Absences
                    </p>

                    <p className="mt-1 text-xs text-neutral-500">
                      Absences actuellement enregistrées
                    </p>
                  </div>

                  <span className="text-xl font-semibold text-neutral-900">
                    {nombreAbsences}
                  </span>
                </div>
              </div>

            </div>

          </div>

          {/* ACTIONS RAPIDES */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">

            <h2 className="font-semibold text-neutral-950">
              Actions pédagogiques
            </h2>

            <p className="mt-1 text-sm text-neutral-500">
              Accès rapide aux outils de la direction des études.
            </p>

            <div className="mt-5 grid gap-3">

              <ActionCard
                href="/emploi-du-temps"
                title="📅 Emploi du temps"
                description="Organiser et consulter les horaires."
              />

              <ActionCard
                href="/absences"
                title="❌ Suivi des absences"
                description="Consulter les absences des élèves."
              />

              <ActionCard
                href="/directeur/notes"
                title="📝 Suivi des notes"
                description="Contrôler les évaluations et les résultats."
              />

              <ActionCard
                href="/directeur/bulletins"
                title="📄 Bulletins"
                description="Suivre la préparation et la validation."
              />

            </div>

          </div>

        </section>

        {/* MODULES DE LA DIRECTION DES ÉTUDES */}
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">

          <div className="mb-5">
            <h2 className="font-semibold text-neutral-950">
              Gestion pédagogique
            </h2>

            <p className="mt-1 text-sm text-neutral-500">
              Les principaux modules de la direction des études.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

            <ActionCard
              href="/emploi-du-temps"
              title="Emploi du temps"
              description="Classes, enseignants et créneaux."
            />

            <ActionCard
              href="/directeur/notes"
              title="Notes"
              description="Suivi et contrôle des notes."
            />

            <ActionCard
              href="/directeur/bulletins"
              title="Bulletins"
              description="Préparation et validation."
            />

            <ActionCard
              href="/absences"
              title="Absences"
              description="Suivi des absences et justifications."
            />

            <ActionCard
              href="/directeur/classes"
              title="Classes"
              description="Organisation pédagogique des classes."
            />

            <ActionCard
              href="/directeur/matieres"
              title="Matières"
              description="Gestion des matières enseignées."
            />

          </div>

        </section>

      </div>
    </main>
  );
}
