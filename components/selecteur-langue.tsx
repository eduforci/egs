'use client';

import { useEffect, useRef, useState } from 'react';
import { useLangue } from '@/lib/i18n/provider';
import { LANGUES, definitionLangue } from '@/lib/i18n/langues';

// Choix de la langue du logiciel : petit bouton (globe + code de la langue) avec un menu déroulant.
// Chaque langue est écrite dans sa propre langue pour que chacun la reconnaisse.
export default function SelecteurLangue() {
  const { langue, changerLangue, t } = useLangue();
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent | TouchEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('mousedown', surClic);
    document.addEventListener('touchstart', surClic);
    document.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('mousedown', surClic);
      document.removeEventListener('touchstart', surClic);
      document.removeEventListener('keydown', surTouche);
    };
  }, [ouvert]);

  const courante = definitionLangue(langue);

  return (
    <div ref={racine} className="relative print:hidden">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-label={`${t('Langue')} : ${courante.nom}`}
        className="flex items-center gap-1.5 border rounded-lg px-2 py-1.5 text-xs bg-white text-neutral-800 hover:bg-neutral-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 12h18M12 3c2.6 2.7 4 5.7 4 9s-1.4 6.3-4 9c-2.6-2.7-4-5.7-4-9s1.4-6.3 4-9z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span className="font-medium">{courante.court}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {ouvert && (
        <ul
          role="listbox"
          aria-label={t('Langue')}
          className="absolute end-0 mt-1 w-44 rounded-lg border bg-white shadow-lg py-1 z-50"
        >
          {LANGUES.map((l) => {
            const actif = l.code === langue;
            return (
              <li key={l.code} role="option" aria-selected={actif}>
                <button
                  type="button"
                  lang={l.code}
                  dir={l.dir}
                  onClick={() => {
                    changerLangue(l.code);
                    setOuvert(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-start ${
                    actif ? 'bg-neutral-100 font-medium text-neutral-900' : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <span>{l.nom}</span>
                  {actif && <span aria-hidden="true">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
