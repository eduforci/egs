import { NextResponse } from 'next/server';
import { contexteDirection, messageErreur } from '@/lib/univ-serveur';

export const dynamic = 'force-dynamic';

const texte = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max);

export async function GET() {
  const ctx = await contexteDirection();
  if ('erreur' in ctx) return ctx.erreur;
  const { data, error } = await ctx.admin.from('univ_etudiants')
    .select('id, matricule, nom, prenoms, date_naissance, lieu_naissance')
    .eq('etablissement_id', ctx.etablissementId).order('nom').order('prenoms');
  if (error) return NextResponse.json({ error: messageErreur(error.message) }, { status: 500 });
  return NextResponse.json({ etudiants: data ?? [] });
}

// Actions : ajouter, supprimer
export async function POST(req: Request) {
  const ctx = await contexteDirection();
  if ('erreur' in ctx) return ctx.erreur;
  const b = await req.json().catch(() => ({}));
  if (b.action === 'supprimer') {
    const { error } = await ctx.admin.from('univ_etudiants').delete().eq('id', b.id).eq('etablissement_id', ctx.etablissementId);
    return error ? NextResponse.json({ error: messageErreur(error.message) }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  const nom = texte(b.nom);
  if (!nom) return NextResponse.json({ error: "Le nom de l'étudiant est obligatoire." }, { status: 400 });
  const naissance = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date_naissance ?? '')) ? String(b.date_naissance) : null;
  const { error } = await ctx.admin.from('univ_etudiants').insert({
    etablissement_id: ctx.etablissementId, nom, prenoms: texte(b.prenoms),
    matricule: texte(b.matricule, 30) || null, date_naissance: naissance, lieu_naissance: texte(b.lieu_naissance) || null,
  });
  return error ? NextResponse.json({ error: messageErreur(error.message) }, { status: 500 }) : NextResponse.json({ ok: true });
}
