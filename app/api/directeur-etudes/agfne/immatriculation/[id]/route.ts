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
    .from('demandes_immatriculation')
    .select('etablissement_id, eleve_id')
    .eq('id', params.id)
    .single();

  if (!demandeExistante || demandeExistante.etablissement_id !== profile.etablissement_id) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  }

  const body = await req.json();
  const champsAutorises = [
    'statut', 'numero_demande', 'piece_acte_naissance', 'piece_certificat_nationalite',
    'piece_photo', 'piece_certificat_scolarite', 'motif_rejet', 'matricule_obtenu',
  ];

  const statutsValides = ['brouillon', 'saisie', 'deposee', 'validee', 'rejetee', 'matricule_attribue'];
  if (body.statut && !statutsValides.includes(body.statut)) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
  }

  const misAJour: Record<string, any> = { mis_a_jour_le: new Date().toISOString() };
  for (const champ of champsAutorises) {
    if (body[champ] !== undefined) misAJour[champ] = body[champ];
  }

  const { data, error } = await supabase
    .from('demandes_immatriculation')
    .update(misAJour)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Si un matricule est attribué, on le reporte sur la fiche élève ET sur
  // l'identifiant de connexion (qui portait un identifiant provisoire jusque-là)
  if (body.matricule_obtenu && body.statut === 'matricule_attribue') {
    await supabase
      .from('eleves')
      .update({ matricule: body.matricule_obtenu })
      .eq('id', data.eleve_id);

    await supabase
      .from('profiles')
      .update({ identifiant: body.matricule_obtenu })
      .eq('id', data.eleve_id);
  }

  return NextResponse.json({ demande: data });
                            }
