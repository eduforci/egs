import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const planLabels: Record<string, string> = {
  essentiel: "Essentiel",
  standard: "Standard",
  premium: "Premium",
};

const planStyles: Record<string, string> = {
  essentiel: "bg-neutral-100 text-neutral-700 border-neutral-200",
  standard: "bg-blue-50 text-blue-700 border-blue-200",
  premium: "bg-[#C9962B]/15 text-[#8A6A1A] border-[#C9962B]/30",
};

function PlanBadge({ plan }: { plan: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
        planStyles[plan] ?? "bg-neutral-100 text-neutral-600 border-neutral-200"
      }`}
    >
      {planLabels[plan] ?? plan}
    </span>
  );
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

export default async function AbonnementsListe() {
  const supabase = await createClient();

  const { data: abonnements } = await supabase
    .from("abonnements")
    .select(
      "id, etablissement_id, plan, statut, montant_mensuel, devise, date_debut, date_prochain_paiement"
    )
    .order("created_at", { ascending: false });

  const etablissementIds = Array.from(
    new Set((abonnements ?? []).map((a) => a.etablissement_id))
  );

  const { data: etablissements } =
    etablissementIds.length > 0
      ? await supabase
          .from("etablissements")
          .select("id, nom, ville")
          .in("id", etablissementIds)
      : { data: [] as { id: string; nom: string; ville: string }[] };

  const etablissementMap = new Map(
    (etablissements ?? []).map((e) => [e.id, e])
  );

  const total = abonnements?.length ?? 0;
  const actifs = (abonnements ?? []).filter((a) => a.statut === "actif").length;
  const revenuMensuel = (abonnements ?? [])
    .filter((a) => a.statut === "actif")
    .reduce((sum, a) => sum + Number(a.montant_mensuel ?? 0), 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* EN-TÊTE */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-sm font-medium text-[#0B3D2E]">
              Tableau de bord / Abonnements
            </p>

            <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1C1B18] sm:text-4xl">
              Abonnements
            </h1>

            <p className="mt-2 text-sm text-[#8A8272]">
              {total} abonnement(s) enregistré(s)
            </p>
          </div>

          <Link
            href="/admin/abonnements/nouveau"
            className="inline-flex items-center justify-center rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#082C21]"
          >
            + Nouvel abonnement
          </Link>
        </header>

        {/* STATS */}
        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#E7E2D6] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[#8A8272]">Total abonnements</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#1C1B18]">
              {total}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E7E2D6] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[#8A8272]">Actifs</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#1C1B18]">
              {actifs}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E7E2D6] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[#8A8272]">Revenu mensuel (actifs)</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#1C1B18]">
              {revenuMensuel.toLocaleString("fr-FR")} XOF
            </p>
          </div>
        </section>

        {/* TABLEAU */}
        <div className="overflow-hidden rounded-2xl border border-[#E7E2D6] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF8F3] text-left text-xs uppercase tracking-wide text-[#8A8272]">
                <tr>
                  <th className="px-5 py-3 font-medium">Établissement</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Montant</th>
                  <th className="px-5 py-3 font-medium">Prochain paiement</th>
                </tr>
              </thead>

              <tbody>
                {abonnements?.map((a) => {
                  const etab = etablissementMap.get(a.etablissement_id);

                  return (
                    <tr key={a.id} className="border-t border-[#F1EEE4]">
                      <td className="px-5 py-4">
                        <p className="font-medium text-[#1C1B18]">
                          {etab?.nom ?? "—"}
                        </p>
                        <p className="text-xs text-[#8A8272]">{etab?.ville}</p>
                      </td>
                      <td className="px-5 py-4">
                        <PlanBadge plan={a.plan} />
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={a.statut} />
                      </td>
                      <td className="px-5 py-4 text-[#1C1B18]">
                        {Number(a.montant_mensuel).toLocaleString("fr-FR")} {a.devise}
                      </td>
                      <td className="px-5 py-4 text-[#8A8272]">
                        {a.date_prochain_paiement
                          ? new Date(a.date_prochain_paiement).toLocaleDateString("fr-FR")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {(!abonnements || abonnements.length === 0) && (
              <p className="px-5 py-10 text-center text-sm text-[#8A8272]">
                Aucun abonnement pour le moment.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
    }
