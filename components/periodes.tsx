'use client';

import { useEffect, useState } from 'react';
import { NB_PERIODES_DEFAUT, abrevPeriode, adjectifPeriode, libellePeriode, listePeriodes, normaliserNb } from '@/lib/periodes';

// Un seul appel réseau par chargement de page, partagé entre tous les composants.
let enCours: Promise<number> | null = null;
function lireNbPeriodes(): Promise<number> {
  if (!enCours) {
    enCours = fetch('/api/periodes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => normaliserNb(j?.nb))
      .catch(() => NB_PERIODES_DEFAUT);
  }
  return enCours;
}

export function usePeriodes() {
  const [nb, setNb] = useState<number>(NB_PERIODES_DEFAUT);
  useEffect(() => {
    let actif = true;
    lireNbPeriodes().then((n) => { if (actif) setNb(n); });
    return () => { actif = false; };
  }, []);
  return {
    nb,
    numeros: listePeriodes(nb),
    libelle: (n: number | string) => libellePeriode(nb, n),
    abrev: (n: number | string) => abrevPeriode(nb, n),
    adjectif: adjectifPeriode(nb),
  };
}

// À mettre à l'intérieur d'un <select> à la place des trois <option> « Trimestre 1/2/3 ».
export function OptionsPeriodes() {
  const { numeros, libelle } = usePeriodes();
  return (
    <>
      {numeros.map((n) => <option key={n} value={n}>{libelle(n)}</option>)}
    </>
  );
}
