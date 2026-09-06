import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
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

  const { annee_scolaire, trimestre } = await req.json();

  const { data: stats, error: statsError } = await supabase.rpc('calculer_stats_desps', {
    p_etablissement_id: profile.etablissement_id,
    p_annee_scolaire: annee_scolaire,
    p_trimestre: trimestre,
  });

  if (statsError) {
    return NextResponse.json({ error: statsError.message }, { status: 500 });
  }

  const { data: etab } = await supabase
    .from('etablissements')
    .select('nom, code_etablissement')
    .eq('id', profile.etablissement_id)
    .single();

  const fichierComplet = {
    etablissement: etab?.nom,
    code_etablissement: etab?.code_etablissement,
    ...stats,
    genere_le: new Date().toISOString(),
  };

  const { data: remontee, error: upsertError } = await supabase
    .from('desps_remontees')
    .upsert({
      etablissement_id: profile.etablissement_id,
      annee_scolaire,
      trimestre,
      data_stats: fichierComplet,
      statut: 'genere',
      cree_par: user.id,
    }, { onConflict: 'etablissement_id,annee_scolaire,trimestre' })
    .select()
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ remontee, fichierComplet });
}
