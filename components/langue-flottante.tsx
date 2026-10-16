'use client';

import { usePathname } from 'next/navigation';
import SelecteurLangue from '@/components/selecteur-langue';

// Les espaces qui ont un en-tête (chef, directeur, comptable, éducateur, parent) y placent eux-mêmes le choix de la
// langue. L'espace super admin reste en français. Partout ailleurs (connexion, enseignant, élève, secrétariat,
// pages de direction sans menu...), on affiche une barre fine en haut à droite.
const AVEC_ENTETE = ['/chef', '/directeur', '/directeur-etudes', '/comptable', '/educateur', '/parent', '/admin'];

// Pages centrées sur tout l'écran : le sélecteur se superpose au coin sans pousser le contenu.
const SUPERPOSE = ['/login', '/reset-password', '/changer-mot-de-passe', '/abonnement-suspendu'];

const correspond = (chemin: string, prefixe: string) => chemin === prefixe || chemin.startsWith(prefixe + '/');

export default function LangueFlottante() {
  const chemin = usePathname() || '/';
  if (AVEC_ENTETE.some((p) => correspond(chemin, p))) return null;

  if (SUPERPOSE.some((p) => correspond(chemin, p))) {
    return (
      <div className="relative h-0 print:hidden">
        <div className="absolute top-3 end-3 z-50">
          <SelecteurLangue />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end px-3 pt-2 print:hidden">
      <SelecteurLangue />
    </div>
  );
}
