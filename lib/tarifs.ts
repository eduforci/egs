// Tarifs d'abonnement : un prix annuel par offre (cycle ou formule) et par tranche d'effectif.
// Une école multi-cycles paie la somme de ses offres, au tarif de la tranche de son effectif total.

export const CODES_TARIF = [
  'maternelle',
  'primaire',
  'secondaire_college',
  'secondaire_college_lycee',
  'secondaire_college_lycee_tp',
  'secondaire_technique_professionnel',
  'superieur',
] as const;

export type CodeTarif = (typeof CODES_TARIF)[number];

export function estCodeTarif(c: unknown): c is CodeTarif {
  return typeof c === 'string' && (CODES_TARIF as readonly string[]).includes(c);
}

// Lignes de facturation d'une école, d'après ses espaces ouverts et sa formule du secondaire.
// Une école du secondaire sans formule enregistrée est facturée au tarif le plus complet (comportement historique).
export function codesTarifEcole(espaces: unknown, formule: unknown): CodeTarif[] {
  const liste = Array.isArray(espaces) ? (espaces as string[]) : [];
  const codes: CodeTarif[] = [];
  if (liste.includes('maternelle')) codes.push('maternelle');
  if (liste.includes('primaire')) codes.push('primaire');
  if (liste.includes('secondaire')) {
    const c = `secondaire_${typeof formule === 'string' && formule ? formule : 'college_lycee_tp'}`;
    codes.push(estCodeTarif(c) ? c : 'secondaire_college_lycee_tp');
  }
  if (liste.includes('superieur')) codes.push('superieur');
  return codes;
}

export type Tranche = { ordre: number; effectif_max: number | null };

// Remet des tranches dans l'ordre ; la dernière est toujours sans limite.
export function normaliserTranches(brut: Tranche[]): Tranche[] {
  const t = [...brut].sort((a, b) => a.ordre - b.ordre);
  return t.map((x, i) => ({ ordre: x.ordre, effectif_max: i === t.length - 1 ? null : x.effectif_max }));
}

// Tranche d'un effectif (null s'il n'y a aucune tranche).
export function trancheDe(effectif: number, tranches: Tranche[]): Tranche | null {
  const t = normaliserTranches(tranches);
  for (const x of t) if (x.effectif_max === null || effectif <= x.effectif_max) return x;
  return t.length ? t[t.length - 1] : null;
}

export function libelleTranche(ordre: number, tranches: Tranche[]): string {
  const t = normaliserTranches(tranches);
  const i = t.findIndex((x) => x.ordre === ordre);
  if (i < 0) return '';
  const min = i === 0 ? 0 : (t[i - 1].effectif_max ?? 0) + 1;
  const max = t[i].effectif_max;
  if (max === null) return `Plus de ${min - 1} élèves`;
  return i === 0 ? `Jusqu'à ${max} élèves` : `${min} à ${max} élèves`;
}

// Prix de la grille : clé `${code}|${ordre}`.
export type Grille = Record<string, number | null | undefined>;
export const cleGrille = (code: string, ordre: number) => `${code}|${ordre}`;

// Montant annuel. `complet` est faux si un des prix de la tranche n'est pas encore saisi.
export function montantEcole(codes: CodeTarif[], grille: Grille, ordre: number | null): { total: number; complet: boolean } {
  let total = 0;
  let complet = codes.length > 0 && ordre !== null;
  for (const c of codes) {
    const p = ordre === null ? undefined : grille[cleGrille(c, ordre)];
    if (typeof p === 'number') total += p;
    else complet = false;
  }
  return { total, complet };
}

export const formaterFCFA = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
