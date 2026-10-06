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
  { href: '/prof/profil', libelle: 'Mon profil', prefixes: ['/prof/profil'] },
];

export default function EnseignantNav() {
  const chemin = usePathname() || '';

  // Un seul lien est actif : celui dont le préfixe correspond le mieux à la page
  let meilleur = '';
  let longueur = -1;
  for (const l of LIENS) {
    for (const p of l.prefixes) {
      if (chemin.startsWith(p) && p.length > longueur) {
        meilleur = l.href;
        longueur = p.length;
      }
    }
  }

  return (
    <nav className="flex flex-wrap gap-2 text-sm" aria-label="Espace enseignant">
      {LIENS.map((l) => {
        const actif = l.href === meilleur;
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
