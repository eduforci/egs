// Calcul du relevé de notes universitaire (système LMD) : UE, crédits ECTS, compensation, mentions.
// Fonctions pures, sans accès à la base : on leur passe les données déjà lues.

export type RegleValidation = 'compensation' | 'sans_compensation';

export type ParametresUniv = {
  regle_validation: RegleValidation;
  seuil_ue: number;
  seuil_semestre: number;
  seuil_passable: number;
  seuil_assez_bien: number;
  seuil_bien: number;
  seuil_tres_bien: number;
  rattrapage: boolean;
};

export const PARAMETRES_UNIV_PAR_DEFAUT: ParametresUniv = {
  regle_validation: 'compensation',
  seuil_ue: 10,
  seuil_semestre: 10,
  seuil_passable: 10,
  seuil_assez_bien: 12,
  seuil_bien: 14,
  seuil_tres_bien: 16,
  rattrapage: true,
};

export type UeDef = { id: string; parcours_id: string; semestre: number; code: string | null; intitule: string; credits: number };
export type EcDef = { id: string; ue_id: string; intitule: string; coefficient: number };
export type NoteDef = { ec_id: string; annee_scolaire: string; session: 'normale' | 'rattrapage'; valeur: number };

export type StatutUe = 'validee' | 'compensee' | 'non_validee' | 'incomplete';
export type ResultatPeriode = 'Validé' | 'Non validé' | 'Incomplet';

export type LigneEc = {
  ec_id: string; intitule: string; coefficient: number;
  normale: number | null; rattrapage: number | null; retenue: number | null;
};
export type LigneUe = {
  ue_id: string; code: string | null; intitule: string; credits: number;
  ecs: LigneEc[]; moyenne: number | null; statut: StatutUe; credits_acquis: number;
};
export type SemestreReleve = {
  annee_scolaire: string; parcours_id: string; semestre: number;
  ues: LigneUe[]; moyenne: number | null; credits_total: number; credits_acquis: number;
  mention: string; resultat: ResultatPeriode;
};
export type AnneeReleve = {
  annee_scolaire: string; moyenne: number | null; credits_total: number; credits_acquis: number;
  mention: string; resultat: ResultatPeriode;
};
export type Releve = {
  semestres: SemestreReleve[];
  annees: AnneeReleve[];
  cumul: { moyenne: number | null; credits_total: number; credits_acquis: number };
};

export const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export function mentionPour(moyenne: number, p: ParametresUniv): string {
  if (moyenne >= p.seuil_tres_bien) return 'Très bien';
  if (moyenne >= p.seuil_bien) return 'Bien';
  if (moyenne >= p.seuil_assez_bien) return 'Assez bien';
  if (moyenne >= p.seuil_passable) return 'Passable';
  return '';
}

// Note retenue : avec rattrapage, la meilleure des deux sessions ; sans rattrapage, la session normale seule.
export function noteRetenue(normale: number | null, rattrapage: number | null, p: ParametresUniv): number | null {
  if (!p.rattrapage) return normale;
  if (normale === null) return rattrapage;
  if (rattrapage === null) return normale;
  return Math.max(normale, rattrapage);
}

// Moyenne pondérée par des poids ; null si la liste est vide ou si le total des poids est nul.
function moyennePonderee(valeurs: { v: number; poids: number }[]): number | null {
  const total = valeurs.reduce((s, x) => s + x.poids, 0);
  if (valeurs.length === 0 || total <= 0) return null;
  return round2(valeurs.reduce((s, x) => s + x.v * x.poids, 0) / total);
}

function resultatGlobal(statuts: ('Validé' | 'Non validé' | 'Incomplet')[]): ResultatPeriode {
  if (statuts.length === 0) return 'Incomplet';
  if (statuts.includes('Incomplet')) return 'Incomplet';
  return statuts.every((s) => s === 'Validé') ? 'Validé' : 'Non validé';
}

