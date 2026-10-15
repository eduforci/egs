// N° de table et répartition en salles (15 candidats maximum par salle).

export const CANDIDATS_PAR_SALLE = 15;

export function prefixeExamen(nom: string, type?: string | null): string {
  const base = (type && /^(cepe|bepc|bac)/i.test(type) ? type : nom) || '';
  const m = base.toUpperCase().match(/CEPE|BEPC|BAC/);
  const src = m ? m[0] : base.toUpperCase().replace(/[^A-Z]/g, '');
  return (src.slice(0, 2) || 'EX').padEnd(2, 'X');
}

// "2026-2027" -> "27" ; "2026" -> "26"
export function anneeCourte(annee: string | null | undefined): string {
  const n = (annee ?? '').match(/\d{4}/g);
  if (n && n.length) return n[n.length - 1].slice(2);
  return String(new Date().getFullYear()).slice(2);
}

// 21710080G -> "0080G" ; J25072407 -> "2407J"
export function suffixeMatricule(matricule: string | null | undefined): string {
  const m = (matricule ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!m) return '0000';
  // Matricule « J25072407 » (lettre au début, pas de lettre finale) : la lettre du début remplace la lettre finale.
  const lettre = /[A-Z]$/.test(m) ? m.slice(-1) : /^[A-Z]/.test(m) ? m.charAt(0) : '';
  const chiffres = m.replace(/[^0-9]/g, '');
  return chiffres.slice(-4).padStart(4, '0') + lettre;
}

export type CandidatT = {
  id: string; nom: string; prenom: string; matricule: string | null;
  serie: string | null; classe_nom: string | null;
};

// Numéros uniques : en cas de doublon, suffixe -2, -3...
export function genererNumeros(
  candidats: CandidatT[], prefixe: string, annee: string,
): Map<string, string> {
  const pris = new Set<string>();
  const res = new Map<string, string>();
  const ordre = [...candidats].sort((a, b) =>
    (a.matricule ?? '').localeCompare(b.matricule ?? '') || a.id.localeCompare(b.id));
  for (const c of ordre) {
    const base = `${prefixe}${annee}-${suffixeMatricule(c.matricule)}`;
    let n = base; let k = 2;
    while (pris.has(n)) { n = `${base}-${k}`; k++; }
    pris.add(n); res.set(c.id, n);
  }
  return res;
}

export type Affectation = { id: string; salle: number; salle_serie: string | null };

// Séries séparées si `separerSeries` (BAC) ; salles numérotées 1..n ; max 15.
export function repartirSalles(
  candidats: CandidatT[], numeros: Map<string, string>, separerSeries: boolean,
): Affectation[] {
  const cle = (c: CandidatT) => (separerSeries ? (c.serie ?? '').trim().toUpperCase() || 'SANS SÉRIE' : '');
  const groupes = new Map<string, CandidatT[]>();
  for (const c of candidats) {
    const k = cle(c);
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k)!.push(c);
  }
  const out: Affectation[] = [];
  let salle = 0;
  for (const k of Array.from(groupes.keys()).sort()) {
    const l = groupes.get(k)!.sort((a, b) =>
      (numeros.get(a.id) ?? '').localeCompare(numeros.get(b.id) ?? ''));
    for (let i = 0; i < l.length; i += CANDIDATS_PAR_SALLE) {
      salle++;
      for (const c of l.slice(i, i + CANDIDATS_PAR_SALLE))
        out.push({ id: c.id, salle, salle_serie: separerSeries ? k : null });
    }
  }
  return out;
}
