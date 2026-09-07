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
    .select('id, nom, prenom, matricule')
    .eq('etablissement_id', profile.etablissement_id)
    .eq('statut', 'actif')
    .order('nom');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ eleves });
}
