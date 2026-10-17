// Horaires officiels du 1er et du 2nd cycle (tableau de la Direction de la Pédagogie, 2023-2024).
// Heures par semaine. Valeurs vérifiées : leur somme retombe sur les totaux du tableau officiel.
// À régler plus tard : 1re A / Tle A (colonne A1 utilisée par défaut) et séances de travaux pratiques en quinzaine.

export type NiveauCode = '6e' | '5e' | '4e' | '3e' | '2A' | '2C' | '1A' | '1C' | '1D' | 'TA' | 'TC' | 'TD';
export type CleMatiere = 'anglais' | 'dessin' | 'edhc' | 'eps' | 'francais' | 'hg' | 'lv2' | 'maths' | 'philo' | 'pc' | 'svt';

export const NIVEAUX_CODES: NiveauCode[] = ['6e', '5e', '4e', '3e', '2A', '2C', '1A', '1C', '1D', 'TA', 'TC', 'TD'];

export const VOLUMES_OFFICIELS: Record<NiveauCode, Partial<Record<CleMatiere, number>>> = {
  '6e': { anglais: 3, dessin: 1, edhc: 1, eps: 2, francais: 5, hg: 2, maths: 4, pc: 1.5, svt: 1.5 },
  '5e': { anglais: 3, dessin: 1, edhc: 1, eps: 2, francais: 5, hg: 2, maths: 4, pc: 1.5, svt: 1.5 },
  '4e': { anglais: 3, dessin: 1, edhc: 1, eps: 2, francais: 6, hg: 3, lv2: 3, maths: 4, pc: 1.5, svt: 1.5 },
  '3e': { anglais: 3, dessin: 1, edhc: 1, eps: 2, francais: 6, hg: 4, lv2: 3, maths: 4, pc: 2, svt: 2 },
  '2A': { anglais: 3, dessin: 1, eps: 2, francais: 4, hg: 4, lv2: 3, maths: 3, pc: 3.5, svt: 1.5 },
  '2C': { anglais: 3, dessin: 1, eps: 2, francais: 4, hg: 4, lv2: 3, maths: 5, pc: 5, svt: 2 },
  '1A': { anglais: 3, dessin: 1, eps: 2, francais: 4, hg: 4, lv2: 3, maths: 4, philo: 3, pc: 1.75, svt: 1.75 },
  '1C': { anglais: 3, dessin: 1, eps: 2, francais: 3, hg: 4, lv2: 2, maths: 6, philo: 2, pc: 5.5, svt: 2 },
  '1D': { anglais: 3, dessin: 1, eps: 2, francais: 3, hg: 4, lv2: 2, maths: 5, philo: 2, pc: 4.5, svt: 3 },
  TA: { anglais: 3, dessin: 1, eps: 2, francais: 4, hg: 4, lv2: 3, maths: 5, philo: 8, svt: 2 },
  TC: { anglais: 2, dessin: 1, eps: 2, francais: 3, hg: 4, lv2: 2, maths: 8, philo: 3, pc: 6, svt: 2 },
  TD: { anglais: 2, dessin: 1, eps: 2, francais: 3, hg: 4, lv2: 2, maths: 6, philo: 3, pc: 5, svt: 5 },
};

export const NIVEAU_LABEL: Record<NiveauCode, string> = {
  '6e': '6ème', '5e': '5ème', '4e': '4ème', '3e': '3ème', '2A': 'Seconde A', '2C': 'Seconde C',
  '1A': 'Première A', '1C': 'Première C', '1D': 'Première D', TA: 'Terminale A', TC: 'Terminale C', TD: 'Terminale D',
};

// Niveau « famille » : seconde A et seconde C font le même cours d'EPS, comme 6e 1 et 6e 4.
export function groupeNiveau(code: NiveauCode): string {
  if (code === '2A' || code === '2C') return '2nde';
  if (code === '1A' || code === '1C' || code === '1D') return '1ere';
  if (code === 'TA' || code === 'TC' || code === 'TD') return 'term';
  return code;
}

export function cycleDuNiveau(code: NiveauCode): 'college' | 'lycee' {
  return ['6e', '5e', '4e', '3e'].includes(code) ? 'college' : 'lycee';
}

