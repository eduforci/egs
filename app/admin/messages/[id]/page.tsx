import { createClient } from "@/lib/supabase/server";
import { marquerMessageTraite } from "../../actions";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MessageDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: message } = await supabase
    .from("messages_support")
    .select(
      "id, sujet, message, statut, reponse, repondu_at, created_at, etablissement_id, expediteur_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (!message) notFound();

  // Marquer comme lu à la première ouverture
  if (message.statut === "nouveau") {
    await supabase.from("messages_support").update({ statut: "lu" }).eq("id", id);
  }

  const [{ data: etablissement }, { data: expediteur }] = await Promise.all([
    supabase.from("etablissements").select("nom, ville").eq("id", message.etablissement_id).maybeSingle(),
    message.expediteur_id
      ? supabase.from("profiles").select("prenom, nom, role").eq("id", message.expediteur_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <p className="mb-1 text-sm font-medium text-[#0B3D2E]">
            Tableau de bord / Messages / Détail
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1C1B18]">
            {message.sujet}
          </h1>
        </header>

        <div className="mb-6 rounded-2xl border border-[#E7E2D6] bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-[#8A8272]">
            <span className="font-medium text-[#1C1B18]">
              {etablissement?.nom ?? "Établissement inconnu"}
            </span>
            {etablissement?.ville && <span>· {etablissement.ville}</span>}
            {expediteur && (
              <span>
                · Envoyé par {expediteur.prenom} {expediteur.nom}
              </span>
            )}
            <span>
              ·{" "}
              {new Date(message.created_at).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          <p className="whitespace-pre-wrap text-sm text-[#1C1B18]">{message.message}</p>
        </div>

        {message.reponse && (
          <div className="mb-6 rounded-2xl border border-[#E7E2D6] bg-[#FAF8F3] p-6">
            <p className="mb-2 text-sm font-medium text-[#0B3D2E]">Votre réponse</p>
            <p className="whitespace-pre-wrap text-sm text-[#1C1B18]">{message.reponse}</p>
            {message.repondu_at && (
              <p className="mt-2 text-xs text-[#8A8272]">
                Répondu le{" "}
                {new Date(message.repondu_at).toLocaleDateString("fr-FR")}
              </p>
            )}
          </div>
        )}

        {message.statut !== "traite" && (
          <form
            action={marquerMessageTraite}
            className="space-y-4 rounded-2xl border border-[#E7E2D6] bg-white p-6 shadow-sm"
          >
            <input type="hidden" name="id" value={message.id} />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#1C1B18]">
                Réponse (optionnelle)
              </label>
              <textarea
                name="reponse"
                rows={4}
                className="w-full rounded-xl border border-[#E7E2D6] px-3 py-2.5 text-sm focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]"
                placeholder="Votre réponse à l'établissement..."
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#082C21]"
              >
                Marquer comme traité
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
