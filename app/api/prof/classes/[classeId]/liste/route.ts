import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest, { params }: { params: { classeId: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  // Vérifie que l'enseignant connecté a bien une affectation dans cette classe
  // (n'importe quelle matière suffit — la liste de classe n'est pas liée à une matière)
  const { data: affectation } = await admin
    .from('affectations_enseignant')
    .select('id')
    .eq('classe_id', params.classeId)
    .eq('enseignant_id', user.id)
    .maybeSingle();

  if (!affectation) {
    return NextResponse.json({ error: 'Vous n\'êtes pas affecté à cette classe' }, { status: 403 });
  }

  const { data: classe, error: classeError } = await admin
    .from('classes')
    .select('id, nom, niveau, annee_scolaire, etablissement_id')
    .eq('id', params.classeId)
    .single();

  if (classeError || !classe) {
    return NextResponse.json({ error: 'Classe introuvable' }, { status: 404 });
  }

  const { data: etab, error: etabError } = await admin
    .from('etablissements')
    .select('nom, adresse, telephone, email, code_etablissement, dren, statut_juridique, logo_url')
    .eq('id', classe.etablissement_id)
    .single();

  if (etabError) return NextResponse.json({ error: etabError.message }, { status: 500 });

  const { data: elevesRaw, error: elevesError } = await admin
    .from('eleves')
    .select('id, matricule, nom, prenom')
    .eq('classe_id', params.classeId)
    .eq('statut', 'actif');

  if (elevesError) return NextResponse.json({ error: elevesError.message }, { status: 500 });

  const idsSansNom = (elevesRaw || []).filter((e) => !e.nom || !e.prenom).map((e) => e.id);
  const profilsMap = new Map<string, { nom: string; prenom: string }>();
  if (idsSansNom.length > 0) {
    const { data: profils } = await admin
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
