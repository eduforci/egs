// Périodes de l'année : 3 trimestres (par défaut) ou 2 semestres, selon le réglage
// `parametres_pedagogiques.nb_trimestres` de l'école. Les numéros de période restent 1, 2 (, 3) :
// aucune donnée existante ne change, seuls les libellés et les choix proposés s'adaptent.

export type TypePeriode = 'trimestre' | 'semestre';

export const NB_PERIODES_DEFAUT = 3;

export const normaliserNb = (nb: unknown): number => (Number(nb) === 2 ? 2 : 3);

export const typeDepuisNb = (nb: number): TypePeriode => (nb === 2 ? 'semestre' : 'trimestre');

export const listePeriodes = (nb: number): number[] => (nb === 2 ? [1, 2] : [1, 2, 3]);

// « Trimestre 2 » ou « Semestre 2 »
export const libellePeriode = (nb: number, n: number | string): string =>
  `${typeDepuisNb(nb) === 'semestre' ? 'Semestre' : 'Trimestre'} ${n}`;

// « T2 » ou « S2 »
export const abrevPeriode = (nb: number, n: number | string): string =>
  `${typeDepuisNb(nb) === 'semestre' ? 'S' : 'T'}${n}`;

// « trimestrielle » ou « semestrielle » (ex. Moyenne semestrielle)
export const adjectifPeriode = (nb: number): string => (typeDepuisNb(nb) === 'semestre' ? 'semestrielle' : 'trimestrielle');
