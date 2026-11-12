// Outils communs pour les alertes de caisse du promoteur.
// Sans dépendance serveur : utilisable dans les pages serveur et dans les composants client.

export type NiveauAlerte = "urgent" | "a_verifier" | "info";

export type AlerteCaisse = {
  id: string;
  type: string;
  niveau: NiveauAlerte;
  titre: string;
  message: string | null;
  montant: number | null;
  cible_type: string | null;
  cible_id: string | null;
  acteur_nom: string | null;
  lue_le: string | null;
  cree_le: string;
};

export type ReglesAlerte = {
  seuil_sortie: number;
  seuil_justificatif: number;
  seuil_validation: number | null;
  alerte_sans_justificatif: boolean;
  alerte_ecart_cloture: boolean;
  alerte_modification: boolean;
  envoyer_sms: boolean;
};

// Valeurs utilisées tant que le promoteur n'a rien réglé (identiques à celles de la base).
export const REGLES_PAR_DEFAUT: ReglesAlerte = {
  seuil_sortie: 50000,
  seuil_justificatif: 10000,
  seuil_validation: null,
  alerte_sans_justificatif: true,
  alerte_ecart_cloture: true,
  alerte_modification: true,
  envoyer_sms: true,
};

export const NIVEAUX: Record<NiveauAlerte, { label: string; classes: string }> = {
  urgent: { label: "URGENT", classes: "bg-red-100 text-red-800 border-red-200" },
  a_verifier: { label: "À VÉRIFIER", classes: "bg-amber-100 text-amber-900 border-amber-200" },
  info: { label: "INFO", classes: "bg-blue-100 text-blue-800 border-blue-200" },
};

// 85000 -> "85 000"
export function fcfa(valeur: number | null | undefined): string {
  return String(Math.round(Number(valeur ?? 0))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Date et heure lisibles, à l'heure d'Abidjan.
export function dateHeure(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    timeZone: "Africa/Abidjan",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
