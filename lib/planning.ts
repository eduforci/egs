// Outils communs à l'espace Planning (emploi du temps).

export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;

export const JOURS_LABEL: Record<string, string> = {
  lundi: 'Lundi',
  mardi: 'Mardi',
  mercredi: 'Mercredi',
  jeudi: 'Jeudi',
  vendredi: 'Vendredi',
  samedi: 'Samedi',
};

export type Disponibilite = { jour: string; heure_debut: string; heure_fin: string };

// "08:30:00" ou "08:30" -> minutes depuis minuit
export function enMinutes(heure: string): number {
  const [h, m] = heure.slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function dureeHeures(debut: string, fin: string): number {
  return Math.max(enMinutes(fin) - enMinutes(debut), 0) / 60;
}

// Les heures affichées sont toujours entières (2 h, 3 h, 4 h...), jamais 1,75 h, 2,5 h ou 3,25 h.
export function heuresEntieres(h: number): number {
  return Math.round(h + 1e-9);
}

export function formaterHeures(h: number): string {
  return heuresEntieres(h) + ' h';
}

// Heures d'une période de cours, en nombre entier : 45 à 89 min = 1 h, 90 à 149 min = 2 h...
// (une période de 55 min compte pour 1 h d'enseignement).
export function heuresDePeriode(debut: string, fin: string): number {
  return Math.max(1, Math.round(dureeHeures(debut, fin)));
}

// Un enseignant sans aucune plage de disponibilité est considéré disponible en permanence.
// Sinon, il ne l'est que si le créneau entre entièrement dans l'une de ses plages du jour.
export function estDisponible(
  dispos: Disponibilite[] | undefined,
  jour: string,
  debut: string,
  fin: string
): boolean {
  if (!dispos || dispos.length === 0) return true;
  const d = enMinutes(debut);
  const f = enMinutes(fin);
  return dispos.some(
    (x) => x.jour === jour && enMinutes(x.heure_debut) <= d && enMinutes(x.heure_fin) >= f
  );
}

// Modes de disponibilité proposés pour chaque jour dans l'écran Professeurs.
export type ModeJour = 'libre' | 'matin' | 'apres_midi' | 'indisponible';

export const FENETRES: Record<Exclude<ModeJour, 'indisponible'>, { debut: string; fin: string }> = {
  libre: { debut: '00:00', fin: '23:59' },
  matin: { debut: '00:00', fin: '12:30' },
  apres_midi: { debut: '12:30', fin: '23:59' },
};

// Retrouve le mode d'un jour à partir des plages enregistrées.
export function modeDuJour(dispos: Disponibilite[], jour: string): ModeJour {
  if (dispos.length === 0) return 'libre';
  const plages = dispos.filter((x) => x.jour === jour);
  if (plages.length === 0) return 'indisponible';
  const debut = Math.min(...plages.map((p) => enMinutes(p.heure_debut)));
  const fin = Math.max(...plages.map((p) => enMinutes(p.heure_fin)));
  if (debut <= 0 && fin >= 23 * 60) return 'libre';
  if (fin <= 12 * 60 + 30) return 'matin';
  if (debut >= 12 * 60 + 30) return 'apres_midi';
  return 'libre';
    }
