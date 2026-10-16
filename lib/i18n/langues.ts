// Langues proposées dans EGS. Le français est la langue d'origine : les textes du logiciel sont écrits en
// français dans le code, et servent de clé pour retrouver leur traduction (voir traductions.ts).

export type Langue = 'fr' | 'en' | 'es' | 'de' | 'pt' | 'zh' | 'ar';

export const LANGUES: { code: Langue; nom: string; court: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', nom: 'English', court: 'EN', dir: 'ltr' },
  { code: 'fr', nom: 'Français', court: 'FR', dir: 'ltr' },
  { code: 'es', nom: 'Español', court: 'ES', dir: 'ltr' },
  { code: 'de', nom: 'Deutsch', court: 'DE', dir: 'ltr' },
  { code: 'pt', nom: 'Português', court: 'PT', dir: 'ltr' },
  { code: 'zh', nom: '中文', court: '中文', dir: 'ltr' },
  { code: 'ar', nom: 'العربية', court: 'عربي', dir: 'rtl' },
];

export const LANGUE_DEFAUT: Langue = 'fr';
export const CLE_STOCKAGE = 'egs_langue';

export function estLangue(v: unknown): v is Langue {
  return typeof v === 'string' && LANGUES.some((l) => l.code === v);
}

export function definitionLangue(code: Langue) {
  return LANGUES.find((l) => l.code === code) ?? LANGUES[1];
}
