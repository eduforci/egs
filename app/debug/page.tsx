import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export default async function DebugPage() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  let profileResult = null;
  let profileError = null;

  if (user) {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, must_change_password")
      .eq("id", user.id)
      .single();
    profileResult = data;
    profileError = error;
  }

  return (
    <pre style={{ padding: 20, fontSize: 13, whiteSpace: "pre-wrap", background: "#111", color: "#0f0" }}>
      {JSON.stringify(
        {
          nombreCookies: allCookies.length,
          utilisateurConnecte: user ? { id: user.id, email: user.email } : null,
          erreurUtilisateur: userError?.message ?? null,
          profil: profileResult,
          erreurProfil: profileError ? {
            message: profileError.message,
            code: profileError.code,
            details: profileError.details,
            hint: profileError.hint,
          } : null,
        },
        null,
        2
      )}
    </pre>
  );
          }
