// Les 4 espaces de travail d'un groupe scolaire.
// Un espace n'est pas stocké sur la classe : il se déduit de son cycle et de son type d'enseignement.

export type EspaceCode = 'maternelle' | 'primaire' | 'secondaire' | 'superieur';

export type CycleCode = 'maternelle' | 'primaire' | 'college' | 'lycee' | 'superieur';

export type TypeEnseignement = 'general' | 'technique' | 'professionnel';

export type EspaceDef = {
  code: EspaceCode;
  label: string;
  court: string;
  icone: string;
  description: string;
  cycles: CycleCode[];
  types: TypeEnseignement[];
  niveaux: string[]; // suggestions pour le champ « niveau »
  series: string[]; // suggestions pour le champ « série / filière »
  seriesParType?: Partial<Record<TypeEnseignement, string[]>>;
  niveauxParType?: Partial<Record<TypeEnseignement, string[]>>;
};

export const ESPACES: EspaceDef[] = [
  {
    code: 'maternelle',
    label: 'Maternelle',
    court: 'Maternelle',
    icone: '🧸',
    description: 'Petite, moyenne et grande section.',
    cycles: ['maternelle'],
    types: ['general'],
    niveaux: ['Petite section', 'Moyenne section', 'Grande section'],
    series: [],
  },
  {
    code: 'primaire',
    label: 'Primaire',
    court: 'Primaire',
    icone: '✏️',
    description: 'CP1 à CM2.',
    cycles: ['primaire'],
    types: ['general'],
    niveaux: ['CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2'],
    series: [],
  },
  {
    code: 'secondaire',
    label: 'Secondaire',
    court: 'Secondaire',
    icone: '📚',
    description:
      "Enseignement général (6e à la 3e, puis 2nde A et C jusqu'à la Terminale A, C et D), technique et professionnel.",
    cycles: ['college', 'lycee'],
    types: ['general', 'technique', 'professionnel'],
    niveaux: ['6ème', '5ème', '4ème', '3ème', 'Seconde A', 'Seconde C', 'Première A', 'Première C', 'Première D', 'Terminale A', 'Terminale C', 'Terminale D'],
    series: ['A', 'C', 'D'],
    seriesParType: {
      general: ['A', 'C', 'D'],
      technique: ['E', 'F1', 'F2', 'F3', 'F4', 'G1', 'G2', 'G3'],
      professionnel: ['CAP', 'BEP', 'BT', 'Bac pro'],
    },
    niveauxParType: {
      technique: ['Seconde', 'Première', 'Terminale'],
      professionnel: ['1ère année', '2e année', '3e année'],
    },
  },
  {
    code: 'superieur',
    label: 'Enseignement supérieur',
    court: 'Supérieur',
    icone: '🎓',
    description: 'Cycle LMD, BTS et cycle ingénieur.',
    cycles: ['superieur'],
    types: ['general'],
    niveaux: ['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'BTS 1', 'BTS 2', 'Ingénieur 1', 'Ingénieur 2', 'Ingénieur 3', 'Ingénieur 4', 'Ingénieur 5'],
    series: ['LMD', 'BTS', 'Ingénieur'],
  },
];

export const ESPACES_CODES: EspaceCode[] = ESPACES.map((e) => e.code);

export const CYCLES_LABEL: Record<string, string> = {
  maternelle: 'Maternelle',
  primaire: 'Primaire',
  college: 'Collège',
  lycee: 'Lycée',
  superieur: 'Supérieur',
};

export const TYPES_LABEL: Record<string, string> = {
  general: 'Enseignement général',
  technique: 'Enseignement technique',
  professionnel: 'Enseignement professionnel',
};

export function espaceDef(code: string | null | undefined): EspaceDef | undefined {
  return ESPACES.find((e) => e.code === code);
}

export function estEspaceValide(code: unknown): code is EspaceCode {
  return typeof code === 'string' && (ESPACES_CODES as string[]).includes(code);
}

// Devine le cycle à partir du nom du niveau (6ème, CM2, Terminale...).
export function inferCycle(niveauBrut: string): CycleCode | '' {
  const n = (niveauBrut || '').trim().toLowerCase();
  if (!n) return '';
  if (/(petite section|moyenne section|grande section|maternelle|ps|ms|gs)/.test(n)) return 'maternelle';
  if (/(^cp\s*1|^cp\s*2|^cp1|^cp2|^ce\s*1|^ce1|^ce\s*2|^ce2|^cm\s*1|^cm1|^cm\s*2|^cm2|primaire)/.test(n)) return 'primaire';
  if (/(licence|master|doctorat|bts|ing[ée]nieur|superieur|supérieur)/.test(n)) return 'superieur';
  if (/(6\s*e|6ème|6eme|5\s*e|5ème|5eme|4\s*e|4ème|4eme|3\s*e|3ème|3eme)/.test(n)) return 'college';
  if (/(seconde|2nde|premi[eè]re|terminale|tle|bac)/.test(n)) return 'lycee';
  return '';
}

// FIX PRINCIPAL : ne force plus 'lycee' par défaut
// Une classe vide ne doit pas être rangée en secondaire pour une école primaire
export function espaceDeClasse(
  cycle: string | null | undefined,
  type: string | null | undefined,
  niveau?: string | null
): EspaceCode {
  const c = (cycle || inferCycle(niveau || '') || '').toLowerCase() as CycleCode | '';
  if (c === 'maternelle') return 'maternelle';
  if (c === 'primaire') return 'primaire';
  if (c === 'superieur') return 'superieur';
  if (c === 'college' || c === 'lycee') return 'secondaire';
  // Si on ne sait pas, on retourne secondaire par compatibilité historique,
  // MAIS la création de classe doit utiliser espaceParDefaut() ci-dessous
  return 'secondaire';
}

// NOUVEAU : pour la création de classe, prend le premier espace actif de l'école
export function espaceParDefaut(actifs: EspaceCode[]): EspaceCode {
  if (!actifs || actifs.length === 0) return 'primaire';
  if (actifs.length === 1) return actifs[0];
  // Groupe scolaire : priorité au primaire si présent, sinon secondaire
  if (actifs.includes('primaire')) return 'primaire';
  if (actifs.includes('maternelle')) return 'maternelle';
  return actifs[0];
}

// Formules du secondaire
export type FormuleSecondaire = 'college' | 'college_lycee' | 'college_lycee_tp' | 'technique_professionnel';

export type FormuleDef = {
  code: FormuleSecondaire;
  label: string;
  description: string;
  cycles: CycleCode[];
  types: TypeEnseignement[];
};

export const FORMULES_SECONDAIRE: FormuleDef[] = [
  {
    code: 'college',
    label: 'Secondaire, 1er cycle',
    description: 'Collège : de la 6e à la 3e, enseignement général.',
    cycles: ['college'],
    types: ['general'],
  },
  {
    code: 'college_lycee',
    label: 'Secondaire, 1er et 2nd cycle',
    description: 'Collège et lycée : de la 6e à la Terminale, enseignement général.',
    cycles: ['college', 'lycee'],
    types: ['general'],
  },
  {
    code: 'college_lycee_tp',
    label: 'Secondaire, 1er et 2nd cycle : général, technique et professionnel',
    description: 'De la 6e à la Terminale, avec les enseignements général, technique et professionnel.',
    cycles: ['college', 'lycee'],
    types: ['general', 'technique', 'professionnel'],
  },
  {
    code: 'technique_professionnel',
    label: 'Secondaire technique et professionnel uniquement',
    description: "Établissement sans enseignement général : technique (séries E, F, G...) et professionnel (CAP, BEP, BT, Bac pro).",
    cycles: ['lycee'],
    types: ['technique', 'professionnel'],
  },
];

export function formuleDef(code: unknown): FormuleDef | undefined {
  return FORMULES_SECONDAIRE.find((f) => f.code === code);
}

export const FORMULE_PAR_DEFAUT: FormuleSecondaire = 'college_lycee_tp';

// Formules du supérieur : grande école (filières avec leurs matières) ou université LMD
export type FormuleSuperieur = 'grande_ecole' | 'universite_lmd';

export type FormuleSuperieurDef = {
  code: FormuleSuperieur;
  label: string;
  description: string;
  niveaux: string[]; // suggestions pour le champ « niveau »
  filieres: string[]; // suggestions pour le champ « filière » (libre : l'admin peut en saisir d'autres)
};

export const FORMULES_SUPERIEUR: FormuleSuperieurDef[] = [
  {
    code: 'grande_ecole',
    label: 'Grande école',
    description: 'BTS, cycle ingénieur, management : chaque filière a ses propres matières.',
    niveaux: ['BTS 1', 'BTS 2', 'Ingénieur 1', 'Ingénieur 2', 'Ingénieur 3', 'Ingénieur 4', 'Ingénieur 5'],
    filieres: [
      'Comptabilité et gestion',
      'Informatique de gestion',
      'Commerce international',
      'Logistique et transport',
      'Génie civil',
      'Génie électrique',
      'Génie informatique',
    ],
  },
  {
    code: 'universite_lmd',
    label: 'Université (système LMD)',
    description: 'Licence, Master, Doctorat, par parcours.',
    niveaux: ['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Doctorat 1', 'Doctorat 2', 'Doctorat 3'],
    filieres: ['Droit', 'Sciences économiques', 'Lettres modernes', 'Sciences et technologies', 'Informatique'],
  },
];

export function formuleSuperieurDef(code: unknown): FormuleSuperieurDef | undefined {
  return FORMULES_SUPERIEUR.find((f) => f.code === code);
}
