import { NextResponse } from 'next/server';
import { contexteDirection, messageErreur } from '@/lib/univ-serveur';
import { PARAMETRES_UNIV_PAR_DEFAUT, normaliserParametres } from '@/lib/univ-calcul';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await contexteDirection();
  if ('erreur' in ctx) return ctx.erreur;
  const { data, error } = await ctx.admin.from('univ_parametres').select('options')
    .eq('etablissement_id', ctx.etablissementId).maybeSingle();
  if (error || !data) return NextResponse.json({ parametres: PARAMETRES_UNIV_PAR_DEFAUT });
  return NextResponse.json({ parametres: normaliserParametres(data.options) });
}

export async function POST(req: Request) {
  const ctx = await contexteDirection();
  if ('erreur' in ctx) return ctx.erreur;
  const body = await req.json().catch(() => ({}));
  const parametres = normaliserParametres(body?.parametres);
  const { error } = await ctx.admin.from('univ_parametres').upsert(
    { etablissement_id: ctx.etablissementId, options: parametres, modifie_le: new Date().toISOString() },
    { onConflict: 'etablissement_id' });
  if (error) return NextResponse.json({ error: messageErreur(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true, parametres });
}
