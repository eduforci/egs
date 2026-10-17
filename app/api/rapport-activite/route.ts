import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROLES = ['administration', 'directeur', 'directeur_etudes', 'super_admin'];

async function parPaquets(admin: any, table: string, colonne: string, ids: string[], champs: string, filtre?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    let q = admin.from(table).select(champs).in(colonne, ids.slice(i, i + 100));
    if (filtre) q = filtre(q);
    const { data } = await q;
    out.push(...(data ?? []));
  }
  return out;
}
const somme = (l: any[], c: string) => l.reduce((s, x) => s + (Number(x[c]) || 0), 0);

// Rapport d'activité de l'école sur une période : effectifs, personnel, assiduité, notes, finances.
export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil || !ROLES.includes(String(profil.role)) || !profil.etablissement_id)
    return NextResponse.json({ error: "Accès réservé à la direction de l'école." }, { status: 403 });
  const etab = profil.etablissement_id as string;

  const url = new URL(req.url);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const debut = url.searchParams.get('debut') || '';
  const fin = url.searchParams.get('fin') || '';
  if (!re.test(debut) || !re.test(fin) || fin < debut) return NextResponse.json({ error: 'Période invalide.' }, { status: 400 });

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: ecole } = await admin.from('etablissements').select('nom, annee_scolaire_active').eq('id', etab).single();
  const annee: string = ecole?.annee_scolaire_active ?? '';

  // Effectifs
  let rq = admin.from('classes').select('id, nom').eq('etablissement_id', etab);
  if (annee) rq = rq.eq('annee_scolaire', annee);
  const { data: classes } = await rq;
  const classeIds = (classes ?? []).map((c: any) => c.id as string);
  let eleves: any[] = [];
  const avecSexe = await admin.from('eleves').select('id, classe_id, sexe').eq('etablissement_id', etab).limit(20000);
  if (avecSexe.error) {
    const { data } = await admin.from('eleves').select('id, classe_id').eq('etablissement_id', etab).limit(20000);
    eleves = data ?? [];
  } else eleves = avecSexe.data ?? [];
  const eleveIds = eleves.map((e) => e.id as string);
  const parClasse = (classes ?? []).map((c: any) => {
    const l = eleves.filter((e) => e.classe_id === c.id);
    return { classe: c.nom as string, total: l.length, garcons: l.filter((e) => e.sexe === 'M').length, filles: l.filter((e) => e.sexe === 'F').length };
  }).sort((a: any, b: any) => a.classe.localeCompare(b.classe, 'fr', { numeric: true }));

  // Personnel
  const { data: staff } = await admin.from('profiles').select('id, role, actif').eq('etablissement_id', etab).not('role', 'in', '(parent,eleve)');
  const personnel: Record<string, number> = {};
  (staff ?? []).filter((p: any) => p.actif !== false).forEach((p: any) => { personnel[p.role] = (personnel[p.role] ?? 0) + 1; });

  // Présence du personnel (pointage)
  const { data: pts } = await admin.from('pointages').select('profile_id, date_pointage, type_evenement, statut')
    .eq('etablissement_id', etab).gte('date_pointage', debut).lte('date_pointage', fin).limit(50000);
  const entrees = (pts ?? []).filter((p: any) => p.type_evenement === 'entree');
  const pointage = {
    entrees: entrees.length,
    retards: entrees.filter((p: any) => p.statut === 'retard').length,
    personnes: new Set(entrees.map((p: any) => p.profile_id)).size,
  };

  // Assiduité des élèves
  const abs = await parPaquets(admin, 'absences', 'eleve_id', eleveIds, 'eleve_id, type, justifie', (q) => q.gte('date', debut).lte('date', fin));
  const assiduite = {
    absences: abs.filter((a) => a.type === 'absence').length,
    absencesNonJustifiees: abs.filter((a) => a.type === 'absence' && !a.justifie).length,
    retards: abs.filter((a) => a.type === 'retard').length,
    elevesConcernes: new Set(abs.map((a) => a.eleve_id)).size,
  };

  // Notes saisies
  let nbNotes = 0;
  for (let i = 0; i < classeIds.length; i += 50) {
    const { count } = await admin.from('notes').select('id', { count: 'exact', head: true })
      .in('classe_id', classeIds.slice(i, i + 50)).gte('created_at', debut + 'T00:00:00').lte('created_at', fin + 'T23:59:59');
    nbNotes += count ?? 0;
  }

  // Finances
  const [{ data: pai }, { data: dep }, { data: rec }] = await Promise.all([
    admin.from('paiements').select('montant').eq('etablissement_id', etab).eq('annule', false).gte('date_paiement', debut).lte('date_paiement', fin).limit(50000),
    admin.from('depenses').select('montant').eq('etablissement_id', etab).gte('date_depense', debut).lte('date_depense', fin).limit(50000),
    admin.from('recettes').select('montant').eq('etablissement_id', etab).gte('date_recette', debut).lte('date_recette', fin).limit(50000),
  ]);
  const frais = await parPaquets(admin, 'frais_scolarite', 'eleve_id', eleveIds, 'montant_total, montant_paye', (q) => (annee ? q.eq('annee_scolaire', annee) : q));
  const finances = {
    scolaritePercue: somme(pai ?? [], 'montant'),
    autresRecettes: somme(rec ?? [], 'montant'),
    depenses: somme(dep ?? [], 'montant'),
    attenduAnnee: somme(frais, 'montant_total'),
    payeAnnee: somme(frais, 'montant_paye'),
  };

  // Congés du personnel sur la période (tables RH facultatives)
  let conges = { nb: 0, jours: 0 };
  const cg = await admin.from('rh_conges').select('date_debut, date_fin').eq('etablissement_id', etab)
    .eq('statut', 'approuve').lte('date_debut', fin).gte('date_fin', debut);
  if (!cg.error) {
    conges = { nb: (cg.data ?? []).length, jours: 0 };
    for (const c of cg.data ?? []) {
      const a = c.date_debut > debut ? c.date_debut : debut;
      const b = c.date_fin < fin ? c.date_fin : fin;
      conges.jours += Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1);
    }
  }

  return NextResponse.json({
    ecole: ecole?.nom ?? '', annee, debut, fin,
    effectifs: { total: eleves.length, parClasse },
    personnel, pointage, assiduite, nbNotes, finances, conges,
  });
}
