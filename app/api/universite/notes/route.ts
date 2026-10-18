import { NextResponse } from 'next/server';
import { contexteDirection, messageErreur } from '@/lib/univ-serveur';

export const dynamic = 'force-dynamic';

// GET ?etudiantId=&annee= : notes de l'étudiant pour l'année
export async function GET(req: Request) {
  const ctx = await contexteDirection();
  if ('erreur' in ctx) return ctx.erreur;
  const u = new URL(req.url);
  const etudiantId = u.searchParams.get('etudiantId');
  const annee = u.searchParams.get('annee');
  if (!etudiantId || !annee) return NextResponse.json({ error: 'Paramètres manquants.' }, { status: 400 });
  const { data: etu } = await ctx.admin.from('univ_etudiants').select('id, nom, prenoms, matricule')
    .eq('id', etudiantId).eq('etablissement_id', ctx.etablissementId).maybeSingle();
  if (!etu) return NextResponse.json({ error: 'Étudiant introuvable.' }, { status: 404 });
  const { data, error } = await ctx.admin.from('univ_notes').select('ec_id, session, valeur')
    .eq('etudiant_id', etudiantId).eq('annee_scolaire', annee);
  if (error) return NextResponse.json({ error: messageErreur(error.message) }, { status: 500 });
  return NextResponse.json({ etudiant: etu, notes: data ?? [] });
}

// POST { etudiantId, annee, notes: [{ ec_id, session, valeur }] } : valeur vide = suppression de la note
export async function POST(req: Request) {
  const ctx = await contexteDirection();
  if ('erreur' in ctx) return ctx.erreur;
  const b = await req.json().catch(() => ({}));
  const annee = String(b.annee ?? '').trim();
  if (!/^\d{4}-\d{4}$/.test(annee)) return NextResponse.json({ error: "Année scolaire attendue au format 2025-2026." }, { status: 400 });
  const e = ctx.etablissementId;
  const { data: etu } = await ctx.admin.from('univ_etudiants').select('id').eq('id', b.etudiantId).eq('etablissement_id', e).maybeSingle();
  if (!etu) return NextResponse.json({ error: 'Étudiant introuvable.' }, { status: 404 });
  const liste: { ec_id: string; session: string; valeur: unknown }[] = Array.isArray(b.notes) ? b.notes : [];
  if (liste.length > 500) return NextResponse.json({ error: 'Trop de notes en une fois.' }, { status: 400 });

  const ecIds = Array.from(new Set(liste.map((n) => String(n.ec_id))));
  const { data: ecs } = await ctx.admin.from('univ_ec').select('id').eq('etablissement_id', e).in('id', ecIds);
  const valides = new Set((ecs ?? []).map((x) => x.id as string));

  const aEcrire: Record<string, unknown>[] = [];
  const aSupprimer: { ec_id: string; session: string }[] = [];
  for (const n of liste) {
    if (!valides.has(String(n.ec_id)) || (n.session !== 'normale' && n.session !== 'rattrapage')) continue;
    const brut = String(n.valeur ?? '').trim().replace(',', '.');
    if (brut === '') { aSupprimer.push({ ec_id: String(n.ec_id), session: n.session }); continue; }
    const v = Number(brut);
    if (!Number.isFinite(v) || v < 0 || v > 20)
      return NextResponse.json({ error: `Note invalide : « ${brut} » (0 à 20).` }, { status: 400 });
    aEcrire.push({
      etablissement_id: e, etudiant_id: etu.id, ec_id: n.ec_id, annee_scolaire: annee, session: n.session,
      valeur: Math.round(v * 100) / 100, modifie_le: new Date().toISOString(),
    });
  }
  if (aEcrire.length) {
    const { error } = await ctx.admin.from('univ_notes').upsert(aEcrire, { onConflict: 'etudiant_id,ec_id,annee_scolaire,session' });
    if (error) return NextResponse.json({ error: messageErreur(error.message) }, { status: 500 });
  }
  for (const s of aSupprimer) {
    await ctx.admin.from('univ_notes').delete()
      .eq('etudiant_id', etu.id).eq('ec_id', s.ec_id).eq('annee_scolaire', annee).eq('session', s.session);
  }
  return NextResponse.json({ ok: true, enregistrees: aEcrire.length, supprimees: aSupprimer.length });
}
