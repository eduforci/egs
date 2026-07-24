import { createClient } from "@supabase/supabase-js";

// ⚠️ Ce client utilise la clé secrète "service_role".
// Il ne doit JAMAIS être importé dans un composant "use client",
// uniquement dans des Route Handlers (app/api/**/route.ts) ou
// Server Components/Actions. Il contourne complètement la sécurité RLS.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
