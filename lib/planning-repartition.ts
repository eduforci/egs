// Répartition des professeurs puis génération de l'emploi du temps.
// Logique : les classes et le tableau officiel donnent les cours à placer ; les vacataires reçoivent des cours en
// premier (dans la limite de leur plafond et de leurs disponibilités) ; le reste est réparti entre les permanents,
// sans plafond (cible indicative : 21 h au collège, 18 h au lycée, utilisée pour équilibrer).

import { enMinutes, estDisponible, type Disponibilite } from '@/lib/planning';
import {
  genererEmploiDuTemps,
  type EntreeG,
  type ItemG,
  type JourG,
  type PeriodeG,
  type ProfG,
  type SortieG,
} from '@/lib/planning-generation';

export const CIBLE_COLLEGE = 21;
export const CIBLE_LYCEE = 18;
const PLAFOND_VACATAIRE_DEFAUT = 12;

export type ProfR = ProfG & {
  nom?: string;
  disciplines: string[]; // clés du tableau officiel (anglais, maths, ...)
  cycle: string | null; // 'college' | 'lycee' | null
  cycleStrict: boolean; // true si l'école a précisé qu'il n'enseigne que dans ce cycle
  affectes: string[]; // "classeId|matiereId" déjà affectés
};
export type UniteR = ItemG & { cle: string | null; classeNom: string; groupe?: string; discipline?: string | null };
export const MAX_CLASSES_EPS_ENSEMBLE = 2;
export type ChargeR = { profId: string; nom: string; heures: number; vacataire: boolean; cible: number };

// EPS : le jumelage est une possibilité (utilisée en cas de manque de professeur), jamais une obligation.
const cleJumelage = (u: { groupe?: string; heures: number; matiereId: string }) => (u.groupe ?? '') + '|' + u.heures + '|' + u.matiereId;
const cleUnite = (u: { classeId: string; matiereId: string }) => u.classeId + '|' + u.matiereId;

function heuresDisponibles(p: ProfR, jours: JourG[], periodes: Record<string, PeriodeG[]>): number {
  let meilleur = 0;
  for (const cycle of Object.keys(periodes)) {
    let total = 0;
    for (const j of jours) {
      for (const per of periodes[cycle]) {
        if (per.pause) continue;
        if (j.fin && enMinutes(per.fin) > enMinutes(j.fin)) continue;
        if (!estDisponible(p.dispos as Disponibilite[], j.jour, per.debut, per.fin)) continue;
        total += (enMinutes(per.fin) - enMinutes(per.debut)) / 60;
      }
    }
    meilleur = Math.max(meilleur, total);
  }
  return meilleur;
}

export function plafondVacataire(p: ProfR, jours: JourG[], periodes: Record<string, PeriodeG[]>): number {
  if (p.maxHeures !== null) return p.maxHeures;
  if (p.dispos.length === 0) return PLAFOND_VACATAIRE_DEFAUT;
  return Math.max(1, Math.floor(heuresDisponibles(p, jours, periodes) * 0.7));
}

// Un professeur n'enseigne qu'UNE langue vivante : celle qu'il enseigne déjà (affectations, discipline précisée)
// ou, s'il est déclaré « LV2 » en général, la première langue qui lui est confiée.
function langueOk(p: ProfR, u: UniteR, langueDe: (p: ProfR) => string | null): boolean {
  const d = u.discipline ?? u.cle;
  if (!d || !d.startsWith('lv2_')) return true;
  const connues = p.disciplines.filter((x) => x.startsWith('lv2_'));
  if (connues.length > 0) return connues.includes(d);
  const prise = langueDe(p);
  return prise === null || prise === d;
}

function eligible(p: ProfR, u: UniteR, langueDe: (p: ProfR) => string | null): boolean {
  if (p.cycleStrict && p.cycle && p.cycle !== u.cycle) return false;
  if (!langueOk(p, u, langueDe)) return false;
  if (p.affectes.includes(cleUnite(u))) return true;
  const d = u.discipline ?? u.cle;
  if (d === null) return false;
  if (p.disciplines.includes(d)) return true;
  // une langue précise (allemand, espagnol) n'est confiée qu'à un professeur de cette langue ;
  // la discipline générale « lv2 » déclarée par l'école vaut pour toutes les langues
  if (d.startsWith('lv2_') && p.disciplines.includes('lv2')) return true;
  if (d === 'lv2' && p.disciplines.some((x) => x.startsWith('lv2'))) return true;
  return false;
}