function normaliser(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// "6ème", "Première C", "Tle D", "Seconde A", "1ère D"... -> code du tableau officiel (ou null).
export function niveauVersCode(niveau: string | null | undefined): NiveauCode | null {
  const n = normaliser(niveau || '');
  if (!n) return null;
  const jetons = n.split(' ');
  const serie = jetons.find((j) => /^[acd]\d?$/.test(j))?.[0]?.toUpperCase();
  if (/^(seconde|2nde|2nd|2de)\b/.test(n) || /\bseconde\b/.test(n)) return serie === 'A' || serie === 'C' ? (('2' + serie) as NiveauCode) : null;
  if (/\b(premiere|1ere|1re)\b/.test(n)) return serie === 'A' || serie === 'C' || serie === 'D' ? (('1' + serie) as NiveauCode) : null;
  if (/\b(terminale|tle|term)\b/.test(n)) return serie === 'A' || serie === 'C' || serie === 'D' ? (('T' + serie) as NiveauCode) : null;
  const m = n.match(/^(6|5|4|3)\s?(e|eme|ieme)?\b/);
  if (m) return (m[1] + 'e') as NiveauCode;
  if (/\bsixieme\b/.test(n)) return '6e';
  if (/\bcinquieme\b/.test(n)) return '5e';
  if (/\bquatrieme\b/.test(n)) return '4e';
  if (/\btroisieme\b/.test(n)) return '3e';
  return null;
}

// Niveau officiel d'une classe : on essaie le niveau, puis niveau + série, puis le nom de la classe.
export function niveauDeClasse(c: { niveau?: string | null; nom?: string | null; serie?: string | null }): NiveauCode | null {
  const essais = [
    c.niveau,
    [c.niveau, c.serie].filter(Boolean).join(' '),
    c.nom,
    [c.niveau, c.nom].filter(Boolean).join(' '),
    [c.nom, c.serie].filter(Boolean).join(' '),
  ];
  for (const e of essais) {
    const code = niveauVersCode(e);
    if (code) return code;
  }
  return null;
}

// Discipline précise d'une matière : la LV2 est séparée par langue, car un professeur d'allemand
// n'enseigne pas l'espagnol (et inversement). Les autres matières gardent leur clé officielle.
export function disciplineDeMatiere(nom: string): string | null {
  const cle = cleDeMatiere(nom);
  if (cle !== 'lv2') return cle;
  const n = normaliser(nom);
  const al = /allemand/.test(n);
  const es = /espagnol/.test(n);
  if (al && !es) return 'lv2_allemand';
  if (es && !al) return 'lv2_espagnol';
  return 'lv2';
}

// Nom d'une matière de l'école -> matière du tableau officiel (ou null).
export function cleDeMatiere(nom: string): CleMatiere | null {
  const n = normaliser(nom);
  if (!n) return null;
  if (/education physique|sportive|^eps$|^e p s$/.test(n)) return 'eps';
  if (/anglais/.test(n)) return 'anglais';
  if (/dessin|musical|musique|arts plastique/.test(n)) return 'dessin';
  if (/^edhc$|^e d h c$|droits de l homme|education aux droits|civique|civisme/.test(n)) return 'edhc';
  if (/francais/.test(n)) return 'francais';
  if (/histoire|geograph|^hg$|^h g$/.test(n)) return 'hg';
  if (/allemand|espagnol|^lv ?2$|langue vivante 2/.test(n)) return 'lv2';
  if (/mathemat|^maths?$/.test(n)) return 'maths';
  if (/philo/.test(n)) return 'philo';
  if (/physique|chimie|^pc$|^pct$/.test(n)) return 'pc';
  if (/^svt$|^s v t$|science.*vie/.test(n)) return 'svt';
  return null;
}

// Volumes officiels pour les matières d'une classe. Une seule matière de LV2 reçoit les heures.
export function volumesOfficielsCode(
  code: NiveauCode | null,
  matieres: { id: string; nom: string }[]
): { code: NiveauCode | null; volumes: Map<string, number>; inconnues: string[] } {
  const volumes = new Map<string, number>();
  const inconnues: string[] = [];
  if (!code) return { code, volumes, inconnues: matieres.map((m) => m.nom) };
  const table = VOLUMES_OFFICIELS[code];
  const dejaPris = new Set<CleMatiere>();
  const triees = [...matieres].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  for (const m of triees) {
    const cle = cleDeMatiere(m.nom);
    const h = cle ? table[cle] : undefined;
    if (cle && h !== undefined && !dejaPris.has(cle)) {
      volumes.set(m.id, h);
      dejaPris.add(cle);
    } else {
      inconnues.push(m.nom);
    }
  }
  return { code, volumes, inconnues };
}

export function volumesOfficielsClasse(
  niveau: string | null | undefined,
  matieres: { id: string; nom: string }[]
): { code: NiveauCode | null; volumes: Map<string, number>; inconnues: string[] } {
  return volumesOfficielsCode(niveauVersCode(niveau), matieres);
}
