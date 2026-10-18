import { NextResponse } from 'next/server';
import { contexteDirection, messageErreur } from '@/lib/univ-serveur';

export const dynamic = 'force-dynamic';

const texte = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max);
const nombre = (v: unknown) => {
  const x = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};

// Structure complète de l'école : parcours, UE, matières.
export async function GET() {
  const ctx = await contexteDirection();
  if ('erreur' in ctx) return ctx.erreur;
  const e = ctx.etablissementId;
  const [p, u, c] = await Promise.all([
    ctx.admin.from('univ_parcours').select('id, nom').eq('etablissement_id', e).order('nom'),
    ctx.admin.from('univ_ue').select('id, parcours_id, semestre, code, intitule, credits').eq('etablissement_id', e),
    ctx.admin.from('univ_ec').select('id, ue_id, intitule, coefficient').eq('etablissement_id', e),
  ]);
  const err = p.error || u.error || c.error;
  if (err) return NextResponse.json({ error: messageErreur(err.message) }, { status: 500 });
  return NextResponse.json({ parcours: p.data ?? [], ues: u.data ?? [], ecs: c.data ?? [] });
}

// Actions : ajouter_parcours, ajouter_ue, ajouter_ec, supprimer (type + id)
export async function POST(req: Request) {
  const ctx = await contexteDirection();
  if ('erreur' in ctx) return ctx.erreur;
  const b = await req.json().catch(() => ({}));
  const e = ctx.etablissementId;
  const fin = (error: { message: string } | null) =>
    error ? NextResponse.json({ error: messageErreur(error.message) }, { status: 500 }) : NextResponse.json({ ok: true });

  if (b.action === 'ajouter_parcours') {
    const nom = texte(b.nom);
    if (!nom) return NextResponse.json({ error: 'Nom du parcours obligatoire.' }, { status: 400 });
    const { error } = await ctx.admin.from('univ_parcours').insert({ etablissement_id: e, nom });
    return fin(error);
  }
  if (b.action === 'ajouter_ue') {
    const intitule = texte(b.intitule);
    const semestre = Math.trunc(nombre(b.semestre));
    const credits = nombre(b.credits);
    if (!intitule || !(semestre >= 1 && semestre <= 12) || !(credits >= 0))
      return NextResponse.json({ error: 'Intitulé, semestre (1 à 12) et crédits obligatoires.' }, { status: 400 });
    const { data: par } = await ctx.admin.from('univ_parcours').select('id').eq('id', b.parcours_id).eq('etablissement_id', e).maybeSingle();
    if (!par) return NextResponse.json({ error: 'Parcours introuvable.' }, { status: 404 });
    const { error } = await ctx.admin.from('univ_ue').insert({
      etablissement_id: e, parcours_id: par.id, semestre, code: texte(b.code, 20) || null, intitule, credits,
    });
    return fin(error);
  }
  if (b.action === 'ajouter_ec') {
    const intitule = texte(b.intitule);
    const coefficient = nombre(b.coefficient);
    if (!intitule || !(coefficient > 0)) return NextResponse.json({ error: 'Intitulé et coefficient (> 0) obligatoires.' }, { status: 400 });
    const { data: ue } = await ctx.admin.from('univ_ue').select('id').eq('id', b.ue_id).eq('etablissement_id', e).maybeSingle();
    if (!ue) return NextResponse.json({ error: 'UE introuvable.' }, { status: 404 });
    const { error } = await ctx.admin.from('univ_ec').insert({ etablissement_id: e, ue_id: ue.id, intitule, coefficient });
    return fin(error);
  }
  if (b.action === 'supprimer') {
    const table = ({ parcours: 'univ_parcours', ue: 'univ_ue', ec: 'univ_ec' } as Record<string, string>)[String(b.type)];
    if (!table) return NextResponse.json({ error: 'Type inconnu.' }, { status: 400 });
    const { error } = await ctx.admin.from(table).delete().eq('id', b.id).eq('etablissement_id', e);
    return fin(error);
  }
  return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
}
