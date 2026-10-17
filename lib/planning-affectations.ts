// Garde les classes en accord avec les emplois du temps : pour chaque cours enregistré avec un
// enseignant, la matière est rattachée à la classe (classes_matieres) et l'enseignant est affecté
// à cette matière dans cette classe (affectations_enseignant).

export type BilanSynchro = { matieresAjoutees: number; affectationsAjoutees: number; affectationsRemplacees: number };

export async function synchroniserAffectations(admin: any, etablissementId: string, classeIds?: string[]): Promise<BilanSynchro> {
  const bilan: BilanSynchro = { matieresAjoutees: 0, affectationsAjoutees: 0, affectationsRemplacees: 0 };

  // cours enregistrés avec un enseignant
  const cours: any[] = [];
  for (let debut = 0; debut < 50000; debut += 1000) {
    let q = admin.from('emploi_du_temps').select('classe_id, matiere_id, enseignant_id, heure_debut, heure_fin')
      .eq('etablissement_id', etablissementId).not('enseignant_id', 'is', null).not('matiere_id', 'is', null);
    if (classeIds && classeIds.length > 0) q = q.in('classe_id', classeIds);
    const { data } = await q.range(debut, debut + 999);
    cours.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  if (cours.length === 0) return bilan;

  // (classe, matière) -> enseignants du cours, avec le nombre de créneaux
  const parCouple = new Map<string, { classe: string; matiere: string; profs: Map<string, number> }>();
  for (const c of cours) {
    const k = `${c.classe_id}|${c.matiere_id}`;
    const e = parCouple.get(k) ?? { classe: c.classe_id as string, matiere: c.matiere_id as string, profs: new Map<string, number>() };
    e.profs.set(c.enseignant_id, (e.profs.get(c.enseignant_id) ?? 0) + 1);
    parCouple.set(k, e);
  }
  const classes = Array.from(new Set(Array.from(parCouple.values()).map((e) => e.classe)));

  const lire = async (table: string, champs: string): Promise<any[]> => {
    const out: any[] = [];
    for (let i = 0; i < classes.length; i += 40) {
      const { data } = await admin.from(table).select(champs).in('classe_id', classes.slice(i, i + 40));
      out.push(...(data ?? []));
    }
    return out;
  };
  const liees = await lire('classes_matieres', 'classe_id, matiere_id');
  const affs = await lire('affectations_enseignant', 'id, classe_id, matiere_id, enseignant_id');
  const dejaLiee = new Set(liees.map((l) => `${l.classe_id}|${l.matiere_id}`));

  // coefficient habituel de chaque matière, repris d'une autre classe qui l'a déjà
  const matieres = Array.from(new Set(Array.from(parCouple.values()).map((e) => e.matiere)));
  const coefParMatiere = new Map<string, number>();
  for (let i = 0; i < matieres.length; i += 40) {
    const { data } = await admin.from('classes_matieres').select('matiere_id, coefficient').in('matiere_id', matieres.slice(i, i + 40));
    (data ?? []).forEach((r: any) => { if (!coefParMatiere.has(r.matiere_id) && r.coefficient != null) coefParMatiere.set(r.matiere_id, Number(r.coefficient)); });
  }

  // 1. matières manquantes dans les classes
  const aLier = Array.from(parCouple.values()).filter((e) => !dejaLiee.has(`${e.classe}|${e.matiere}`))
    .map((e) => ({ classe_id: e.classe, matiere_id: e.matiere, coefficient: coefParMatiere.get(e.matiere) ?? 1 }));
  for (let i = 0; i < aLier.length; i += 200) {
    const { error } = await admin.from('classes_matieres').insert(aLier.slice(i, i + 200));
    if (error) throw new Error(`Rattachement des matières aux classes impossible : ${error.message}`);
  }
  bilan.matieresAjoutees = aLier.length;

  // 2. enseignants : l'emploi du temps fait foi pour ce couple classe + matière
  for (const e of Array.from(parCouple.values())) {
    const voulus = new Set(Array.from(e.profs.keys()));
    const actuelles = affs.filter((a) => a.classe_id === e.classe && a.matiere_id === e.matiere);
    const aSupprimer = actuelles.filter((a) => !voulus.has(a.enseignant_id));
    const presents = new Set(actuelles.map((a) => a.enseignant_id));
    const aAjouter = Array.from(voulus).filter((p) => !presents.has(p));
    if (aSupprimer.length > 0) {
      const { error } = await admin.from('affectations_enseignant').delete().in('id', aSupprimer.map((a) => a.id));
      if (error) throw new Error(`Mise à jour des affectations impossible : ${error.message}`);
      bilan.affectationsRemplacees += aSupprimer.length;
    }
    if (aAjouter.length > 0) {
      const { error } = await admin.from('affectations_enseignant')
        .insert(aAjouter.map((p) => ({ enseignant_id: p, matiere_id: e.matiere, classe_id: e.classe })));
      if (error) throw new Error(`Affectation des enseignants impossible : ${error.message}`);
      bilan.affectationsAjoutees += aAjouter.length;
    }
  }
  return bilan;
}
