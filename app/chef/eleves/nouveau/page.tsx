import { createClient } from "@/lib/supabase/server";
import NouvelEleveForm from "./nouvel-eleve-form";

export const dynamic = "force-dynamic";

export default async function NouvelElevePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("etablissement_id")
    .eq("id", user?.id)
    .single();

  const { data: classes } = await supabase
    .from("classes")
    .select("id, nom, niveau, annee_scolaire")
    .eq("etablissement_id", profile?.etablissement_id ?? "")
    .order("nom", { ascending: true });

  return <NouvelEleveForm classes={classes ?? []} />;
}
