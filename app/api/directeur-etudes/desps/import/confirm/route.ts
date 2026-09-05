import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = createClient();
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

  const { fichier_importe } = await req.json();

  const { data, error } = await supabase
    .from('desps_remontees')
    .upsert({
      etablissement_id: profile.etablissement_id,
      annee_scolaire: fichier_importe.annee_scolaire,
      trimestre: fichier_importe.trimestre,
      data_stats: fichier_importe,
      statut: 'importe',
      importe_le: new Date().toISOString(),
    }, { onConflict: 'etablissement_id,annee_scolaire,trimestre' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ remontee: data });
}
