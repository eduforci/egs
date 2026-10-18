'use client';

import { useEffect, useState } from 'react';
import { MODELE_PAR_DEFAUT, normaliserModele, type ModeleBulletin } from '@/lib/modele-bulletin';

// Un seul appel réseau par chargement de page.
let enCours: Promise<ModeleBulletin> | null = null;
function lireModele(): Promise<ModeleBulletin> {
  if (!enCours) {
    enCours = fetch('/api/modele-bulletin', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => normaliserModele(j?.modele))
      .catch(() => MODELE_PAR_DEFAUT);
  }
  return enCours;
}

// Modèle de bulletin de l'école de l'utilisateur (modèle officiel complet tant que rien n'est réglé).
export function useModeleBulletin(): ModeleBulletin {
  const [modele, setModele] = useState<ModeleBulletin>(MODELE_PAR_DEFAUT);
  useEffect(() => {
    let actif = true;
    lireModele().then((m) => { if (actif) setModele(m); });
    return () => { actif = false; };
  }, []);
  return modele;
}
