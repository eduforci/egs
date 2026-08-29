import { createClient } from "@/lib/supabase/server";
import { marquerNotificationLue } from "../actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, titre, contenu, lien, lu, created_at")
    .eq("destinataire_id", user?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="mb-1 text-sm font-medium text-[#0B3D2E]">
            Tableau de bord / Notifications
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1C1B18] sm:text-4xl">
            Notifications
          </h1>
        </header>

        <div className="overflow-hidden rounded-2xl border border-[#E7E2D6] bg-white shadow-sm">
          {notifications && notifications.length > 0 ? (
            <ul className="divide-y divide-[#F1EEE4]">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start justify-between gap-4 px-5 py-4 ${
                    !n.lu ? "bg-[#0B3D2E]/5" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1C1B18]">{n.titre}</p>
                    <p className="mt-1 text-sm text-[#6B6459]">{n.contenu}</p>
                    <p className="mt-1 text-xs text-[#8A8272]">
                      {new Date(n.created_at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  {!n.lu && (
                    <form action={marquerNotificationLue.bind(null, n.id)}>
                      <button
                        type="submit"
                        className="shrink-0 whitespace-nowrap rounded-lg border border-[#E7E2D6] px-3 py-1.5 text-xs font-medium text-[#1C1B18] hover:border-[#0B3D2E]/30"
                      >
                        Marquer comme lu
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-[#8A8272]">
              Aucune notification.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
