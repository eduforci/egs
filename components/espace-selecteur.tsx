'use client';

import { useEspace } from '@/lib/use-espace';
import { espaceDef } from '@/lib/espaces';

// Menu déroulant « espace de travail » affiché dans l'en-tête des écrans de direction.
// Invisible pour une école qui n'a qu'un seul espace.
export default function EspaceSelecteur() {
  const { filtrer, disponibles, espace, changerEspace } = useEspace();
  if (!filtrer || disponibles.length === 0) return null;

  return (
    <select
      value={espace}
      onChange={(e) => changerEspace(e.target.value)}
      aria-label="Espace de travail"
      className="border rounded-lg px-2 py-1.5 text-xs bg-white max-w-[11rem]"
    >
      {disponibles.length > 1 && <option value="">Tous mes espaces</option>}
      {disponibles.map((code) => {
        const d = espaceDef(code);
        return (
          <option key={code} value={code}>
            {d?.icone} {d?.label ?? code}
          </option>
        );
      })}
    </select>
  );
}
