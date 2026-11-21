// Source unique : quels menus (et pages) sont réservés à quels espaces de travail.
// Un lien absent de cette liste est COMMUN : visible pour tous les espaces.
// Pour corriger la visibilité d'un menu, il suffit de modifier la ligne correspondante ici.
import type { EspaceCode } from '@/lib/espaces';

const CYCLES_SCOLAIRES: EspaceCode[] = ['maternelle', 'primaire', 'secondaire'];
const SECONDAIRE: EspaceCode[] = ['secondaire'];
const SUPERIEUR: EspaceCode[] = ['superieur'];

export const ROUTES_PAR_ESPACE: Record<string, EspaceCode[]> = {
  // Cycles scolaires (tout sauf supérieur)
  '/chef/examens': CYCLES_SCOLAIRES,
  '/chef/bulletins': CYCLES_SCOLAIRES,
  '/direction/modele-bulletin': CYCLES_SCOLAIRES,
  '/direction/cloture': CYCLES_SCOLAIRES,
  '/directeur/notes-validation': CYCLES_SCOLAIRES,
  '/directeur/resultats': CYCLES_SCOLAIRES,

  // Secondaire uniquement
  '/chef/eleves/repartition': SECONDAIRE,
  '/direction/planning': SECONDAIRE,
  '/direction/cio': SECONDAIRE,
  '/directeur-etudes/desps': SECONDAIRE,
  '/directeur-etudes/agfne': SECONDAIRE,

  // Supérieur uniquement
  '/direction/universite': SUPERIEUR,
  '/direction/vacations': SUPERIEUR, // inclut /direction/vacations/contrats
};

// Espaces requis pour une adresse (ou null si la page est commune).
// Fonctionne aussi pour les sous-pages : /direction/planning/enseignants, etc.
export function espacesDeRoute(chemin: string): EspaceCode[] | null {
  if (ROUTES_PAR_ESPACE[chemin]) return ROUTES_PAR_ESPACE[chemin];
  const cle = Object.keys(ROUTES_PAR_ESPACE).find((k) => chemin.startsWith(k + '/'));
  return cle ? ROUTES_PAR_ESPACE[cle] : null;
}

// Un menu s'affiche si l'un des espaces visibles de l'utilisateur est autorisé pour ce lien.
// - menu commun : toujours affiché
// - chargement en cours : les menus spécifiques restent cachés (évite qu'ils clignotent)
// - école sans espaces enregistrés (anciennes écoles) : comportement historique, cycles scolaires
export function menuVisible(href: string, visibles: EspaceCode[], pret: boolean): boolean {
  const requis = espacesDeRoute(href);
  if (!requis) return true;
  if (!pret) return false;
  const effectifs = visibles.length > 0 ? visibles : CYCLES_SCOLAIRES;
  return effectifs.some((e) => requis.includes(e));
}
