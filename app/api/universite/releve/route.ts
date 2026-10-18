import { NextResponse } from 'next/server';
import { contexteDirection, messageErreur } from '@/lib/univ-serveur';
import { PARAMETRES_UNIV_PAR_DEFAUT, calculerReleve, normaliserParametres, type EcDef, type NoteDef, type UeDef } from '@/lib/univ-calcul';

export const dynamic = 'force-dynamic';

// GET ?etudiantId= : relevé complet (tous les semestres notés, par année), calculé avec les réglages de l'école
export async function GET(req: Request) {
  const ctx = await contexteDirection();
  if ('erreur' in ctx) return ctx.erreur;
  const etudiantId = new URL(req.url).searchParams.get('etudiantId');
  if (!etudiantId) return NextResponse.json({ error: 'Étudiant manquant.' }, { status: 400 });
  const e = ctx.etablissementId;

  const { data: etu } = await ctx.admin.from('univ_etudiants')
    .select('id, matricule, nom, prenoms, date_naissance, lieu_naissance')
    .eq('id', etudiantId).eq('etablissement_id', e).maybeSingle();
  if (!etu) return NextResponse.json({ error: 'Étudiant introuvable.' }, { status: 404 });

  const [{ data: reglages }, { data: etab }, { data: notesBrutes, error: errNotes }] = await Promise.all([
    ctx.admin.from('univ_parametres').select('options').eq('etablissement_id', e).maybeSingle(),
    ctx.admin.from('etablissements').select('nom, adresse, telephone').eq('id', e).maybeSingle(),
    ctx.admin.from('univ_notes').select('ec_id, annee_scolaire, session, valeur').eq('etudiant_id', etudiantId),
  ]);
  if (errNotes) return NextResponse.json({ error: messageErreur(errNotes.message) }, { status: 500 });
  const parametres = reglages ? normaliserParametres(reglages.options) : PARAMETRES_UNIV_PAR_DEFAUT;
  const notes = (notesBrutes ?? []) as NoteDef[];

  // Retrouver les parcours concernés, puis toutes leurs UE et matières (pour détecter les matières sans note).
  const ecIds = Array.from(new Set(notes.map((n) => n.ec_id)));
  let ues: UeDef[] = [];
  let ecs: EcDef[] = [];
  let parcours: { id: string; nom: string }[] = [];
  if (ecIds.length) {
    const { data: ec1 } = await ctx.admin.from('univ_ec').select('ue_id').eq('etablissement_id', e).in('id', ecIds);
    const ueIds = Array.from(new Set((ec1 ?? []).map((x) => x.ue_id as string)));
    const { data: ue1 } = await ctx.admin.from('univ_ue').select('parcours_id').eq('etablissement_id', e).in('id', ueIds);
    const parIds = Array.from(new Set((ue1 ?? []).map((x) => x.parcours_id as string)));
    const [pr, ue2] = await Promise.all([
      ctx.admin.from('univ_parcours').select('id, nom').eq('etablissement_id', e).in('id', parIds),
      ctx.admin.from('univ_ue').select('id, parcours_id, semestre, code, intitule, credits').eq('etablissement_id', e).in('parcours_id', parIds),
    ]);
    parcours = (pr.data ?? []) as { id: string; nom: string }[];
    ues = (ue2.data ?? []) as UeDef[];
    const { data: ec2 } = await ctx.admin.from('univ_ec').select('id, ue_id, intitule, coefficient')
      .eq('etablissement_id', e).in('ue_id', ues.map((u) => u.id));
    ecs = (ec2 ?? []) as EcDef[];
  }

  const releve = calculerReleve(parametres, ues, ecs, notes);
  return NextResponse.json({ etudiant: etu, etablissement: etab ?? { nom: '', adresse: '', telephone: '' }, parametres, parcours, releve });
}
