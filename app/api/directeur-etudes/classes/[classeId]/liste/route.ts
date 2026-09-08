import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest, { params }: { params: { classeId: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('etablissement_id')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 403 });

  const { data: classe, error: classeError } = await supabase
    .from('classes')
    .select('id, nom, niveau, annee_scolaire, etablissement_id')
    .eq('id', params.classeId)
    .single();

  if (classeError || !classe || classe.etablissement_id !== profile.etablissement_id) {
    return NextResponse.json({ error: 'Classe introuvable pour votre établissement' }, { status: 404 });
  }

  const { data: etab, error: etabError } = await supabase
    .from('etablissements')
    .select('nom, adresse, telephone, email, code_etablissement, dren, statut_juridique, logo_url')
    .eq('id', profile.etablissement_id)
    .single();

  if (etabError) return NextResponse.json({ error: etabError.message }, { status: 500 });

  const { data: eleves, error: elevesError } = await supabase
    .from('eleves')
    .select('id, matricule, nom, prenom')
    .eq('classe_id', params.classeId)
    .eq('statut', 'actif')
    .order('nom', { ascending: true });

  if (elevesError) return NextResponse.json({ error: elevesError.message }, { status: 500 });

  return NextResponse.json({
    classe: { nom: classe.nom, niveau: classe.niveau, annee_scolaire: classe.annee_scolaire },
    etablissement: etab,
    eleves: eleves ?? [],
  });
}
