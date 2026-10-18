import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { normaliserNb } from '@/lib/periodes';

export const dynamic = 'force-dynamic';

const ROLES_ECRITURE = ['administration', 'chef', 'directeur', 'directeur_etudes', 'super_admin'];

async function contexte() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) };
  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil?.etablissement_id) return { erreur: NextResponse.json({ nb: 3 }) };
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { admin, profil, etablissementId: profil.etablissement_id as string };
}

// Nombre de périodes de l'école : 3 (trimestres) ou 2 (semestres). Lisible par tous les rôles de l'école.
export async function GET() {
  const ctx = await contexte();
  if ('erreur' in ctx) return ctx.erreur;
  const { data } = await ctx.admin.from('parametres_pedagogiques').select('nb_trimestres')
    .eq('etablissement_id', ctx.etablissementId).maybeSingle();
  return NextResponse.json({ nb: normaliserNb(data?.nb_trimestres) });
}

// Changement du régime des périodes, réservé à la direction.
export async function POST(req: Request) {
  const ctx = await contexte();
  if ('erreur' in ctx) return ctx.erreur;
  if (!ROLES_ECRITURE.includes(String(ctx.profil.role)))
    return NextResponse.json({ error: "Réservé à la direction de l'école." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const nb = Number(body.nb);
  if (nb !== 2 && nb !== 3) return NextResponse.json({ error: 'Choix invalide (2 ou 3).' }, { status: 400 });

  const { data: existe } = await ctx.admin.from('parametres_pedagogiques').select('etablissement_id')
    .eq('etablissement_id', ctx.etablissementId).maybeSingle();
  if (!existe) return NextResponse.json({ error: 'Paramètres pédagogiques introuvables pour cette école.' }, { status: 404 });

  const { error } = await ctx.admin.from('parametres_pedagogiques').update({ nb_trimestres: nb })
    .eq('etablissement_id', ctx.etablissementId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, nb });
}
