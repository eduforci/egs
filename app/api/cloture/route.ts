import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROLES = ['administration', 'chef', 'directeur', 'directeur_etudes', 'super_admin'];

async function contexte(classeId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) };
  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil || !ROLES.includes(String(profil.role)))
    return { erreur: NextResponse.json({ error: 'Accès réservé à la direction de l\'école.' }, { status: 403 }) };
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: classe } = await admin.from('classes').select('id, nom, etablissement_id, annee_scolaire').eq('id', classeId).single();
  if (!classe) return { erreur: NextResponse.json({ error: 'Classe introuvable.' }, { status: 404 }) };
  if (profil.role !== 'super_admin' && classe.etablissement_id !== profil.etablissement_id)
    return { erreur: NextResponse.json({ error: 'Accès refusé.' }, { status: 403 }) };
  return { admin, user, classe: classe as any };
}

// État d'une classe pour un trimestre : clôture, matières validées, infos du conseil, décisions de fin d'année.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const classeId = url.searchParams.get('classeId') || '';
  const trimestre = Number(url.searchParams.get('trimestre'));
  if (!classeId || ![1, 2, 3].includes(trimestre)) return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
  const ctx = await contexte(classeId);
  if ('erreur' in ctx) return ctx.erreur;
  const { admin, classe } = ctx;
  const annee: string = classe.annee_scolaire;

  const { data: cl } = await admin.from('clotures_classes').select('cloture_at').eq('classe_id', classeId)
    .eq('trimestre', trimestre).eq('annee_scolaire', annee).maybeSingle();

  // matières qui ont des notes ce trimestre, et leur validation
  const { data: notes } = await admin.from('notes').select('matiere_id, matieres(nom)')
    .eq('classe_id', classeId).eq('annee_scolaire', annee).eq('trimestre', trimestre);
  const mats = new Map<string, { id: string; nom: string; nbNotes: number }>();
  (notes ?? []).forEach((n: any) => {
    const m = mats.get(n.matiere_id) ?? { id: n.matiere_id, nom: n.matieres?.nom ?? '', nbNotes: 0 };
    m.nbNotes++;
    mats.set(n.matiere_id, m);
  });
  const { data: vals } = await admin.from('validations_notes').select('matiere_id, valide')
    .eq('classe_id', classeId).eq('annee_scolaire', annee).eq('trimestre', trimestre);
  const valide = new Map((vals ?? []).map((v: any) => [v.matiere_id, v.valide === true]));
  const matieres = Array.from(mats.values())
    .map((m) => ({ ...m, valide: valide.get(m.id) === true }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const { data: elevesBruts } = await admin.from('eleves').select('id, matricule').eq('classe_id', classeId);
  const ids = (elevesBruts ?? []).map((e: any) => e.id as string);
  const [{ data: profils }, { data: infos }, { data: nc }, { data: decs }] = ids.length
    ? await Promise.all([
        admin.from('profiles').select('id, nom, prenom').in('id', ids),
        admin.from('bulletins_infos').select('eleve_id, appreciation_conseil, mention_distinction')
          .in('eleve_id', ids).eq('trimestre', trimestre).eq('annee_scolaire', annee),
        admin.from('non_classes').select('eleve_id, motif').in('eleve_id', ids).eq('trimestre', trimestre).eq('annee_scolaire', annee),
        admin.from('decisions_annee').select('eleve_id, decision, observation').in('eleve_id', ids).eq('annee_scolaire', annee),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }] as any;
  const pP = new Map((profils ?? []).map((p: any) => [p.id, p]));
  const pI = new Map((infos ?? []).map((p: any) => [p.eleve_id, p]));
  const pN = new Map((nc ?? []).map((p: any) => [p.eleve_id, p]));
  const pD = new Map((decs ?? []).map((p: any) => [p.eleve_id, p]));
  const eleves = (elevesBruts ?? []).map((e: any) => {
    const p: any = pP.get(e.id), i: any = pI.get(e.id), n: any = pN.get(e.id), d: any = pD.get(e.id);
    return {
      id: e.id as string, matricule: e.matricule ?? '', nom: p?.nom ?? '', prenom: p?.prenom ?? '',
      appreciation: i?.appreciation_conseil ?? '', mention: i?.mention_distinction ?? '',
      nonClasse: !!n, motif: n?.motif ?? '', decision: d?.decision ?? '', observation: d?.observation ?? '',
    };
  }).sort((a: any, b: any) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));

  return NextResponse.json({
    classe: classe.nom, annee, trimestre, cloture: cl ? { le: cl.cloture_at } : null, matieres, eleves,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { classeId, trimestre, action } = body as { classeId: string; trimestre: number; action: string };
  if (!classeId || ![1, 2, 3].includes(Number(trimestre))) return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
  const ctx = await contexte(classeId);
  if ('erreur' in ctx) return ctx.erreur;
  const { admin, user, classe } = ctx;
  const annee: string = classe.annee_scolaire;
  const etab: string = classe.etablissement_id;
  const t = Number(trimestre);
  const echec = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  if (action === 'cloturer') {
    const { data: notes } = await admin.from('notes').select('matiere_id')
      .eq('classe_id', classeId).eq('annee_scolaire', annee).eq('trimestre', t);
    const matIds = Array.from(new Set((notes ?? []).map((n: any) => n.matiere_id as string)));
    // la clôture valide d'office les matières encore ouvertes : l'enseignant ne pourra plus les modifier
    for (const mid of matIds) {
      const { data: ex } = await admin.from('validations_notes').select('id').eq('classe_id', classeId)
        .eq('matiere_id', mid).eq('trimestre', t).eq('annee_scolaire', annee).maybeSingle();
      const champs = { valide: true, valide_par: user.id, valide_at: new Date().toISOString() };
      const r = ex
        ? await admin.from('validations_notes').update(champs).eq('id', ex.id)
        : await admin.from('validations_notes').insert({ classe_id: classeId, matiere_id: mid, trimestre: t, annee_scolaire: annee, ...champs });
      if (r.error) return echec(r.error.message);
    }
    const { error } = await admin.from('clotures_classes').upsert(
      { etablissement_id: etab, classe_id: classeId, trimestre: t, annee_scolaire: annee, cloture_par: user.id, cloture_at: new Date().toISOString() },
      { onConflict: 'classe_id,trimestre,annee_scolaire' });
    if (error) return echec(error.message);
    return NextResponse.json({ ok: true });
  }

  if (action === 'rouvrir') {
    const { error } = await admin.from('clotures_classes').delete()
      .eq('classe_id', classeId).eq('trimestre', t).eq('annee_scolaire', annee);
    if (error) return echec(error.message);
    return NextResponse.json({ ok: true });
  }

  if (action === 'conseil') {
    const lignes = (body.eleves ?? []) as { id: string; appreciation: string; mention: string; nonClasse: boolean; motif: string }[];
    const { data: ok } = await admin.from('eleves').select('id').eq('classe_id', classeId);
    const permis = new Set((ok ?? []).map((e: any) => e.id as string));
    for (const l of lignes) {
      if (!permis.has(l.id)) continue;
      const r = await admin.from('bulletins_infos').upsert(
        { eleve_id: l.id, classe_id: classeId, trimestre: t, annee_scolaire: annee, etablissement_id: etab,
          appreciation_conseil: (l.appreciation || '').trim() || null, mention_distinction: l.mention || null },
        { onConflict: 'eleve_id,trimestre,annee_scolaire' });
      if (r.error) return echec(r.error.message);
      const r2 = l.nonClasse
        ? await admin.from('non_classes').upsert(
            { etablissement_id: etab, eleve_id: l.id, classe_id: classeId, trimestre: t, annee_scolaire: annee, motif: (l.motif || '').trim() || null },
            { onConflict: 'eleve_id,trimestre,annee_scolaire' })
        : await admin.from('non_classes').delete().eq('eleve_id', l.id).eq('trimestre', t).eq('annee_scolaire', annee);
      if (r2.error) return echec(r2.error.message);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'decisions') {
    const lignes = (body.eleves ?? []) as { id: string; decision: string; observation: string }[];
    const { data: ok } = await admin.from('eleves').select('id').eq('classe_id', classeId);
    const permis = new Set((ok ?? []).map((e: any) => e.id as string));
    for (const l of lignes) {
      if (!permis.has(l.id)) continue;
      if (!['admis', 'redouble', 'exclu'].includes(l.decision)) {
        await admin.from('decisions_annee').delete().eq('eleve_id', l.id).eq('annee_scolaire', annee);
        continue;
      }
      const r = await admin.from('decisions_annee').upsert(
        { etablissement_id: etab, eleve_id: l.id, classe_id: classeId, annee_scolaire: annee, decision: l.decision,
          observation: (l.observation || '').trim() || null, decide_at: new Date().toISOString() },
        { onConflict: 'eleve_id,annee_scolaire' });
      if (r.error) return echec(r.error.message);
    }
    return NextResponse.json({ ok: true });
  }

  // Passage : les admis vont dans la classe choisie, les redoublants dans la leur ; les exclus ne sont pas déplacés (à traiter à part).
  if (action === 'passage') {
    const { classeAdmis, classeRedoublants } = body as { classeAdmis?: string; classeRedoublants?: string };
    const { data: decs } = await admin.from('decisions_annee').select('eleve_id, decision')
      .eq('classe_id', classeId).eq('annee_scolaire', annee);
    const parDecision = (d: string) => (decs ?? []).filter((x: any) => x.decision === d).map((x: any) => x.eleve_id as string);
    const verifier = async (id?: string) => {
      if (!id) return true;
      const { data } = await admin.from('classes').select('etablissement_id').eq('id', id).single();
      return !!data && data.etablissement_id === etab;
    };
    if (!(await verifier(classeAdmis)) || !(await verifier(classeRedoublants))) return echec('Classe de destination invalide.', 400);
    let deplaces = 0;
    for (const [cible, ids] of [[classeAdmis, parDecision('admis')], [classeRedoublants, parDecision('redouble')]] as [string | undefined, string[]][]) {
      if (!cible || ids.length === 0) continue;
      const { error } = await admin.from('eleves').update({ classe_id: cible }).in('id', ids);
      if (error) return echec(error.message);
      deplaces += ids.length;
    }
    return NextResponse.json({ ok: true, deplaces });
  }

  return echec('Action inconnue.', 400);
}
