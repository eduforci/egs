// Abréviations usuelles des matières pour les tableaux de classe (colonnes étroites).
const SANS_ACCENT = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const TABLE: [string, string][] = [
  ['mathematiques', 'MATHS'], ['maths', 'MATHS'],
  ['francais', 'FRANC'], ['anglais', 'ANGL'], ['allemand', 'ALL'], ['espagnol', 'ESP'], ['arabe', 'ARAB'],
  ['histoire-geographie', 'HG'], ['histoire geographie', 'HG'], ['histoire et geographie', 'HG'],
  ['histoire', 'HIST'], ['geographie', 'GEO'],
  ['physique-chimie', 'PC'], ['physique chimie', 'PC'], ['physique', 'PHYS'], ['chimie', 'CHIM'],
  ['sciences de la vie et de la terre', 'SVT'], ['svt', 'SVT'],
  ['education physique et sportive', 'EPS'], ['eps', 'EPS'],
  ['education civique et morale', 'ECM'], ['education a la citoyennete', 'ECM'], ['ecm', 'ECM'],
  ['philosophie', 'PHILO'], ['arts plastiques', 'A.PL'], ['education musicale', 'MUS'], ['musique', 'MUS'],
  ['conduite', 'COND'], ['technologie', 'TECH'], ['informatique', 'INFO'], ['tic', 'TIC'],
  ['lecture suivie', 'LECT'], ['expression ecrite', 'E.ECR'], ['dictee', 'DICT'], ['grammaire', 'GRAM'],
  ['economie', 'ECO'], ['comptabilite', 'COMPTA'], ['latin', 'LAT'],
];

export function abregerMatiere(nom: string): string {
  const cle = SANS_ACCENT(nom || '');
  const trouve = TABLE.find(([k]) => k === cle);
  if (trouve) return trouve[1];
  const mots = cle.split(/[\s\-']+/).filter((m) => m.length > 2);
  if (mots.length >= 2) return mots.map((m) => m[0]).join('').toUpperCase();
  return cle.slice(0, 5).toUpperCase() || '—';
}