export function calculerReleve(p: ParametresUniv, ues: UeDef[], ecs: EcDef[], notes: NoteDef[]): Releve {
  const ecParId = new Map(ecs.map((e) => [e.id, e]));
  const ueParId = new Map(ues.map((u) => [u.id, u]));
  const ecsParUe = new Map<string, EcDef[]>();
  for (const e of ecs) {
    const l = ecsParUe.get(e.ue_id) ?? [];
    l.push(e);
    ecsParUe.set(e.ue_id, l);
  }

  // note par (ec, année, session)
  const noteDe = new Map<string, number>();
  for (const n of notes) noteDe.set(`${n.ec_id}|${n.annee_scolaire}|${n.session}`, Number(n.valeur));

  // périodes concernées : (année, parcours, semestre) ayant au moins une note
  const cles = new Map<string, { annee: string; parcours: string; semestre: number }>();
  for (const n of notes) {
    const ec = ecParId.get(n.ec_id);
    const ue = ec ? ueParId.get(ec.ue_id) : undefined;
    if (!ue) continue;
    cles.set(`${n.annee_scolaire}|${ue.parcours_id}|${ue.semestre}`, { annee: n.annee_scolaire, parcours: ue.parcours_id, semestre: ue.semestre });
  }

  const semestres: SemestreReleve[] = [];
  Array.from(cles.values()).forEach((cle) => {
    const uesDuSemestre = ues
      .filter((u) => u.parcours_id === cle.parcours && u.semestre === cle.semestre)
      .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '', 'fr', { numeric: true }) || a.intitule.localeCompare(b.intitule, 'fr'));

    // 1. lignes et moyennes d'UE (une UE est incomplète tant qu'une de ses matières n'a pas de note)
    const brutes = uesDuSemestre.map((u) => {
      const lignesEc: LigneEc[] = (ecsParUe.get(u.id) ?? []).map((e) => {
        const normale = noteDe.has(`${e.id}|${cle.annee}|normale`) ? noteDe.get(`${e.id}|${cle.annee}|normale`)! : null;
        const rattrapage = noteDe.has(`${e.id}|${cle.annee}|rattrapage`) ? noteDe.get(`${e.id}|${cle.annee}|rattrapage`)! : null;
        return { ec_id: e.id, intitule: e.intitule, coefficient: Number(e.coefficient), normale, rattrapage, retenue: noteRetenue(normale, rattrapage, p) };
      });
      const complete = lignesEc.length > 0 && lignesEc.every((l) => l.retenue !== null);
      const moyenne = complete ? moyennePonderee(lignesEc.map((l) => ({ v: l.retenue as number, poids: l.coefficient }))) : null;
      return { u, lignesEc, moyenne };
    });

    // 2. moyenne du semestre, pondérée par les crédits des UE
    const toutesCompletes = brutes.length > 0 && brutes.every((b) => b.moyenne !== null);
    const creditsTotal = brutes.reduce((s, b) => s + Number(b.u.credits), 0);
    let moyenneSemestre: number | null = null;
    if (toutesCompletes) {
      moyenneSemestre = creditsTotal > 0
        ? moyennePonderee(brutes.map((b) => ({ v: b.moyenne as number, poids: Number(b.u.credits) })))
        : round2(brutes.reduce((s, b) => s + (b.moyenne as number), 0) / brutes.length);
    }

    // 3. statut de chaque UE (validée, compensée ou non)
    const lignesUe: LigneUe[] = brutes.map((b) => {
      let statut: StatutUe;
      if (b.moyenne === null) statut = 'incomplete';
      else if (b.moyenne >= p.seuil_ue) statut = 'validee';
      else if (p.regle_validation === 'compensation' && moyenneSemestre !== null && moyenneSemestre >= p.seuil_semestre) statut = 'compensee';
      else statut = 'non_validee';
      const acquis = statut === 'validee' || statut === 'compensee';
      return {
        ue_id: b.u.id, code: b.u.code, intitule: b.u.intitule, credits: Number(b.u.credits),
        ecs: b.lignesEc, moyenne: b.moyenne, statut, credits_acquis: acquis ? Number(b.u.credits) : 0,
      };
    });

    const resultat: ResultatPeriode = lignesUe.length === 0 || lignesUe.some((l) => l.statut === 'incomplete')
      ? 'Incomplet'
      : lignesUe.every((l) => l.statut === 'validee' || l.statut === 'compensee') ? 'Validé' : 'Non validé';

    semestres.push({
      annee_scolaire: cle.annee, parcours_id: cle.parcours, semestre: cle.semestre,
      ues: lignesUe, moyenne: moyenneSemestre, credits_total: creditsTotal,
      credits_acquis: lignesUe.reduce((s, l) => s + l.credits_acquis, 0),
      mention: resultat === 'Validé' && moyenneSemestre !== null ? mentionPour(moyenneSemestre, p) : '',
      resultat,
    });
  });

  semestres.sort((a, b) => a.annee_scolaire.localeCompare(b.annee_scolaire) || a.semestre - b.semestre);

  // Années : moyenne pondérée par les crédits de leurs semestres, seulement si tous sont complets.
  const parAnnee = new Map<string, SemestreReleve[]>();
  for (const s of semestres) {
    const l = parAnnee.get(s.annee_scolaire) ?? [];
    l.push(s);
    parAnnee.set(s.annee_scolaire, l);
  }
  const annees: AnneeReleve[] = Array.from(parAnnee.entries()).map(([annee, liste]) => {
    const completes = liste.every((s) => s.moyenne !== null);
    const moyenne = completes
      ? moyennePonderee(liste.map((s) => ({ v: s.moyenne as number, poids: s.credits_total > 0 ? s.credits_total : 1 })))
      : null;
    const resultat = resultatGlobal(liste.map((s) => s.resultat));
    return {
      annee_scolaire: annee, moyenne,
      credits_total: liste.reduce((s, x) => s + x.credits_total, 0),
      credits_acquis: liste.reduce((s, x) => s + x.credits_acquis, 0),
      mention: resultat === 'Validé' && moyenne !== null ? mentionPour(moyenne, p) : '',
      resultat,
    };
  });

  // Cumul : tous les semestres complets
  const completsTous = semestres.filter((s) => s.moyenne !== null);
  return {
    semestres, annees,
    cumul: {
      moyenne: moyennePonderee(completsTous.map((s) => ({ v: s.moyenne as number, poids: s.credits_total > 0 ? s.credits_total : 1 }))),
      credits_total: semestres.reduce((s, x) => s + x.credits_total, 0),
      credits_acquis: semestres.reduce((s, x) => s + x.credits_acquis, 0),
    },
  };
}

// Remet des réglages bruts (base ou formulaire) dans une forme sûre.
export function normaliserParametres(brut: unknown): ParametresUniv {
  const d = PARAMETRES_UNIV_PAR_DEFAUT;
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const nb = (v: unknown, defaut: number): number => {
    const x = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
    return Number.isFinite(x) && x >= 0 && x <= 20 ? x : defaut;
  };
  const passable = nb(o.seuil_passable, d.seuil_passable);
  const assez = Math.max(passable, nb(o.seuil_assez_bien, d.seuil_assez_bien));
  const bien = Math.max(assez, nb(o.seuil_bien, d.seuil_bien));
  const tres = Math.max(bien, nb(o.seuil_tres_bien, d.seuil_tres_bien));
  return {
    regle_validation: o.regle_validation === 'sans_compensation' ? 'sans_compensation' : 'compensation',
    seuil_ue: nb(o.seuil_ue, d.seuil_ue),
    seuil_semestre: nb(o.seuil_semestre, d.seuil_semestre),
    seuil_passable: passable,
    seuil_assez_bien: assez,
    seuil_bien: bien,
    seuil_tres_bien: tres,
    rattrapage: typeof o.rattrapage === 'boolean' ? o.rattrapage : d.rattrapage,
  };
}
