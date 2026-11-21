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
  '/directeur/bulletins': CYCLES_SCOLAIRES,

  // Aussi utile en maternelle et en primaire (CP1 A, CP1 B...) : tous les cycles scolaires
  '/chef/eleves/repartition': CYCLES_SCOLAIRES,

  // Secondaire uniquement : volumes horaires officiels, orientation (CIO), statistiques DESPS et AGFNE.
  // Le primaire et la maternelle relèvent d'autres structures pour ces suivis officiels.
  '/direction/planning': SECONDAIRE,
  '/direction/cio': SECONDAIRE,
  '/directeur-etudes/desps': SECONDAIRE,
  '/directeur-etudes/agfne': SECONDAIRE,

  // Remontée officielle : une section par cycle
  '/direction/remontee/maternelle': ['maternelle'],
  '/direction/remontee/primaire': ['primaire'],
  '/direction/remontee/cepe': ['primaire'],

  // Supérieur uniquement
  '/direction/universite': SUPERIEUR,
  '/direction/vacations': SUPERIEUR, // inclut /direction/vacations/contrats
};

// Espaces requis pour une adresse (ou null si la page est commune).
// Fonctionne aussi pour les sous-pages : /direction/planning/enseignants, etc.
export function espacesDeRoute(cheminBrut: string): EspaceCode[] | null {
  const chemin = cheminBrut.split('?')[0].split('#')[0];
  if (ROUTES_PAR_ESPACE[chemin]) return ROUTES_PAR_ESPACE[chemin];
  const cle = Object.keys(ROUTES_PAR_ESPACE).find((k) => chemin.startsWith(k + '/'));
  return cle ? ROUTES_PAR_ESPACE[cle] : null;
}

// Espaces effectivement pris en compte :
// si l'école n'a aucun espace enregistré (anciennes écoles), comportement historique : cycles scolaires.
function espacesEffectifs(espaces: EspaceCode[]): EspaceCode[] {
  return espaces.length > 0 ? espaces : CYCLES_SCOLAIRES;
}

// Une page est autorisée si l'un des espaces de l'utilisateur est autorisé pour cette adresse.
// Utilisé par le middleware (accès direct par adresse).
export function routeAutorisee(chemin: string, espaces: EspaceCode[]): boolean {
  const requis = espacesDeRoute(chemin);
  if (!requis) return true;
  return espacesEffectifs(espaces).some((e) => requis.includes(e));
}

// Un menu s'affiche si la page est autorisée.
// - menu commun : toujours affiché
// - chargement en cours : les menus spécifiques restent cachés (évite qu'ils clignotent)
export function menuVisible(href: string, visibles: EspaceCode[], pret: boolean): boolean {
  if (!espacesDeRoute(href)) return true;
  if (!pret) return false;
  return routeAutorisee(href, visibles);
}
