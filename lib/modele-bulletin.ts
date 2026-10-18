// Modèle de bulletin réglable par école. Par défaut tout est affiché : un bulletin sans réglage
// ressemble exactement au bulletin officiel actuel.

export type ModeleBulletin = {
  // en-tête
  logo: boolean;
  ministere: boolean;
  qr: boolean;
  photo: boolean;
  // colonnes du tableau des matières (Matière et Moyenne sont toujours affichées)
  col_coef: boolean;
  col_total: boolean;
  col_rang: boolean;
  col_appreciation: boolean;
  col_professeur: boolean;
  col_signature: boolean;
  // blocs
  bilans: boolean;
  stats_classe: boolean;
  resultats_annuels: boolean;
  assiduite: boolean;
  mentions_conseil: boolean;
  appreciation_conseil: boolean;
  decision_fin_annee: boolean;
  // textes (vide = texte officiel)
  titre: string;
  libelle_signataire: string;
  texte_pied: string;
};

export const MODELE_PAR_DEFAUT: ModeleBulletin = {
  logo: true, ministere: true, qr: true, photo: true,
  col_coef: true, col_total: true, col_rang: true, col_appreciation: true, col_professeur: true, col_signature: true,
  bilans: true, stats_classe: true, resultats_annuels: true, assiduite: true, mentions_conseil: true,
  appreciation_conseil: true, decision_fin_annee: true,
  titre: '', libelle_signataire: '', texte_pied: '',
};

export const CLES_OUI_NON = (Object.keys(MODELE_PAR_DEFAUT) as (keyof ModeleBulletin)[])
  .filter((k) => typeof MODELE_PAR_DEFAUT[k] === 'boolean');
export const CLES_TEXTE = (Object.keys(MODELE_PAR_DEFAUT) as (keyof ModeleBulletin)[])
  .filter((k) => typeof MODELE_PAR_DEFAUT[k] === 'string');

export const LONGUEUR_MAX_TEXTE = 200;

// Garde seulement les clés connues, avec le bon type ; tout le reste prend la valeur par défaut.
export function normaliserModele(brut: unknown): ModeleBulletin {
  const src = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const sortie: Record<string, unknown> = { ...MODELE_PAR_DEFAUT };
  for (const k of CLES_OUI_NON) if (typeof src[k] === 'boolean') sortie[k] = src[k];
  for (const k of CLES_TEXTE) if (typeof src[k] === 'string') sortie[k] = (src[k] as string).trim().slice(0, LONGUEUR_MAX_TEXTE);
  return sortie as ModeleBulletin;
}
