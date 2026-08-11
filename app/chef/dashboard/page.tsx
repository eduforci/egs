import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RepartitionChart from "./repartition-chart";
import EvolutionChart from "./evolution-chart";

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
      <p className="mt-1 text-xs text-neutral-500">{description}</p>
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

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

  const { data: etablissement } = await supabase
    .from("etablissements")
    .select("id, nom, ville, statut")
    .eq("id", etablissementId)
    .single();

  const [elevesResult, enseignantsResult, parentsResult, classesResult] =
    await Promise.all([
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

  const donneesRepartition = [
    { nom: "Élèves", valeur: nombreEleves, couleur: "#171717" },
    { nom: "Enseignants", valeur: nombreEnseignants, couleur: "#525252" },
    { nom: "Parents", valeur: nombreParents, couleur: "#a3a3a3" },
  ];

  const MOIS_LABEL = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const aujourdHui = new Date();
  const ilYA6Mois = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth() - 5, 1);

  const { data: paiementsRecents } = await supabase
    .from("paiements")
    .select("montant, date_paiement")
    .eq("etablissement_id", etablissementId)
    .eq("annule", false)
    .gte("date_paiement", ilYA6Mois.toISOString().slice(0, 10));

  const moisRange: { cle: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth() - i, 1);
    moisRange.push({
      cle: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MOIS_LABEL[d.getMonth()],
    });
  }

  const totauxParMois = new Map(moisRange.map((m) => [m.cle, 0]));
  (paiementsRecents || []).forEach((p) => {
    const d = new Date(p.date_paiement);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (totauxParMois.has(cle)) {
      totauxParMois.set(cle, (totauxParMois.get(cle) || 0) + Number(p.montant));
    }
  });

  const donneesEvolution = moisRange.map((m) => ({
    mois: m.label,
    montant: totauxParMois.get(m.cle) || 0,
  }));

  return (
    <main className="min-h-screen bg-neutral-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
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
                  {etablissement.ville ? ` • ${etablissement.ville}` : ""}
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

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="font-semibold text-neutral-950">
                Répartition des effectifs
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Élèves, enseignants et parents de l'établissement.
              </p>
            </div>
            <RepartitionChart data={donneesRepartition} />
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="font-semibold text-neutral-950">
                Évolution des recettes
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                6 derniers mois, paiements encaissés.
              </p>
            </div>
            <EvolutionChart data={donneesEvolution} />
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-neutral-950">
              Statut de l'établissement
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Abonnement : <span className="font-medium text-neutral-900">{etablissement?.statut ?? "—"}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-neutral-950">Actions rapides</h2>
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
              href="/direction/emploi-du-temps"
              title="Emploi du temps"
              description="Consulter les emplois du temps."
            />
          </div>
        </section>
      </div>
    </main>
  );
                }
