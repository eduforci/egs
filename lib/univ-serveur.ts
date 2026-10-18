import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const ROLES_DIRECTION = ['administration', 'chef', 'directeur', 'directeur_etudes', 'super_admin'];

// Authentifie l'appelant (direction de l'école uniquement) et fournit le client de service.
export async function contexteDirection() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) };
  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil?.etablissement_id || !ROLES_DIRECTION.includes(String(profil.role)))
    return { erreur: NextResponse.json({ error: "Réservé à la direction de l'école." }, { status: 403 }) };
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { admin, etablissementId: profil.etablissement_id as string };
}

export function messageErreur(message: string): string {
  return /univ_/i.test(message) && /(does not exist|schema cache|relation)/i.test(message)
    ? "Les tables université n'existent pas encore : lancez d'abord le script SQL migration_universite."
    : message;
}
