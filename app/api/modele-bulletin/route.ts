import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { MODELE_PAR_DEFAUT, normaliserModele } from '@/lib/modele-bulletin';

export const dynamic = 'force-dynamic';

const ROLES_ECRITURE = ['administration', 'chef', 'directeur', 'directeur_etudes', 'super_admin'];

async function contexte() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) };
  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil?.etablissement_id) return { erreur: NextResponse.json({ modele: MODELE_PAR_DEFAUT }) };
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { admin, profil, etablissementId: profil.etablissement_id as string };
}

// Modèle de bulletin de l'école : lisible par tous les rôles de l'école (parents compris).
// Si la table n'existe pas encore ou si rien n'est réglé, on renvoie le modèle officiel complet.
export async function GET() {
  const ctx = await contexte();
  if ('erreur' in ctx) return ctx.erreur;
  const { data, error } = await ctx.admin.from('modeles_bulletin').select('options')
    .eq('etablissement_id', ctx.etablissementId).maybeSingle();
  if (error || !data) return NextResponse.json({ modele: MODELE_PAR_DEFAUT });
  return NextResponse.json({ modele: normaliserModele(data.options) });
}

// Enregistrement du modèle, réservé à la direction.
export async function POST(req: Request) {
  const ctx = await contexte();
  if ('erreur' in ctx) return ctx.erreur;
  if (!ROLES_ECRITURE.includes(String(ctx.profil.role)))
    return NextResponse.json({ error: "Réservé à la direction de l'école." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const modele = normaliserModele(body?.modele);
  const { error } = await ctx.admin.from('modeles_bulletin').upsert(
    { etablissement_id: ctx.etablissementId, options: modele, modifie_le: new Date().toISOString() },
    { onConflict: 'etablissement_id' });
  if (error) {
    const manque = /modeles_bulletin/i.test(error.message) && /(does not exist|schema cache|relation)/i.test(error.message);
    return NextResponse.json(
      { error: manque ? "La table des modèles n'existe pas encore : lancez d'abord le script SQL migration_modele_bulletin." : error.message },
      { status: 500 });
  }
  return NextResponse.json({ ok: true, modele });
}
