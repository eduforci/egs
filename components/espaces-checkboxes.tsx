'use client';

import { ESPACES, FORMULES_SECONDAIRE, FORMULE_PAR_DEFAUT, type EspaceCode, type FormuleSecondaire } from '@/lib/espaces';

// Type historique (colonne type_etablissement) déduit des espaces cochés.
// Gardé pour la compatibilité avec l'initialisation automatique.
export function typeHistorique(espaces: EspaceCode[]): string {
  const a = (c: EspaceCode) => espaces.includes(c);
  if (a('secondaire') || a('superieur')) return 'college_lycee';
  if (a('primaire')) return 'primaire';
  return 'maternelle';
}

// Cases des espaces de travail. Le secondaire se choisit par formule (une seule à la fois).
export default function EspacesCheckboxes({
  value,
  onChange,
  formule,
  onFormule,
}: {
  value: EspaceCode[];
  onChange: (v: EspaceCode[]) => void;
  formule: FormuleSecondaire | null;
  onFormule: (f: FormuleSecondaire | null) => void;
}) {
  function basculer(code: EspaceCode) {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  }
  // Ecole du secondaire sans formule enregistrée : on affiche la formule historique (tout permis).
  const formuleAffichee = value.includes('secondaire') ? formule ?? FORMULE_PAR_DEFAUT : null;

  function choisirFormule(code: FormuleSecondaire) {
    if (formuleAffichee === code) {
      onChange(value.filter((c) => c !== 'secondaire'));
      onFormule(null);
    } else {
      if (!value.includes('secondaire')) onChange([...value, 'secondaire']);
      onFormule(code);
    }
  }

  const carte = 'flex items-start gap-3 border rounded-lg p-3 bg-white cursor-pointer';
  return (
    <div className="space-y-2">
      {ESPACES.filter((e) => e.code !== 'secondaire' && e.code !== 'superieur').map((e) => (
        <label key={e.code} className={carte}>
          <input type="checkbox" className="mt-1" checked={value.includes(e.code)} onChange={() => basculer(e.code)} />
          <span>
            <span className="font-medium">{e.icone} {e.label}</span>
            <span className="block text-xs text-gray-500">{e.description}</span>
          </span>
        </label>
      ))}

      {FORMULES_SECONDAIRE.map((f) => (
        <label key={f.code} className={carte}>
          <input type="checkbox" className="mt-1" checked={formuleAffichee === f.code} onChange={() => choisirFormule(f.code)} />
          <span>
            <span className="font-medium">📚 {f.label}</span>
            <span className="block text-xs text-gray-500">{f.description}</span>
          </span>
        </label>
      ))}

      {ESPACES.filter((e) => e.code === 'superieur').map((e) => (
        <label key={e.code} className={carte}>
          <input type="checkbox" className="mt-1" checked={value.includes(e.code)} onChange={() => basculer(e.code)} />
          <span>
            <span className="font-medium">{e.icone} {e.label}</span>
            <span className="block text-xs text-gray-500">{e.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
