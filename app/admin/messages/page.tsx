import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const statutStyles: Record<string, string> = {
  nouveau: "bg-[#C9962B]/15 text-[#8A6A1A] border-[#C9962B]/30",
  lu: "bg-blue-50 text-blue-700 border-blue-200",
  traite: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const statutLabels: Record<string, string> = {
  nouveau: "Nouveau",
  lu: "Lu",
  traite: "Traité",
};

export default async function MessagesListe() {
  const supabase = await createClient();

  const { data: messages } = await supabase
    .from("messages_support")
    .select("id, sujet, statut, created_at, etablissement_id")
    .order("created_at", { ascending: false });

  const etablissementIds = Array.from(
    new Set((messages ?? []).map((m) => m.etablissement_id))
  );

  const { data: etablissements } =
    etablissementIds.length > 0
      ? await supabase.from("etablissements").select("id, nom").in("id", etablissementIds)
      : { data: [] as { id: string; nom: string }[] };

  const etablissementMap = new Map((etablissements ?? []).map((e) => [e.id, e.nom]));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="mb-1 text-sm font-medium text-[#0B3D2E]">
            Tableau de bord / Messages
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1C1B18] sm:text-4xl">
            Messages de support
          </h1>
          <p className="mt-2 text-sm text-[#8A8272]">
            {messages?.length ?? 0} message(s)
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-[#E7E2D6] bg-white shadow-sm">
          {messages && messages.length > 0 ? (
            <ul className="divide-y divide-[#F1EEE4]">
              {messages.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/admin/messages/${m.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[#FAF8F3]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#1C1B18]">
                        {etablissementMap.get(m.etablissement_id) ?? "—"}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-[#8A8272]">{m.sujet}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statutStyles[m.statut]}`}
                      >
                        {statutLabels[m.statut]}
                      </span>
                      <span className="whitespace-nowrap text-xs text-[#8A8272]">
                        {new Date(m.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-[#8A8272]">
              Aucun message pour le moment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
                        }
