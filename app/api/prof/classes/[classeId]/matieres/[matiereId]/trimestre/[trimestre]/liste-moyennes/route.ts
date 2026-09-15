import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { classeId: string; matiereId: string; trimestre: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { classeId, matiereId, trimestre } = params;

  const { data: classe, error: classeError } = await supabase
    .from('classes')
    .select('nom, niveau, annee_scolaire, etablissement_id')
    .eq('id', classeId)
    .single();

  if (classeError || !classe) {
    return NextResponse.json({ error: 'Classe introuvable' }, { status: 404 });
  }

  const { data: matiere } = await supabase
    .from('matieres')
    .select('nom')
    .eq('id', matiereId)
    .single();

  const { data: classeMatiere } = await supabase
    .from('classes_matieres')
    .select('coefficient')
    .eq('classe_id', classeId)
    .eq('matiere_id', matiereId)
    .maybeSingle();

  // L'enseignant affiché doit être celui réellement affecté à cette classe/matière,
  // pas forcément la personne connectée (un directeur des études peut aussi consulter cette page).
  const { data: affectation } = await supabase
    .from('affectations_enseignant')
    .select('enseignant_id')
    .eq('classe_id', classeId)
    .eq('matiere_id', matiereId)
    .maybeSingle();

  let enseignantNom = '';
  if (affectation?.enseignant_id) {
    const { data: enseignantProfile } = await supabase
      .from('profiles')
      .select('nom, prenom')
      .eq('id', affectation.enseignant_id)
      .maybeSingle();
    if (enseignantProfile) {
      enseignantNom = `${enseignantProfile.prenom} ${enseignantProfile.nom}`;
    }
  }

  const { data: elevesRaw } = await supabase
    .from('eleves')
    .select('id, matricule')
    .eq('classe_id', classeId);

  const eleveIds = (elevesRaw || []).map((e) => e.id);
  const { data: profilesData } = eleveIds.length > 0
    ? await supabase.from('profiles').select('id, nom, prenom').in('id', eleveIds)
    : { data: [] };
  const profilesMap = new Map((profilesData || []).map((p) => [p.id, p]));

  const { data: evaluations } = await supabase
    .from('evaluations')
    .select('id, bareme_max, coefficient, libelle, categorie, date_evaluation')
    .eq('classe_id', classeId)
    .eq('matiere_id', matiereId)
    .eq('trimestre', trimestre)
    .eq('annee_scolaire', classe.annee_scolaire)
    .order('date_evaluation', { ascending: true });

  const evaluationIds = (evaluations || []).map((e) => e.id);
  const { data: notes } = evaluationIds.length > 0
    ? await supabase
        .from('notes')
        .select('eleve_id, evaluation_id, valeur')
        .in('evaluation_id', evaluationIds)
    : { data: [] };

  const evalsBonus = (evaluations || []).filter((e) => (e.libelle || '').toLowerCase().includes('bonus'));
  const evalsNormales = (evaluations || []).filter((e) => !(e.libelle || '').toLowerCase().includes('bonus'));

  const eleves = (elevesRaw || []).map((e) => {
    const profil = profilesMap.get(e.id);
    const notesEleve = (notes || []).filter((n) => n.eleve_id === e.id);

    const detailNotes = evalsNormales.map((ev) => {
      const n = notesEleve.find((x) => x.evaluation_id === ev.id);
      return { evaluation_id: ev.id, libelle: ev.libelle, bareme_max: ev.bareme_max, valeur: n ? n.valeur : null };
    });

    const totalBonus = evalsBonus.reduce((sum, ev) => {
      const n = notesEleve.find((x) => x.evaluation_id === ev.id);
      return sum + (n ? n.valeur : 0);
    }, 0);

    const termes = evalsNormales
      .map((ev) => {
        const n = notesEleve.find((x) => x.evaluation_id === ev.id);
        if (!n) return null;
        const surVingt = n.valeur * (20 / ev.bareme_max);
        return { val: surVingt, poids: ev.coefficient };
      })
      .filter((t): t is { val: number; poids: number } => t !== null);

    const poidsTotal = termes.reduce((a, t) => a + t.poids, 0);
    const moyenne = termes.length > 0
      ? termes.reduce((a, t) => a + t.val * t.poids, 0) / poidsTotal + totalBonus
      : null;

    const coefficientMatiere = classeMatiere?.coefficient ?? 1;
    const moyenneCoef = moyenne !== null ? moyenne * coefficientMatiere : null;

    return {
      id: e.id,
      matricule: e.matricule,
      nom: profil?.nom ?? '',
      prenom: profil?.prenom ?? '',
      detailNotes,
      bonus: totalBonus,
      moyenne,
      moyenneCoef,
    };
  });

  const classement = eleves
    .filter((e) => e.moyenne !== null)
    .sort((a, b) => (b.moyenne as number) - (a.moyenne as number));

  const rangsMap = new Map<string, string>();
  let i = 0;
  while (i < classement.length) {
    let j = i;
    while (j < classement.length && classement[j].moyenne === classement[i].moyenne) j++;
    const position = i + 1;
    const exAequo = j - i > 1;
    for (let k = i; k < j; k++) {
      rangsMap.set(classement[k].id, `${position}e${exAequo ? ' ex' : ''}`);
    }
    i = j;
  }

  const elevesAvecRang = eleves
    .map((e) => ({ ...e, rang: rangsMap.get(e.id) ?? '-' }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  return NextResponse.json({
    classe: { nom: classe.nom, niveau: classe.niveau, annee_scolaire: classe.annee_scolaire },
    matiere: matiere?.nom ?? '',
    coefficient: classeMatiere?.coefficient ?? null,
    enseignant: enseignantNom,
    trimestre,
    colonnesNotes: evalsNormales.map((ev) => ({ id: ev.id, libelle: ev.libelle, bareme_max: ev.bareme_max })),
    eleves: elevesAvecRang,
  });
}
  
