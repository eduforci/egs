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

  const { data: demandes, error } = await supabase
    .from('demandes_immatriculation')
    .select('*')
    .eq('etablissement_id', profile.etablissement_id)
    .order('cree_le', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eleveIds = [...new Set(demandes.map((d) => d.eleve_id))];
  const { data: eleves } = await supabase
    .from('eleves')
    .select('id, nom, prenom, matricule')
    .in('id', eleveIds.length > 0 ? eleveIds : ['00000000-0000-0000-0000-000000000000']);
  const elevesMap = new Map((eleves || []).map((e) => [e.id, e]));

  const resultat = demandes.map((d) => ({
    ...d,
    eleve: elevesMap.get(d.eleve_id) ?? null,
  }));

  return NextResponse.json({ demandes: resultat });
}

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

  const { eleve_id } = await req.json();
  if (!eleve_id) return NextResponse.json({ error: 'Élève manquant' }, { status: 400 });

  const { data: eleve } = await supabase
    .from('eleves')
    .select('id, etablissement_id')
    .eq('id', eleve_id)
    .single();

  if (!eleve || eleve.etablissement_id !== profile.etablissement_id) {
    return NextResponse.json({ error: 'Élève introuvable pour cet établissement' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('demandes_immatriculation')
    .insert({
      eleve_id,
      etablissement_id: profile.etablissement_id,
      cree_par: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ demande: data });
      }
