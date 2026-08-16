import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RepartitionFinanciereChart from "./repartition-chart";

function formatMoney(value: number) {
  return `${value.toLocaleString("fr-FR")} F`;
}

function StatCard({
  label,
  value,
  description,
  href,
}: {
  label: string;
  value: string | number;
  description: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
        {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
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
      <p className="mt-1 text-xs text-neutral-500">{description}</p>
    </Link>
  );
}

export default async function ComptableDashboard() {
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
            Votre compte comptable n'est associé à aucun établissement.
          </p>
        </div>
      </main>
    );
  }

  const { data: etablissement } = await supabase
    .from("etablissements")
    .select("nom, ville, annee_scolaire_active")
    .eq("id", etablissementId)
    .single();

  const { data: frais } = await supabase
    .from("frais_scolarite")
    .select("id, eleve_id, annee_scolaire, montant_total, montant_paye, date_echeance")
    .eq("annee_scolaire", etablissement?.annee_scolaire_active ?? "");

  const lignesFrais = frais ?? [];

  const totalFacture = lignesFrais.reduce(
    (total, ligne) => total + Number(ligne.montant_total || 0),
    0
  );

  const totalPaye = lignesFrais.reduce(
    (total, ligne) => total + Number(ligne.montant_paye || 0),
    0
  );

  const resteAPayer = Math.max(totalFacture - totalPaye, 0);

  const tauxRecouvrement =
    totalFacture > 0 ? Math.round((totalPaye / totalFacture) * 100) : 0;

  const aujourdHui = new Date().toISOString().split("T")[0];

  const echeances = lignesFrais.filter(
    (ligne) =>
      Number(ligne.montant_total || 0) > Number(ligne.montant_paye || 0) &&
      ligne.date_echeance &&
      ligne.date_echeance < aujourdHui
  ).length;

  const donneesRepartition = [
    { nom: "Encaissé", valeur: totalPaye, couleur: "#16a34a" },
    { nom: "Reste à payer", valeur: resteAPayer, couleur: "#dc2626" },
  ];

  return (
    <main className="min-h-screen bg-neutral-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="mb-1 text-sm font-medium text-neutral-500">
            EGS • Comptabilité
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
                Bonjour{profile?.prenom ? `, ${profile.prenom}` : ""} 👋
              </h1>
              <p className="mt-2 text-sm text-neutral-500 sm:text-base">
                Voici la situation financière de votre établissement.
              </p>
              <p className="mt-2 text-sm font-medium text-neutral-700">
                {etablissement?.nom ?? "Établissement"}
                {etablissement?.ville ? ` • ${etablissement.ville}` : ""}
              </p>
              {etablissement?.annee_scolaire_active && (
                <p className="mt-1 text-xs text-neutral-500">
                  Année scolaire : {etablissement.annee_scolaire_active}
                </p>
              )}
            </div>

            <Link
              href="/finances/rapports"
              className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              📊 Rapports financiers
            </Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total facturé"
            value={formatMoney(totalFacture)}
            description="Frais de scolarité"
          />
          <StatCard
            label="Total encaissé"
            value={formatMoney(totalPaye)}
            description="Montants déjà payés"
          />
          <StatCard
            label="Reste à payer"
            value={formatMoney(resteAPayer)}
            description="Montant restant à recouvrer"
          />
          <StatCard
            label="Échéances dépassées"
            value={echeances}
            description="Dossiers avec retard de paiement"
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="font-semibold text-neutral-950">
                Répartition financière
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Encaissé vs reste à payer.
              </p>
            </div>
            <RepartitionFinanciereChart data={donneesRepartition} />

            <div className="mt-5 rounded-xl bg-neutral-50 p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-neutral-500">Taux de recouvrement</p>
                  <p className="mt-1 text-3xl font-semibold text-neutral-950">
                    {tauxRecouvrement}%
                  </p>
                </div>
                <p className="text-sm font-medium text-neutral-600">
                  {formatMoney(totalPaye)} / {formatMoney(totalFacture)}
                </p>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-neutral-900 transition-all"
                  style={{ width: `${Math.min(tauxRecouvrement, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-neutral-950">Actions comptables</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Accès rapide aux opérations financières.
            </p>

            <div className="mt-5 grid gap-3">
              <ActionCard
                href="/chef/comptabilite/frais"
                title="💰 Frais de scolarité"
                description="Consulter les frais et situations des élèves."
              />
              <ActionCard
                href="/finances/rapports"
                title="📊 Rapports financiers"
                description="Consulter les états et synthèses financières."
              />
              <ActionCard
                href="/direction/relances"
                title="🔔 Relances"
                description="Suivre les dossiers présentant des impayés."
              />
              <ActionCard
                href="/finances/rapports"
                title="💳 Registre des paiements"
                description="Voir tous les règlements enregistrés."
              />
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="font-semibold text-neutral-950">
              Situations à surveiller
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Dossiers présentant encore un montant à recouvrer.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm">
              <thead className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-3">Élève</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Payé</th>
                  <th className="px-3 py-3">Reste</th>
                  <th className="px-3 py-3">Échéance</th>
                </tr>
              </thead>
              <tbody>
                {lignesFrais
                  .filter(
                    (ligne) =>
                      Number(ligne.montant_total || 0) > Number(ligne.montant_paye || 0)
                  )
                  .sort((a, b) => Number(b.montant_total) - Number(a.montant_total))
                  .slice(0, 8)
                  .map((ligne) => {
                    const reste =
                      Number(ligne.montant_total || 0) - Number(ligne.montant_paye || 0);
                    return (
                      <tr key={ligne.id} className="border-t border-neutral-100">
                        <td className="px-3 py-4 font-medium text-neutral-900">
                          {ligne.eleve_id}
                        </td>
                        <td className="px-3 py-4">
                          {formatMoney(Number(ligne.montant_total || 0))}
                        </td>
                        <td className="px-3 py-4">
                          {formatMoney(Number(ligne.montant_paye || 0))}
                        </td>
                        <td className="px-3 py-4 font-medium">{formatMoney(reste)}</td>
                        <td className="px-3 py-4 text-neutral-500">
                          {ligne.date_echeance
                            ? new Date(ligne.date_echeance).toLocaleDateString("fr-FR")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}

                {lignesFrais.filter(
                  (ligne) =>
                    Number(ligne.montant_total || 0) > Number(ligne.montant_paye || 0)
                ).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-sm text-neutral-500">
                      Aucun impayé à afficher.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
