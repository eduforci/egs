import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest, { params }: { params: { eleveId: string } }) {
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

  const { data: eleve, error: eleveError } = await supabase
    .from('eleves')
    .select('id, nom, prenom, matricule, date_naissance, lieu_naissance, nationalite, etablissement_id')
    .eq('id', params.eleveId)
    .single();

  if (eleveError || !eleve || eleve.etablissement_id !== profile.etablissement_id) {
    return NextResponse.json({ error: 'Élève introuvable pour cet établissement' }, { status: 404 });
  }

  const { data: etab } = await supabase
    .from('etablissements')
    .select('nom, code_etablissement')
    .eq('id', profile.etablissement_id)
    .single();

  const { data: inscriptions, error: inscrError } = await supabase
    .from('inscriptions')
    .select('classe_id, annee_scolaire, date_inscription, date_sortie, statut')
    .eq('eleve_id', params.eleveId)
    .order('date_inscription', { ascending: true });

  if (inscrError) return NextResponse.json({ error: inscrError.message }, { status: 500 });

  const classeIds = [...new Set((inscriptions || []).map((i) => i.classe_id))];
  const { data: classes } = await supabase
    .from('classes')
    .select('id, nom, niveau')
    .in('id', classeIds.length > 0 ? classeIds : ['00000000-0000-0000-0000-000000000000']);
  const classesMap = new Map((classes || []).map((c) => [c.id, c]));

  const parcours = (inscriptions || []).map((i) => ({
    annee_scolaire: i.annee_scolaire,
    classe: classesMap.get(i.classe_id)?.nom ?? '—',
    niveau: classesMap.get(i.classe_id)?.niveau ?? '—',
    date_inscription: i.date_inscription,
    date_sortie: i.date_sortie,
    statut: i.statut,
  }));

  return NextResponse.json({
    eleve: {
      nom: eleve.nom,
      prenom: eleve.prenom,
      matricule: eleve.matricule,
      date_naissance: eleve.date_naissance,
      lieu_naissance: eleve.lieu_naissance,
      nationalite: eleve.nationalite,
    },
    etablissement: etab,
    parcours,
  });
}
