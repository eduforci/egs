import { NextResponse } from 'next/server';
import { contexteDirection, messageErreur } from '@/lib/univ-serveur';
import { LIMITE_IMPORT, analyserLigne, cleIdentite } from '@/lib/univ-import';

export const dynamic = 'force-dynamic';

// POST { lignes: [{ matricule, nom, prenoms, date_naissance, lieu_naissance }] }
// Les lignes sont recontrôlées ici. Un étudiant déjà présent (même matricule, ou même nom + prénoms + date) est ignoré.
export async function POST(req: Request) {
  const ctx = await contexteDirection();
  if ('erreur' in ctx) return ctx.erreur;
  const body = await req.json().catch(() => ({}));
  const brutes: Record<string, unknown>[] = Array.isArray(body?.lignes) ? body.lignes : [];
  if (brutes.length === 0) return NextResponse.json({ error: 'Aucune ligne à importer.' }, { status: 400 });
  if (brutes.length > LIMITE_IMPORT)
    return NextResponse.json({ error: `Maximum ${LIMITE_IMPORT} étudiants par import. Découpez le fichier.` }, { status: 400 });

  const e = ctx.etablissementId;
  const { data: existants, error: errLecture } = await ctx.admin.from('univ_etudiants')
    .select('matricule, nom, prenoms, date_naissance').eq('etablissement_id', e);
  if (errLecture) return NextResponse.json({ error: messageErreur(errLecture.message) }, { status: 500 });

  const matricules = new Set<string>();
  const identites = new Set<string>();
  for (const x of existants ?? []) {
    if (x.matricule) matricules.add(String(x.matricule).toLowerCase());
    identites.add(cleIdentite(String(x.nom ?? ''), String(x.prenoms ?? ''), String(x.date_naissance ?? '')));
  }

  const ignores: { ligne: number; nom: string; raison: string }[] = [];
  const aAjouter: Record<string, unknown>[] = [];
  brutes.forEach((b, i) => {
    const l = analyserLigne(b as never, i + 1);
    const nomAffiche = `${l.nom} ${l.prenoms}`.trim() || '(sans nom)';
    if (l.erreur) { ignores.push({ ligne: l.ligne, nom: nomAffiche, raison: l.erreur }); return; }
    const mat = l.matricule.toLowerCase();
    const ident = cleIdentite(l.nom, l.prenoms, l.date_naissance);
    if (mat && matricules.has(mat)) { ignores.push({ ligne: l.ligne, nom: nomAffiche, raison: 'Matricule déjà enregistré.' }); return; }
    if (identites.has(ident)) { ignores.push({ ligne: l.ligne, nom: nomAffiche, raison: 'Étudiant déjà enregistré (même nom, prénoms et date).' }); return; }
    if (mat) matricules.add(mat);
    identites.add(ident);
    aAjouter.push({
      etablissement_id: e, matricule: l.matricule || null, nom: l.nom, prenoms: l.prenoms,
      date_naissance: l.date_naissance || null, lieu_naissance: l.lieu_naissance || null,
    });
  });

  let nbAjoutes = 0;
  for (let i = 0; i < aAjouter.length; i += 200) {
    const lot = aAjouter.slice(i, i + 200);
    const { error } = await ctx.admin.from('univ_etudiants').insert(lot);
    if (error) {
      return NextResponse.json({ error: messageErreur(error.message), nbAjoutes, ignores }, { status: 500 });
    }
    nbAjoutes += lot.length;
  }
  return NextResponse.json({ ok: true, nbAjoutes, ignores });
}
