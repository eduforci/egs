import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface LigneAgfne {
  matricule: string;
  nom: string;
  prenom: string;
  niveau: string;
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

  const { lignes } = await req.json() as { lignes: LigneAgfne[] };

  if (!Array.isArray(lignes)) {
    return NextResponse.json({ error: 'Fichier invalide : aucune ligne exploitable' }, { status: 400 });
  }

  // Élèves actifs de l'établissement, avec matricule
  const { data: eleves, error } = await supabase
    .from('eleves')
    .select('id, nom, prenom, matricule, classe_id')
    .eq('etablissement_id', profile.etablissement_id)
    .eq('statut', 'actif');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const classeIds = [...new Set(eleves.map((e) => e.classe_id).filter(Boolean))];
  const { data: classes } = await supabase
    .from('classes')
    .select('id, niveau')
    .in('id', classeIds);
  const classesMap = new Map((classes || []).map((c) => [c.id, c.niveau]));

  const normaliser = (s: string) => (s || '').trim().toUpperCase();

  const elevesParMatricule = new Map(
    eleves.filter((e) => e.matricule).map((e) => [normaliser(e.matricule), e])
  );

  // Détection des doublons dans le fichier importé
  const comptageMatricules = new Map<string, number>();
  for (const ligne of lignes) {
    const mat = normaliser(ligne.matricule);
    if (mat) comptageMatricules.set(mat, (comptageMatricules.get(mat) || 0) + 1);
  }

  const conformes: any[] = [];
  const identitesDivergentes: any[] = [];
  const absentsEGS: any[] = [];
  const doublons: any[] = [];
  const matriculesVusAgfne = new Set<string>();

  for (const ligne of lignes) {
    const mat = normaliser(ligne.matricule);
    if (!mat) continue;

    matriculesVusAgfne.add(mat);

    if ((comptageMatricules.get(mat) || 0) > 1) {
      doublons.push({ matricule: ligne.matricule, nom: ligne.nom, prenom: ligne.prenom });
      continue;
    }

    const eleveEgs = elevesParMatricule.get(mat);

    if (!eleveEgs) {
      absentsEGS.push({
        matricule: ligne.matricule,
        nom: ligne.nom,
        prenom: ligne.prenom,
        niveau_agfne: ligne.niveau,
      });
      continue;
    }

    const nomOk = normaliser(eleveEgs.nom) === normaliser(ligne.nom);
    const prenomOk = normaliser(eleveEgs.prenom) === normaliser(ligne.prenom);

    if (nomOk && prenomOk) {
      conformes.push({ matricule: ligne.matricule, nom: ligne.nom, prenom: ligne.prenom });
    } else {
      identitesDivergentes.push({
        matricule: ligne.matricule,
        nom_egs: eleveEgs.nom,
        prenom_egs: eleveEgs.prenom,
        nom_agfne: ligne.nom,
        prenom_agfne: ligne.prenom,
        niveau_egs: classesMap.get(eleveEgs.classe_id) ?? '—',
        niveau_agfne: ligne.niveau,
      });
    }
  }

  // Élèves EGS avec matricule mais absents du fichier AGFNE
  const absentsAgfne = eleves
    .filter((e) => e.matricule && !matriculesVusAgfne.has(normaliser(e.matricule)))
    .map((e) => ({
      matricule: e.matricule,
      nom: e.nom,
      prenom: e.prenom,
      niveau: classesMap.get(e.classe_id) ?? '—',
    }));

  return NextResponse.json({
    resume: {
      total_agfne: lignes.length,
      total_egs: eleves.length,
      conformes: conformes.length,
      identites_divergentes: identitesDivergentes.length,
      absents_egs: absentsEGS.length,
      absents_agfne: absentsAgfne.length,
      doublons: doublons.length,
    },
    identitesDivergentes,
    absentsEGS,
    absentsAgfne,
    doublons,
  });
    }
