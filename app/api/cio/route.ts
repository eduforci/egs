import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROLES = ['administration', 'chef', 'directeur', 'directeur_etudes', 'super_admin'];

// Pour chaque classe et chaque matière : combien d'élèves ont leur moyenne remontée (au moins une note du trimestre).
export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil || !ROLES.includes(String(profil.role)) || !profil.etablissement_id)
    return NextResponse.json({ error: "Accès réservé à la direction de l'école." }, { status: 403 });
  const etab = profil.etablissement_id as string;

  const trimestre = Number(new URL(req.url).searchParams.get('trimestre'));
  if (![1, 2, 3].includes(trimestre)) return NextResponse.json({ error: 'Trimestre invalide.' }, { status: 400 });

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: ecole } = await admin.from('etablissements').select('annee_scolaire_active').eq('id', etab).single();
  const annee: string = ecole?.annee_scolaire_active ?? '';

  let rc = admin.from('classes').select('id, nom').eq('etablissement_id', etab);
  if (annee) rc = rc.eq('annee_scolaire', annee);
  const { data: classesBrutes } = await rc;
  const classes = ((classesBrutes ?? []) as { id: string; nom: string }[])
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }));
  const ids = classes.map((c) => c.id);
  if (ids.length === 0) return NextResponse.json({ annee, trimestre, matieres: [], classes: [], maj: new Date().toISOString() });

  const lire = async (table: string, champs: string): Promise<any[]> => {
    const out: any[] = [];
    for (let i = 0; i < ids.length; i += 40) {
      const { data } = await admin.from(table).select(champs).in('classe_id', ids.slice(i, i + 40));
      out.push(...(data ?? []));
    }
    return out;
  };

  const [liees, affs, effRows] = await Promise.all([
    lire('classes_matieres', 'classe_id, matiere_id'),
    lire('affectations_enseignant', 'classe_id, matiere_id, enseignant_id'),
    lire('eleves', 'id, classe_id'),
  ]);
  const effectif = new Map<string, number>();
  effRows.forEach((e) => effectif.set(e.classe_id, (effectif.get(e.classe_id) ?? 0) + 1));

  // élèves ayant une moyenne : par la fonction SQL si elle existe, sinon en lisant les notes
  const faits = new Map<string, number>();
  const rpc = await admin.rpc('cio_moyennes', { p_etablissement: etab, p_annee: annee, p_trimestre: trimestre });
  if (!rpc.error) {
    (rpc.data ?? []).forEach((r: any) => faits.set(`${r.classe_id}|${r.matiere_id}`, Number(r.nb_eleves) || 0));
  } else {
    const vus = new Set<string>();
    for (let debut = 0; debut < 300000; debut += 1000) {
      const { data } = await admin.from('notes').select('eleve_id, classe_id, matiere_id')
        .eq('annee_scolaire', annee).eq('trimestre', trimestre).in('classe_id', ids).range(debut, debut + 999);
      (data ?? []).forEach((n: any) => vus.add(`${n.classe_id}|${n.matiere_id}|${n.eleve_id}`));
      if (!data || data.length < 1000) break;
    }
    vus.forEach((k) => { const [c, m] = k.split('|'); const cle = `${c}|${m}`; faits.set(cle, (faits.get(cle) ?? 0) + 1); });
  }

  // matières et enseignants
  const idsMat = Array.from(new Set(liees.map((l) => l.matiere_id as string)));
  const nomMat = new Map<string, string>();
  for (let i = 0; i < idsMat.length; i += 40) {
    const { data } = await admin.from('matieres').select('id, nom').in('id', idsMat.slice(i, i + 40));
    (data ?? []).forEach((m: any) => nomMat.set(m.id, m.nom));
  }
  const idsProf = Array.from(new Set(affs.map((a) => a.enseignant_id as string)));
  const nomProf = new Map<string, { nom: string; prenom: string }>();
  for (let i = 0; i < idsProf.length; i += 40) {
    const { data } = await admin.from('profiles').select('id, nom, prenom').in('id', idsProf.slice(i, i + 40));
    (data ?? []).forEach((p: any) => nomProf.set(p.id, { nom: p.nom ?? '', prenom: p.prenom ?? '' }));
  }

  const matieres = idsMat.map((id) => ({ id, nom: nomMat.get(id) ?? '' })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const lieesSet = new Set(liees.map((l) => `${l.classe_id}|${l.matiere_id}`));

  const lignes = classes.map((c) => {
    const eff = effectif.get(c.id) ?? 0;
    const cases: Record<string, { faits: number; enseignants: { id: string; nom: string; prenom: string }[] } | null> = {};
    for (const m of matieres) {
      const k = `${c.id}|${m.id}`;
      if (!lieesSet.has(k)) { cases[m.id] = null; continue; }
      const ens = affs.filter((a) => a.classe_id === c.id && a.matiere_id === m.id)
        .map((a) => ({ id: a.enseignant_id as string, ...(nomProf.get(a.enseignant_id) ?? { nom: '', prenom: '' }) }));
      cases[m.id] = { faits: Math.min(faits.get(k) ?? 0, eff), enseignants: ens };
    }
    return { id: c.id, nom: c.nom, effectif: eff, cases };
  });

  return NextResponse.json({ annee, trimestre, matieres, classes: lignes, maj: new Date().toISOString() });
}
