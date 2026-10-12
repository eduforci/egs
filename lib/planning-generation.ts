// Génération automatique de l'emploi du temps (collège et lycée).
// Règles : jamais deux fois la même matière le même jour pour une classe ; les séances d'une matière
// sont espacées (de préférence 2 jours d'écart, à défaut 1 jour) ; un professeur n'est jamais à deux
// endroits à la fois et respecte ses disponibilités et son plafond d'heures ; les vacataires,
// plus contraints, sont placés en premier.

import { enMinutes, estDisponible, type Disponibilite } from '@/lib/planning';

export type PeriodeG = { id: string; ordre: number; debut: string; fin: string; pause: boolean };
export type ProfG = { id: string; vacataire: boolean; maxHeures: number | null; dispos: Disponibilite[] };
export type JourG = { jour: string; fin: string | null }; // fin = dernière heure de fin autorisée ce jour-là
export type ItemG = {
  classeId: string;
  matiereId: string;
  matiereNom: string;
  heures: number;
  profId: string | null;
  cycle: string; // 'college' | 'lycee'
};
export type OccupeG = { profId: string; jour: string; debut: string; fin: string };

export type EntreeG = {
  jours: JourG[];
  periodes: Record<string, PeriodeG[]>; // par cycle
  profs: ProfG[];
  items: ItemG[];
  occupes: OccupeG[]; // cours déjà enregistrés d'autres classes (non régénérées)
};

export type PlacementG = {
  classeId: string;
  matiereId: string;
  profId: string | null;
  jour: string;
  periodeId: string;
  debut: string;
  fin: string;
};
export type NonPlaceG = { classeId: string; matiereId: string; matiereNom: string; heures: number; raison: string };
export type SortieG = {
  placements: PlacementG[];
  nonPlaces: NonPlaceG[];
  heuresDemandees: number;
  heuresPlacees: number;
  tentatives: number;
};

// Découpe un volume hebdomadaire en séances (en heures).
export function decouperVolume(v: number): number[] {
  if (v <= 0) return [];
  if (v <= 2) return [v];
  if (v === 3) return [1, 1, 1];
  if (v === 3.5) return [2, 1.5];
  const r: number[] = [];
  let reste = v;
  while (reste >= 2) {
    r.push(2);
    reste -= 2;
  }
  if (reste === 0.5) r[r.length - 1] += 0.5;
  else if (reste > 0) r.push(reste);
  return r;
}

