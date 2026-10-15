// Matières choisies par niveau (table planning_niveau_matieres, script planning_v5).
// Sans aucune ligne pour un niveau, on garde tout le tableau officiel.

export const LIBELLE_CLE: Record<string, string> = {
  francais: 'Français',
  maths: 'Mathématiques',
  anglais: 'Anglais',
  lv2: 'LV2 (Allemand / Espagnol)',
  hg: 'Histoire-Géographie',
  edhc: 'EDHC',
  philo: 'Philosophie',
  pc: 'Physique-Chimie',
  svt: 'SVT',
  eps: 'EPS',
  dessin: 'Dessin / Éducation musicale',
};

export const CLES_ORDRE = ['francais', 'maths', 'anglais', 'lv2', 'hg', 'edhc', 'philo', 'pc', 'svt', 'eps', 'dessin'];

export type LigneConfig = {
  niveau: string;
  cle: string | null;
  matiere_id: string | null;
  actif: boolean | null;
  volume_hebdo: number | string | null;
};

export type ChoixOfficiel = { actif: boolean; volume: number | null };
export type ChoixPerso = { matiereId: string; actif: boolean; volume: number | null };
export type ConfigNiveau = { officielles: Map<string, ChoixOfficiel>; perso: ChoixPerso[] };

function nombreOuNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Range les lignes de la base par niveau.
export function indexerConfig(lignes: LigneConfig[]): Map<string, ConfigNiveau> {
  const res = new Map<string, ConfigNiveau>();
  for (const l of lignes) {
    if (!l?.niveau) continue;
    const conf = res.get(l.niveau) ?? { officielles: new Map<string, ChoixOfficiel>(), perso: [] as ChoixPerso[] };
    const actif = l.actif !== false;
    const volume = nombreOuNull(l.volume_hebdo);
    if (l.cle) conf.officielles.set(l.cle, { actif, volume });
    else if (l.matiere_id) conf.perso.push({ matiereId: l.matiere_id, actif, volume });
    res.set(l.niveau, conf);
  }
  return res;
}

// "Arabe", "arabe " et "ARABE" sont la même matière.
export function normaliserNom(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
