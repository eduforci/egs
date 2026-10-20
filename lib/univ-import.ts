// Import en masse des étudiants : lecture souple d'un tableau (fichier Excel/CSV ou texte collé).
// Fonctions pures, utilisées côté page (aperçu) et côté serveur (contrôle avant enregistrement).

export type LigneEtudiant = {
  matricule: string;
  nom: string;
  prenoms: string;
  date_naissance: string; // AAAA-MM-JJ ou vide
  lieu_naissance: string;
};

export type LigneAnalysee = LigneEtudiant & { ligne: number; erreur: string | null };

export const LIMITE_IMPORT = 1000;

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const cleEntete = (s: string) => sansAccents(String(s ?? '')).toLowerCase().replace(/[^a-z]/g, '');

const CORRESPONDANCE: Record<string, keyof LigneEtudiant> = {
  matricule: 'matricule', numeromatricule: 'matricule', nmatricule: 'matricule',
  nom: 'nom', nomdefamille: 'nom',
  prenom: 'prenoms', prenoms: 'prenoms',
  datedenaissance: 'date_naissance', datenaissance: 'date_naissance', naissance: 'date_naissance', nele: 'date_naissance', neele: 'date_naissance',
  lieudenaissance: 'lieu_naissance', lieunaissance: 'lieu_naissance', lieu: 'lieu_naissance',
};

const ORDRE_PAR_DEFAUT: (keyof LigneEtudiant)[] = ['matricule', 'nom', 'prenoms', 'date_naissance', 'lieu_naissance'];

// Dates acceptées : AAAA-MM-JJ, JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA (format ivoirien : jour d'abord).
// Retourne null si la valeur n'est pas une date lisible ('' si vide).
export function lireDate(brut: string): string | null {
  const v = String(brut ?? '').trim();
  if (!v) return '';
  let j: number, m: number, a: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v);
  if (r) { a = +r[1]; m = +r[2]; j = +r[3]; }
  else {
    r = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(v);
    if (!r) return null;
    j = +r[1]; m = +r[2]; a = +r[3];
  }
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || j < 1 || j > 31) return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

const texte = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Contrôle d'une ligne déjà découpée en champs.
export function analyserLigne(champs: Partial<Record<keyof LigneEtudiant, unknown>>, ligne: number): LigneAnalysee {
  const date = lireDate(String(champs.date_naissance ?? ''));
  const l: LigneAnalysee = {
    ligne,
    matricule: texte(champs.matricule, 30),
    nom: texte(champs.nom),
    prenoms: texte(champs.prenoms),
    date_naissance: date ?? '',
    lieu_naissance: texte(champs.lieu_naissance),
    erreur: null,
  };
  if (!l.nom) l.erreur = 'Le nom est obligatoire.';
  else if (date === null) l.erreur = `Date de naissance illisible : « ${texte(champs.date_naissance, 30)} » (format JJ/MM/AAAA).`;
  return l;
}

// Transforme un tableau (lignes de cellules) en lignes analysées. Reconnaît une ligne d'en-têtes.
// Détecte aussi les doublons de matricule à l'intérieur du fichier.
export function analyserTableau(rangees: string[][]): LigneAnalysee[] {
  const lignes = rangees.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (lignes.length === 0) return [];

  let ordre: (keyof LigneEtudiant | null)[] = ORDRE_PAR_DEFAUT;
  let depart = 0;
  const entete = lignes[0].map((c) => CORRESPONDANCE[cleEntete(c)] ?? null);
  if (entete.some((c) => c === 'nom' || c === 'matricule')) {
    ordre = entete;
    depart = 1;
  }

  const vus = new Set<string>();
  const sortie: LigneAnalysee[] = [];
  for (let i = depart; i < lignes.length; i++) {
    const champs: Partial<Record<keyof LigneEtudiant, string>> = {};
    ordre.forEach((cle, idx) => { if (cle) champs[cle] = String(lignes[i][idx] ?? ''); });
    const l = analyserLigne(champs, i + 1);
    if (!l.erreur && l.matricule) {
      const k = l.matricule.toLowerCase();
      if (vus.has(k)) l.erreur = 'Matricule en double dans ce fichier.';
      vus.add(k);
    }
    sortie.push(l);
  }
  return sortie;
}

// Découpe un texte collé (tabulations, points-virgules ou virgules) en tableau.
export function decouperTexte(t: string): string[][] {
  const lignes = t.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lignes.length === 0) return [];
  const sep = lignes[0].includes('\t') ? '\t' : lignes[0].includes(';') ? ';' : ',';
  return lignes.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '')));
}

// Clé de comparaison pour repérer un étudiant déjà présent.
export function cleIdentite(nom: string, prenoms: string, date: string): string {
  return `${sansAccents(nom).toLowerCase()}|${sansAccents(prenoms).toLowerCase()}|${date}`;
}
