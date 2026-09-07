import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

  const { data: demandeExistante } = await supabase
    .from('demandes_transfert')
    .select('etablissement_id, eleve_id, type')
    .eq('id', params.id)
    .single();

  if (!demandeExistante || demandeExistante.etablissement_id !== profile.etablissement_id) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  }

  const body = await req.json();
  const champsAutorises = ['statut', 'numero_demande', 'etablissement_partenaire', 'motif'];

  const statutsValides = ['brouillon', 'deposee', 'acceptee', 'rejetee'];
  if (body.statut && !statutsValides.includes(body.statut)) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
  }

  const misAJour: Record<string, any> = { mis_a_jour_le: new Date().toISOString() };
  for (const champ of champsAutorises) {
    if (body[champ] !== undefined) misAJour[champ] = body[champ];
  }

  const { data, error } = await supabase
    .from('demandes_transfert')
    .update(misAJour)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Un transfert sortant accepté = l'élève quitte réellement l'établissement
  if (demandeExistante.type === 'sortant' && body.statut === 'acceptee') {
    await supabase
      .from('eleves')
      .update({ statut: 'transfere' })
      .eq('id', demandeExistante.eleve_id);
  }

  return NextResponse.json({ demande: data });
                           }
