// Outils de texte pour les SMS — utilisables côté navigateur ET côté serveur.
// (Aucun accès réseau ni base de données ici.)

// Jeu de caractères GSM : un SMS en GSM contient 160 caractères.
// Un seul caractère hors GSM (ê, ô, ç, ’, œ...) fait passer tout le SMS en Unicode : 70 caractères
// seulement, donc un coût multiplié. On remplace donc ces caractères avant l'envoi.
const GSM_BASE =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

const SPECIAUX: Record<string, string> = {
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "«": '"',
  "»": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  "œ": "oe",
  "Œ": "OE",
  "°": "",
  " ": " ",
  " ": " ",
  "\t": " ",
};

export function simplifierPourSms(texte: string): string {
  let sortie = "";
  for (const c of Array.from(texte.normalize("NFC"))) {
    if (SPECIAUX[c] !== undefined) {
      sortie += SPECIAUX[c];
      continue;
    }
    if (GSM_BASE.includes(c)) {
      sortie += c;
      continue;
    }
    // Lettre accentuée hors GSM : on garde la lettre sans accent (ê -> e, ç -> c...)
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    sortie += Array.from(base).every((x) => GSM_BASE.includes(x)) ? base : "";
  }
  return sortie;
}

// Nombre de SMS facturés pour un texte déjà simplifié.
export function compterSegments(texte: string): number {
  const n = texte.length;
  if (n === 0) return 0;
  return n <= 160 ? 1 : Math.ceil(n / 153);
}

// Numéros ivoiriens : 10 chiffres (depuis 2021), avec ou sans +225 / 00225.
// Retourne le format international +225XXXXXXXXXX, ou null si le numéro est inutilisable.
export function normaliserNumero(brut: string | null | undefined): string | null {
  if (!brut) return null;
  const texte = String(brut).trim();
  let chiffres = texte.replace(/[^\d]/g, "");
  if (texte.startsWith("+") && chiffres.length >= 8 && chiffres.length <= 15) {
    return `+${chiffres}`;
  }
  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);
  if (chiffres.startsWith("225") && chiffres.length === 13) return `+${chiffres}`;
  if (chiffres.length === 10) return `+225${chiffres}`;
  return null;
}

// 45000 -> "45 000" (espace normal, compatible GSM)
export function formaterMontant(valeur: number): string {
  return String(Math.round(valeur)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// "2026-09-05" -> "05/09/2026"
export function formaterDateCourte(valeur: string | null | undefined): string {
  if (!valeur) return "";
  const d = new Date(valeur);
  if (isNaN(d.getTime())) return String(valeur);
  const jj = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${jj}/${mm}/${d.getUTCFullYear()}`;
}
