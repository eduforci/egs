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

  // Chef ET directeur_etudes peuvent tous les deux lire (RLS "desps_select_etablissement" le permet déjà)
  if (!profile || !['chef', 'directeur_etudes'].includes(profile.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('desps_remontees')
    .select('id, annee_scolaire, trimestre, statut, cree_le, importe_le, data_stats')
    .eq('etablissement_id', profile.etablissement_id)
    .order('annee_scolaire', { ascending: false })
    .order('trimestre', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // On extrait juste le total d'élèves de chaque remontée, sans renvoyer le détail complet
  const historique = data.map((r) => ({
    id: r.id,
    annee_scolaire: r.annee_scolaire,
    trimestre: r.trimestre,
    statut: r.statut,
    cree_le: r.cree_le,
    importe_le: r.importe_le,
    total_eleves: (r.data_stats?.niveaux || []).reduce((sum: number, n: any) => sum + (n.total || 0), 0),
  }));

  return NextResponse.json({ historique });
}
