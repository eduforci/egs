"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function marquerToutesNotificationsLues() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("notifications")
    .update({ lu: true })
    .eq("destinataire_id", user.id)
    .eq("lu", false);

  revalidatePath("/admin", "layout");
}

export async function marquerNotificationLue(id: string) {
  const supabase = await createClient();
  await supabase.from("notifications").update({ lu: true }).eq("id", id);
  revalidatePath("/admin", "layout");
}

export async function marquerMessageTraite(formData: FormData) {
  const id = formData.get("id") as string;
  const reponse = formData.get("reponse") as string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("messages_support")
    .update({
      statut: "traite",
      reponse: reponse || null,
      repondu_par: user?.id ?? null,
      repondu_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/${id}`);
}