export function repartir(
  unites: UniteR[],
  profs: ProfR[],
  jours: JourG[],
  periodes: Record<string, PeriodeG[]>,
  exclusions: Map<string, Set<string>>,
  sansVacataire: Set<string>,
  jumelables: Set<string> = new Set()
): { items: ItemG[]; sansProf: UniteR[]; charges: ChargeR[] } {
  // EPS : deux classes du même niveau (même volume) sont jumelées et comptent pour un seul cours.
  const toutes = unites;
  const partenaires = new Map<string, UniteR[]>(); // clé du cours « maître » -> classes jumelées
  const jumelees = new Set<string>();
  const parGroupe = new Map<string, UniteR[]>();
  for (const u of toutes) {
    if (u.cle !== 'eps' || !u.groupe) continue;
    const k = cleJumelage(u);
    if (!jumelables.has(k)) continue;
    parGroupe.set(k, [...(parGroupe.get(k) || []), u]);
  }
  for (const l of Array.from(parGroupe.values())) {
    l.sort((a, b) => a.classeNom.localeCompare(b.classeNom, 'fr', { numeric: true }));
    for (let i = 0; i < l.length; i += MAX_CLASSES_EPS_ENSEMBLE) {
      const groupe = l.slice(i, i + MAX_CLASSES_EPS_ENSEMBLE);
      if (groupe.length < 2) continue;
      partenaires.set(cleUnite(groupe[0]), groupe.slice(1));
      groupe.slice(1).forEach((x) => jumelees.add(cleUnite(x)));
    }
  }
  unites = toutes.filter((u) => !jumelees.has(cleUnite(u)));
  const charge = new Map<string, number>(profs.map((p) => [p.id, 0]));
  const affecte = new Map<string, string>(); // unité -> prof
  const exclu = (p: ProfR, u: UniteR) => exclusions.get(cleUnite(u))?.has(p.id) === true;
  // langue vivante déjà confiée à ce professeur dans la répartition en cours
  const langueDe = (p: ProfR): string | null => {
    for (const x of unites) {
      if (affecte.get(cleUnite(x)) !== p.id) continue;
      const d = x.discipline ?? x.cle;
      if (d && d.startsWith('lv2_')) return d;
    }
    return null;
  };

  // 1) Les vacataires d'abord : ceux qui ont le moins de disponibilités passent en premier.
  const vacataires = profs
    .filter((p) => p.vacataire)
    .map((p) => ({ p, cap: plafondVacataire(p, jours, periodes) }))
    .sort((a, b) => (a.p.dispos.length > 0 ? 0 : 1) - (b.p.dispos.length > 0 ? 0 : 1) || a.cap - b.cap);
  for (const { p, cap } of vacataires) {
    const candidats = unites
      .filter((u) => !affecte.has(cleUnite(u)) && !sansVacataire.has(cleUnite(u)) && !exclu(p, u) && eligible(p, u, langueDe))
      .sort(
        (a, b) =>
          Number(p.affectes.includes(cleUnite(b))) - Number(p.affectes.includes(cleUnite(a))) ||
          a.classeNom.localeCompare(b.classeNom, 'fr') ||
          b.heures - a.heures
      );
    for (const u of candidats) {
      if ((charge.get(p.id) || 0) + u.heures > cap + 1e-6) continue;
      affecte.set(cleUnite(u), p.id);
      charge.set(p.id, (charge.get(p.id) || 0) + u.heures);
    }
  }

  // 2) Les permanents : d'abord les affectations déjà existantes, puis le reste, équilibré, sans plafond.
  const permanents = profs.filter((p) => !p.vacataire);
  const cible = (p: ProfR) => (p.cycle === 'lycee' ? CIBLE_LYCEE : CIBLE_COLLEGE);
  for (const u of unites) {
    if (affecte.has(cleUnite(u))) continue;
    const p = permanents.find((x) => x.affectes.includes(cleUnite(u)) && !exclu(x, u) && eligible(x, u, langueDe));
    if (p) {
      affecte.set(cleUnite(u), p.id);
      charge.set(p.id, (charge.get(p.id) || 0) + u.heures);
    }
  }
  const restantes = unites
    .filter((u) => !affecte.has(cleUnite(u)))
    .sort((a, b) => b.heures - a.heures || a.classeNom.localeCompare(b.classeNom, 'fr'));
  const sansProf: UniteR[] = [];
  for (const u of restantes) {
    const candidats = permanents.filter((p) => !exclu(p, u) && eligible(p, u, langueDe));
    if (candidats.length === 0) {
      sansProf.push(u);
      continue;
    }
    candidats.sort((a, b) => {
      const ra = (charge.get(a.id) || 0) / cible(a);
      const rb = (charge.get(b.id) || 0) / cible(b);
      if (Math.abs(ra - rb) > 1e-9) return ra - rb;
      // à charge égale : celui qui a déjà une classe du même niveau
      const memeNiveau = (p: ProfR) =>
        unites.some((x) => affecte.get(cleUnite(x)) === p.id && x.cle === u.cle && x.classeNom.slice(0, 2) === u.classeNom.slice(0, 2));
      return Number(memeNiveau(b)) - Number(memeNiveau(a)) || a.id.localeCompare(b.id);
    });
    const choisi = candidats[0];
    affecte.set(cleUnite(u), choisi.id);
    charge.set(choisi.id, (charge.get(choisi.id) || 0) + u.heures);
  }

  const items: ItemG[] = [];
  for (const u of unites) {
    const profId = affecte.get(cleUnite(u)) ?? null;
    const autres = partenaires.get(cleUnite(u)) ?? [];
    items.push({
      classeId: u.classeId,
      matiereId: u.matiereId,
      matiereNom: u.matiereNom,
      heures: u.heures,
      cycle: u.cycle,
      profId,
      sansSalle: u.cle === 'eps',
      pleinAir: u.cle === 'eps',
      avec: autres.length ? autres.map((x) => ({ classeId: x.classeId, matiereId: x.matiereId })) : undefined,
    });
    for (const x of autres)
      items.push({ classeId: x.classeId, matiereId: x.matiereId, matiereNom: x.matiereNom, heures: x.heures, cycle: x.cycle, profId, sansSalle: true, pleinAir: true, jumeleA: u.classeId });
  }
  for (const u of Array.from(sansProf)) for (const x of partenaires.get(cleUnite(u)) ?? []) sansProf.push(x);
  const charges: ChargeR[] = profs
    .filter((p) => (charge.get(p.id) || 0) > 0)
    .map((p) => ({ profId: p.id, nom: p.nom || p.id, heures: charge.get(p.id) || 0, vacataire: p.vacataire, cible: p.vacataire ? plafondVacataire(p, jours, periodes) : cible(p) }));
  return { items, sansProf, charges };
}

