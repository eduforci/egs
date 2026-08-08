import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export default async function DebugPage() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  return (
    <pre style={{ padding: 20, fontSize: 13, whiteSpace: "pre-wrap", background: "#111", color: "#0f0" }}>
      {JSON.stringify(
        {
          nombreCookies: allCookies.length,
          nomsCookies: allCookies.map((c) => c.name),
          utilisateurConnecte: user ? { id: user.id, email: user.email } : null,
          erreur: error?.message ?? null,
        },
        null,
        2
      )}
    </pre>
  );
}
