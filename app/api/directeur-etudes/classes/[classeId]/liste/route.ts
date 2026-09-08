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

  const { data: elevesRaw, error: elevesError } = await supabase
    .from('eleves')
    .select('id, matricule, nom, prenom')
    .eq('classe_id', params.classeId)
    .eq('statut', 'actif');

  if (elevesError) return NextResponse.json({ error: elevesError.message }, { status: 500 });

  // Certains élèves plus anciens n'ont nom/prénom que sur profiles, pas sur eleves —
  // on complète depuis profiles pour ceux-là plutôt que de les afficher vides.
  const idsSansNom = (elevesRaw || []).filter((e) => !e.nom || !e.prenom).map((e) => e.id);
  const profilsMap = new Map<string, { nom: string; prenom: string }>();
  if (idsSansNom.length > 0) {
    const { data: profils } = await supabase
      .from('profiles')
      .select('id, nom, prenom')
      .in('id', idsSansNom);
    (profils || []).forEach((p) => profilsMap.set(p.id, { nom: p.nom, prenom: p.prenom }));
  }

  const eleves = (elevesRaw || [])
    .map((e) => {
      const secours = profilsMap.get(e.id);
      return {
        id: e.id,
        matricule: e.matricule,
        nom: e.nom || secours?.nom || '',
        prenom: e.prenom || secours?.prenom || '',
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom));

  return NextResponse.json({
    classe: { nom: classe.nom, niveau: classe.niveau, annee_scolaire: classe.annee_scolaire },
    etablissement: etab,
    eleves,
  });
        }
