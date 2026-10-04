'use client';

import { usePathname } from 'next/navigation';

// Barre de navigation commune à toutes les pages de l'espace enseignant.
// Liens simples (<a>) : ils fonctionnent aussi sans Internet grâce au mode hors ligne.
const LIENS = [
  { href: '/prof/dashboard', libelle: 'Accueil', prefixes: ['/prof'] },
  { href: '/enseignant/appel', libelle: 'Appel', prefixes: ['/enseignant/appel'] },
  {
    href: '/enseignant/cahier-texte',
    libelle: 'Cahier de texte',
    prefixes: ['/enseignant/cahier-texte'],
  },
  {
    href: '/enseignant/emploi-du-temps',
    libelle: 'Emploi du temps',
    prefixes: ['/enseignant/emploi-du-temps'],
  },
];

export default function EnseignantNav() {
  const chemin = usePathname() || '';

  return (
    <nav className="flex flex-wrap gap-2 text-sm" aria-label="Espace enseignant">
      {LIENS.map((l) => {
        const actif = l.prefixes.some((p) => chemin.startsWith(p));
        return actif ? (
          <span
            key={l.href}
            aria-current="page"
            className="px-3 py-1.5 rounded-full bg-gray-800 text-white"
          >
            {l.libelle}
          </span>
        ) : (
          <a
            key={l.href}
            href={l.href}
            className="px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 bg-white"
          >
            {l.libelle}
          </a>
        );
      })}
    </nav>
  );
}