function prng(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Run = PeriodeG[]; // périodes de cours consécutives (sans pause ni trou)

function construireRuns(periodes: PeriodeG[], fin: string | null): Run[] {
  const tri = [...periodes].sort((a, b) => a.ordre - b.ordre);
  const runs: Run[] = [];
  let courant: Run = [];
  const limite = fin ? enMinutes(fin) : null;
  for (const p of tri) {
    const hors = limite !== null && enMinutes(p.fin) > limite;
    if (p.pause || hors) {
      if (courant.length) runs.push(courant);
      courant = [];
      continue;
    }
    const prec = courant[courant.length - 1];
    if (prec && enMinutes(p.debut) - enMinutes(prec.fin) > 15) {
      runs.push(courant);
      courant = [];
    }
    courant.push(p);
  }
  if (courant.length) runs.push(courant);
  return runs;
}

function combinaisons(n: number, k: number): number[][] {
  const res: number[][] = [];
  const rec = (debut: number, acc: number[]) => {
    if (acc.length === k) {
      res.push([...acc]);
      return;
    }
    for (let i = debut; i < n; i++) {
      acc.push(i);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return res;
}

type Intervalle = [number, number];

function tenter(entree: EntreeG, graine: number): SortieG & { penalite: number } {
  const alea = prng(graine);
  const profParId = new Map(entree.profs.map((p) => [p.id, p]));

  // Emploi du temps de chaque jour, par cycle.
  const runsParCycleJour = new Map<string, Run[]>();
  const cycles = Object.keys(entree.periodes);
  for (const c of cycles)
    for (const j of entree.jours) runsParCycleJour.set(c + '|' + j.jour, construireRuns(entree.periodes[c], j.fin));

  const dureeMoyenne = new Map<string, number>();
  for (const c of cycles) {
    const ps = entree.periodes[c].filter((p) => !p.pause);
    const total = ps.reduce((s, p) => s + (enMinutes(p.fin) - enMinutes(p.debut)), 0);
    dureeMoyenne.set(c, ps.length ? total / ps.length : 60);
  }

  // Occupation
  const occClasse = new Map<string, Set<string>>(); // classe|jour -> ids de périodes
  const intervProf = new Map<string, Intervalle[]>(); // prof|jour
  const chargeProf = new Map<string, number>(); // heures
  const chargeJourProf = new Map<string, number>();
  const chargeJourClasse = new Map<string, number>();
  const ajouterInterv = (p: string, j: string, d: number, f: number) => {
    const k = p + '|' + j;
    const l = intervProf.get(k) || [];
    l.push([d, f]);
    intervProf.set(k, l);
  };
  for (const o of entree.occupes) {
    const d = enMinutes(o.debut);
    const f = enMinutes(o.fin);
    ajouterInterv(o.profId, o.jour, d, f);
    chargeProf.set(o.profId, (chargeProf.get(o.profId) || 0) + (f - d) / 60);
  }
  const profLibre = (p: string, j: string, d: number, f: number) =>
    !(intervProf.get(p + '|' + j) || []).some(([a, b]) => d < b && a < f);

  const placements: PlacementG[] = [];
  const nonPlaces: NonPlaceG[] = [];
  let penalite = 0;

  // Ordre de traitement : vacataires, puis professeurs à disponibilités limitées, puis les autres.
  const groupe = (it: ItemG) => {
    const p = it.profId ? profParId.get(it.profId) : null;
    if (!p) return 3;
    if (p.vacataire) return 0;
    return p.dispos.length > 0 ? 1 : 2;
  };
  const items = entree.items
    .map((it) => ({ it, g: groupe(it), cle: alea() }))
    .sort((a, b) => a.g - b.g || b.it.heures - a.it.heures || a.cle - b.cle)
    .map((x) => x.it);

  type Candidat = { run: Run; debutIdx: number; score: number };

  for (const it of items) {
    const prof = it.profId ? profParId.get(it.profId) || null : null;
    const moy = dureeMoyenne.get(it.cycle) || 60;
    const joursOuverts = entree.jours.map((j) => j.jour);
    let seances = decouperVolume(it.heures);
    if (seances.length > joursOuverts.length) {
      // Trop de séances pour le nombre de jours : on regroupe.
      const total = seances.reduce((s, x) => s + x, 0);
      const n = joursOuverts.length;
      seances = Array.from({ length: n }, (_, i) => total / n + (i === 0 ? 0 : 0));
    }
    const tailles = seances.map((h) => Math.max(1, Math.round((h * 60) / moy)));

    const meilleurCreneau = (jour: string, taille: number, rejoue: Candidat | null): Candidat | null => {
      const runs = runsParCycleJour.get(it.cycle + '|' + jour) || [];
      const occ = occClasse.get(it.classeId + '|' + jour) || new Set<string>();
      let best: Candidat | null = rejoue;
      runs.forEach((run, ri) => {
        for (let s = 0; s + taille <= run.length; s++) {
          const bloc = run.slice(s, s + taille);
          if (bloc.some((p) => occ.has(p.id))) continue;
          const d = enMinutes(bloc[0].debut);
          const f = enMinutes(bloc[bloc.length - 1].fin);
          if (prof) {
            if (!estDisponible(prof.dispos, jour, bloc[0].debut, bloc[bloc.length - 1].fin)) continue;
            if (!profLibre(prof.id, jour, d, f)) continue;
            if (prof.maxHeures !== null && (chargeProf.get(prof.id) || 0) + (f - d) / 60 > prof.maxHeures + 1e-6) continue;
          }
          const precOcc = s > 0 && occ.has(run[s - 1].id);
          const suivOcc = s + taille < run.length && occ.has(run[s + taille].id);
          let score = s === 0 || precOcc || suivOcc ? 0 : 4;
          score += ri * 1.5 + s * 0.2 + alea() * 0.6;
          if (prof) score += (chargeJourProf.get(prof.id + '|' + jour) || 0) * 0.3;
          if (!best || score < best.score) best = { run: bloc, debutIdx: s, score };
        }
      });
      return best;
    };

    const poser = (jour: string, bloc: Run) => {
      const k = it.classeId + '|' + jour;
      const occ = occClasse.get(k) || new Set<string>();
      bloc.forEach((p) => occ.add(p.id));
      occClasse.set(k, occ);
      const d = enMinutes(bloc[0].debut);
      const f = enMinutes(bloc[bloc.length - 1].fin);
      if (prof) {
        ajouterInterv(prof.id, jour, d, f);
        chargeProf.set(prof.id, (chargeProf.get(prof.id) || 0) + (f - d) / 60);
        chargeJourProf.set(prof.id + '|' + jour, (chargeJourProf.get(prof.id + '|' + jour) || 0) + (f - d) / 60);
      }
      chargeJourClasse.set(k, (chargeJourClasse.get(k) || 0) + (f - d) / 60);
      bloc.forEach((p) =>
        placements.push({ classeId: it.classeId, matiereId: it.matiereId, profId: it.profId, jour, periodeId: p.id, debut: p.debut, fin: p.fin })
      );
    };
    const defaire = (nb: number, jour: string, bloc: Run) => {
      // retire les derniers placements d'un bloc
      placements.length = placements.length - nb;
      const k = it.classeId + '|' + jour;
      const occ = occClasse.get(k)!;
      bloc.forEach((p) => occ.delete(p.id));
      const d = enMinutes(bloc[0].debut);
      const f = enMinutes(bloc[bloc.length - 1].fin);
      if (prof) {
        const l = intervProf.get(prof.id + '|' + jour)!;
        const idx = l.findIndex(([a, b]) => a === d && b === f);
        if (idx >= 0) l.splice(idx, 1);
        chargeProf.set(prof.id, (chargeProf.get(prof.id) || 0) - (f - d) / 60);
        chargeJourProf.set(prof.id + '|' + jour, (chargeJourProf.get(prof.id + '|' + jour) || 0) - (f - d) / 60);
      }
      chargeJourClasse.set(k, (chargeJourClasse.get(k) || 0) - (f - d) / 60);
    };

    const n = tailles.length;
    const D = joursOuverts.length;
    let reussi = false;

    if (n > 0 && n <= D) {
      // Schémas de jours, du mieux espacé au moins bien espacé.
      const schemas = combinaisons(D, n)
        .map((c) => {
          let sc = 0;
          for (let i = 1; i < c.length; i++) {
            const ecart = c[i] - c[i - 1];
            if (ecart === 1) sc += 40;
            sc += Math.abs(ecart - D / n) * 3;
          }
          c.forEach((idx) => (sc += (chargeJourClasse.get(it.classeId + '|' + joursOuverts[idx]) || 0) * 2));
          return { c, sc: sc + alea() * 4 };
        })
        .sort((a, b) => a.sc - b.sc);

      for (const sch of schemas) {
        const poses: { jour: string; bloc: Run }[] = [];
        let ok = true;
        // les plus longues séances d'abord
        const ordre = tailles.map((t, i) => i).sort((a, b) => tailles[b] - tailles[a]);
        for (let q = 0; q < ordre.length; q++) {
          const jour = joursOuverts[sch.c[q]];
          const cand = meilleurCreneau(jour, tailles[ordre[q]], null);
          if (!cand) {
            ok = false;
            break;
          }
          poser(jour, cand.run);
          poses.push({ jour, bloc: cand.run });
        }
        if (ok) {
          penalite += sch.sc > 40 ? 1 : 0;
          reussi = true;
          break;
        }
        for (let q = poses.length - 1; q >= 0; q--) defaire(poses[q].bloc.length, poses[q].jour, poses[q].bloc);
      }
    }

    if (!reussi) {
      // Repli : séance par séance, sur des jours différents.
      const joursPris = new Set<string>();
      const ordre = tailles.map((t, i) => i).sort((a, b) => tailles[b] - tailles[a]);
      for (const i of ordre) {
        let best: { jour: string; cand: Candidat } | null = null;
        for (const jour of joursOuverts) {
          if (joursPris.has(jour)) continue;
          const cand = meilleurCreneau(jour, tailles[i], null);
          if (cand && (!best || cand.score < best.cand.score)) best = { jour, cand };
        }
        if (best) {
          poser(best.jour, best.cand.run);
          joursPris.add(best.jour);
          penalite += 5;
        } else {
          let raison = 'Plus de créneau libre pour cette classe.';
          if (prof) {
            const dispoOk = joursOuverts.some((j) => (entree.periodes[it.cycle] || []).some((p) => !p.pause && estDisponible(prof.dispos, j, p.debut, p.fin)));
            if (!dispoOk) raison = 'Le professeur n\'est disponible sur aucun créneau de la grille.';
            else if (prof.maxHeures !== null && (chargeProf.get(prof.id) || 0) >= prof.maxHeures - 1e-6)
              raison = `Le professeur a atteint son plafond de ${prof.maxHeures} h par semaine.`;
            else raison = 'Le professeur n\'a plus de créneau libre compatible avec cette classe.';
          }
          nonPlaces.push({ classeId: it.classeId, matiereId: it.matiereId, matiereNom: it.matiereNom, heures: seances[i], raison });
          penalite += 1000;
        }
      }
    }
  }

  const demandees = entree.items.reduce((s, i) => s + i.heures, 0);
  const placees = placements.reduce((s, p) => s + (enMinutes(p.fin) - enMinutes(p.debut)) / 60, 0);
  return { placements, nonPlaces, heuresDemandees: demandees, heuresPlacees: placees, tentatives: 1, penalite };
}

// Lance plusieurs essais et garde le meilleur.
export function genererEmploiDuTemps(entree: EntreeG, maxEssais = 30, budgetMs = 4000): SortieG {
  const debut = Date.now();
  let meilleur: (SortieG & { penalite: number }) | null = null;
  let essais = 0;
  for (let i = 0; i < maxEssais; i++) {
    const r = tenter(entree, 1000 + i * 7919);
    essais++;
    if (!meilleur || r.penalite < meilleur.penalite) meilleur = r;
    if (meilleur.penalite === 0 && essais >= 3) break;
    if (Date.now() - debut > budgetMs) break;
  }
  const { penalite, ...sortie } = meilleur!;
  return { ...sortie, tentatives: essais };
    }
  
