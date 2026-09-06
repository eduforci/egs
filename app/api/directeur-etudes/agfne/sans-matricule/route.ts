import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, etablissement_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'directeur_etudes') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { data: eleves, error } = await supabase
    .from('eleves')
    .select('id, nom, prenom, classe_id, statut')
    .eq('etablissement_id', profile.etablissement_id)
    .eq('statut', 'actif')
    .or('matricule.is.null,matricule.eq.');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Jointure séparée avec classes (le pattern habituel EGS pour éviter les échecs silencieux)
  const classeIds = [...new Set(eleves.map((e) => e.classe_id).filter(Boolean))];
  const { data: classes } = await supabase
    .from('classes')
    .select('id, nom, niveau')
    .in('id', classeIds);

  const classesMap = new Map((classes || []).map((c) => [c.id, c]));

  const resultat = eleves.map((e) => ({
    id: e.id,
    nom: e.nom,
    prenom: e.prenom,
    classe: classesMap.get(e.classe_id)?.nom ?? '—',
    niveau: classesMap.get(e.classe_id)?.niveau ?? '—',
  }));

  return NextResponse.json({ eleves: resultat, total: resultat.length });
}
