import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function creerAbonnement(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const etablissement_id = formData.get("etablissement_id") as string;
  const plan = formData.get("plan") as string;
  const montant_mensuel = Number(formData.get("montant_mensuel"));
  const date_debut = formData.get("date_debut") as string;
  const date_prochain_paiement = formData.get("date_prochain_paiement") as string;

  await supabase.from("abonnements").insert({
    etablissement_id,
    plan,
    montant_mensuel,
    date_debut: date_debut || undefined,
    date_prochain_paiement: date_prochain_paiement || null,
    statut: "actif",
  });

  redirect("/admin/abonnements");
}

export default async function NouvelAbonnement() {
  const supabase = await createClient();

  const { data: etablissements } = await supabase
    .from("etablissements")
    .select("id, nom, ville")
    .order("nom", { ascending: true });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <p className="mb-1 text-sm font-medium text-[#0B3D2E]">
            Tableau de bord / Abonnements / Nouveau
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1C1B18]">
            Nouvel abonnement
          </h1>
        </header>

        <form
          action={creerAbonnement}
          className="space-y-5 rounded-2xl border border-[#E7E2D6] bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1C1B18]">
              Établissement
            </label>
            <select
              name="etablissement_id"
              required
              className="w-full rounded-xl border border-[#E7E2D6] px-3 py-2.5 text-sm focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]"
            >
              <option value="">Sélectionner...</option>
              {etablissements?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} {e.ville ? `— ${e.ville}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1C1B18]">
              Plan
            </label>
            <select
              name="plan"
              required
              className="w-full rounded-xl border border-[#E7E2D6] px-3 py-2.5 text-sm focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]"
            >
              <option value="essentiel">Essentiel</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1C1B18]">
              Montant mensuel (XOF)
            </label>
            <input
              type="number"
              name="montant_mensuel"
              min="0"
              step="1"
              required
              className="w-full rounded-xl border border-[#E7E2D6] px-3 py-2.5 text-sm focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#1C1B18]">
                Date de début
              </label>
              <input
                type="date"
                name="date_debut"
                className="w-full rounded-xl border border-[#E7E2D6] px-3 py-2.5 text-sm focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#1C1B18]">
                Prochain paiement
              </label>
              <input
                type="date"
                name="date_prochain_paiement"
                className="w-full rounded-xl border border-[#E7E2D6] px-3 py-2.5 text-sm focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <a
              href="/admin/abonnements"
              className="rounded-xl border border-[#E7E2D6] px-4 py-2.5 text-sm font-medium text-[#1C1B18] hover:bg-[#FAF8F3]"
            >
              Annuler
            </a>
            <button
              type="submit"
              className="rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#082C21]"
            >
              Créer l'abonnement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
          }
