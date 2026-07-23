import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const DASHBOARD_BY_ROLE: Record<string, string> = {
  super_admin: "/admin/dashboard",
  chef: "/chef/dashboard",
  directeur_etudes: "/directeur/dashboard",
  comptable: "/comptable/dashboard",
  secretaire: "/secretariat/dashboard",
  enseignant: "/prof/dashboard",
  parent: "/parent/dashboard",
  eleve: "/eleve/dashboard",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, must_change_password")
    .eq("id", user.id)
    .single();

  if (profile?.must_change_password) redirect("/changer-mot-de-passe");

  redirect(profile?.role ? DASHBOARD_BY_ROLE[profile.role] : "/login");
}
