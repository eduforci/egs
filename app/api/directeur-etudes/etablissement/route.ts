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

  const { data, error } = await supabase
    .from('etablissements')
    .select('id, nom, code_etablissement')
    .eq('id', profile.etablissement_id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ etablissement: data });
}

export async function PATCH(req: NextRequest) {
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

  const { code_etablissement } = await req.json();

  const { data, error } = await supabase
    .from('etablissements')
    .update({ code_etablissement })
    .eq('id', profile.etablissement_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ etablissement: data });
}
