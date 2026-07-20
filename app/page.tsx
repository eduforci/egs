import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const DASHBOARD_BY_ROLE: Record<string, string> = {
  super_admin: "/admin/dashboard",
  chef: "/chef/dashboard",
  enseignant: "/prof/dashboard",
  parent: "/parent/dashboard",
  eleve: "/eleve/dashboard",
};

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  redirect(profile?.role ? DASHBOARD_BY_ROLE[profile.role] : "/login");
}