export type SortieR = SortieG & { charges: ChargeR[]; sansProf: UniteR[]; items: ItemG[] };

// Répartit les professeurs, génère, puis réessaie avec un autre professeur pour les séances non placées.
export function genererAvecRepartition(
  base: Omit<EntreeG, 'items' | 'profs'>,
  unites: UniteR[],
  profs: ProfR[],
  tours = 5
): SortieR {
  const exclusions = new Map<string, Set<string>>();
  const sansVacataire = new Set<string>();
  const jumelables = new Set<string>(); // niveaux dont l'EPS est jumelée, seulement si nécessaire
  let meilleur: SortieR | null = null;
  for (let t = 0; t < tours; t++) {
    const rep = repartir(unites, profs, base.jours, base.periodes, exclusions, sansVacataire, jumelables);
    const sortie = genererEmploiDuTemps({ ...base, profs, items: rep.items }, 12, 2500);
    const resultat: SortieR = { ...sortie, charges: rep.charges, sansProf: rep.sansProf, items: rep.items };
    if (!meilleur || resultat.nonPlaces.length < meilleur.nonPlaces.length) meilleur = resultat;
    if (sortie.nonPlaces.length === 0) break;
    let change = false;
    for (const n of sortie.nonPlaces) {
      if (/salle/i.test(n.raison)) continue; // manque de salles : changer de professeur n'y change rien
      const unite = unites.find((x) => x.classeId === n.classeId && x.matiereId === n.matiereId);
      if (unite && unite.cle === 'eps' && unite.groupe) {
        // Manque de professeur d'EPS : on autorise deux classes du même niveau à faire l'EPS ensemble.
        const kj = cleJumelage(unite);
        if (!jumelables.has(kj)) {
          jumelables.add(kj);
          change = true;
          continue;
        }
      }
      const k = n.classeId + '|' + n.matiereId;
      const it = rep.items.find((i) => i.classeId === n.classeId && i.matiereId === n.matiereId);
      if (!it?.profId) continue;
      const set = exclusions.get(k) || new Set<string>();
      if (!set.has(it.profId)) {
        set.add(it.profId);
        exclusions.set(k, set);
        change = true;
      }
    }
    if (!change) break;
  }
  return meilleur!;
}
