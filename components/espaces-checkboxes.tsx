'use client';

import { ESPACES, type EspaceCode } from '@/lib/espaces';

// Type historique (colonne type_etablissement) déduit des espaces cochés.
// Gardé pour la compatibilité avec l'initialisation automatique.
export function typeHistorique(espaces: EspaceCode[]): string {
  const a = (c: EspaceCode) => espaces.includes(c);
  if (a('secondaire') || a('superieur')) return 'college_lycee';
  if (a('primaire')) return 'primaire';
  return 'maternelle';
}

export default function EspacesCheckboxes({
  value,
  onChange,
}: {
  value: EspaceCode[];
  onChange: (v: EspaceCode[]) => void;
}) {
  function basculer(code: EspaceCode) {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  }
  return (
    <div className="space-y-2">
      {ESPACES.map((e) => (
        <label key={e.code} className="flex items-start gap-3 border rounded-lg p-3 bg-white cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={value.includes(e.code)}
            onChange={() => basculer(e.code)}
          />
          <span>
            <span className="font-medium">{e.icone} {e.label}</span>
            <span className="block text-xs text-gray-500">{e.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
