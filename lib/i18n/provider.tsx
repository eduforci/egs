'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CLE_STOCKAGE, LANGUE_DEFAUT, definitionLangue, estLangue, type Langue } from '@/lib/i18n/langues';
import { TRADUCTIONS } from '@/lib/i18n/traductions';

type Contexte = {
  langue: Langue;
  changerLangue: (l: Langue) => void;
  // t('Élèves') -> « Students » en anglais. Sans traduction connue, le texte français est affiché tel quel.
  t: (texteFrancais: string) => string;
};

const LangueContext = createContext<Contexte>({
  langue: LANGUE_DEFAUT,
  changerLangue: () => {},
  t: (s) => s,
});

function appliquerSurPage(l: Langue) {
  const html = document.documentElement;
  html.lang = l;
  html.dir = definitionLangue(l).dir; // l'arabe s'écrit de droite à gauche
}

export function LangueProvider({ children }: { children: ReactNode }) {
  const [langue, setLangue] = useState<Langue>(LANGUE_DEFAUT);
  const [pret, setPret] = useState(false);

  // Lecture du choix enregistré sur cet appareil (le texte d'origine reste le français tant que ce n'est pas lu)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CLE_STOCKAGE);
      if (estLangue(v)) setLangue(v);
    } catch {
      /* stockage bloqué : on reste en français */
    }
    setPret(true);
  }, []);

  useEffect(() => {
    if (pret) appliquerSurPage(langue);
  }, [langue, pret]);

  // Changement de langue dans un autre onglet
  useEffect(() => {
    const surStockage = (e: StorageEvent) => {
      if (e.key === CLE_STOCKAGE && estLangue(e.newValue)) setLangue(e.newValue);
    };
    window.addEventListener('storage', surStockage);
    return () => window.removeEventListener('storage', surStockage);
  }, []);

  const changerLangue = useCallback((l: Langue) => {
    setLangue(l);
    try {
      window.localStorage.setItem(CLE_STOCKAGE, l);
    } catch {
      /* ignoré */
    }
  }, []);

  const valeur = useMemo<Contexte>(() => {
    const dico = langue === 'fr' ? null : TRADUCTIONS[langue];
    return { langue, changerLangue, t: (s: string) => (dico && dico[s]) || s };
  }, [langue, changerLangue]);

  return <LangueContext.Provider value={valeur}>{children}</LangueContext.Provider>;
}

export function useLangue() {
  return useContext(LangueContext);
}
