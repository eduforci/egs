'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

type LigneParsee = {
  nom: string;
  prenom: string;
  matricule: string;
  niveau: string;
  sexe: string;
  date_naissance: string;
  lieu_naissance: string;
  valide: boolean;
  erreurLocale: string | null;
};

type ResultatLigne = {
  ligne: number;
  nom: string;
  prenom: string;
  matricule: string;
  succes: boolean;
  motDePasse?: string;
  erreur?: string;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const ENTETES_CONNUES = [
  'matricule', 'nom', 'prénom', 'prenom', 'niveau', 'sexe',
  'date de naissance', 'lieu de naissance',
];

function normaliserDate(valeur: string): string {
  const v = valeur.trim();
  if (!v) return '';
  if (DATE_REGEX.test(v)) return v;
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return '';
}

function construireLignes(rangees: string[][]): LigneParsee[] {
  if (rangees.length === 0) return [];

  let indexDepart = 0;
  let ordre = ['matricule', 'nom', 'prenom', 'niveau', 'sexe', 'date de naissance', 'lieu de naissance'];

  const premiereLigne = rangees[0].map((c) => c.trim().toLowerCase().replace('é', 'e'));
  const ressembleEntete = premiereLigne.some((c) => ENTETES_CONNUES.some((e) => e.replace('é', 'e') === c));

  if (ressembleEntete) {
    ordre = premiereLigne.map((c) => (c === 'prénom' ? 'prenom' : c));
    indexDepart = 1;
  }

  const matriculesVus = new Set<string>();
  const lignes: LigneParsee[] = [];

  for (let i = indexDepart; i < rangees.length; i++) {
    const rangee = rangees[i];
    if (rangee.every((c) => !c.trim())) continue;

    const valeurs: Record<string, string> = {};
    ordre.forEach((cle, idx) => {
      valeurs[cle] = (rangee[idx] ?? '').trim();
    });

    const nom = valeurs['nom'] ?? '';
    const prenom = valeurs['prenom'] ?? '';
    const matricule = valeurs['matricule'] ?? '';
    const niveau = valeurs['niveau'] ?? '';
    const sexeRaw = (valeurs['sexe'] ?? '').toUpperCase();
    const sexe = sexeRaw === 'M' || sexeRaw === 'F' ? sexeRaw : '';
    const dateNaissance = normaliserDate(valeurs['date de naissance'] ?? '');
    const lieuNaissance = (valeurs['lieu de naissance'] ?? '').trim();

    let erreurLocale: string | null = null;
    if (!nom || !prenom || !matricule || !niveau) {
      erreurLocale = 'Nom, prénom, matricule et niveau sont obligatoires.';
    } else if (matriculesVus.has(matricule)) {
      erreurLocale = 'Matricule en double dans ce fichier.';
    }
    if (matricule) matriculesVus.add(matricule);

    lignes.push({
      nom,
      prenom,
      matricule,
      niveau,
      sexe,
      date_naissance: dateNaissance,
      lieu_naissance: lieuNaissance,
      valide: erreurLocale === null,
      erreurLocale,
    });
  }

  return lignes;
}

export default function ImportElevesPage() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [lignes, setLignes] = useState<LigneParsee[]>([]);
  const [nomFichier, setNomFichier] = useState('');
  const [texteCollé, setTexteCollé] = useState('');
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [resultats, setResultats] = useState<ResultatLigne[]>([]);
  const [resume, setResume] = useState<{ nbSucces: number; nbEchecs: number } | null>(null);

  function telechargerModele(format: 'xlsx' | 'csv') {
    const exemple = [
      {
        Matricule: '21427141U',
        Nom: 'Kouassi',
        Prénom: 'Awa',
        Niveau: '6ème',
        Sexe: 'F',
        'Date de naissance': '2013-04-12',
        'Lieu de naissance': 'Abidjan',
      },
      {
        Matricule: '23607403P',
        Nom: 'Traoré',
        Prénom: 'Ibrahim',
        Niveau: '6ème',
        Sexe: 'M',
        'Date de naissance': '',
        'Lieu de naissance': '',
      },
    ];
    const feuille = XLSX.utils.json_to_sheet(exemple);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Élèves');

    if (format === 'xlsx') {
      XLSX.writeFile(classeur, 'modele_import_eleves.xlsx');
    } else {
      const csv = XLSX.utils.sheet_to_csv(feuille);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modele_import_eleves.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  function reinitialiserApercu() {
    setLignes([]);
    setResultats([]);
    setResume(null);
    setErreurFichier(null);
  }

  function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;

    reinitialiserApercu();
    setTexteCollé('');
    setNomFichier(fichier.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const classeur = XLSX.read(data, { type: 'binary' });
        const feuille = classeur.Sheets[classeur.SheetNames[0]];
        const rangees: string[][] = XLSX.utils.sheet_to_json(feuille, {
          header: 1,
          defval: '',
          raw: false,
        });

        if (rangees.length === 0) {
          setErreurFichier('Le fichier ne contient aucune ligne exploitable.');
          return;
        }

        setLignes(construireLignes(rangees.map((r) => r.map((c) => (c ?? '').toString()))));
      } catch (err) {
        setErreurFichier(
          "Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un fichier Excel (.xlsx) ou CSV valide."
        );
      }
    };
    reader.readAsBinaryString(fichier);
  }

  function analyserTexteColle() {
    if (!texteCollé.trim()) return;

    reinitialiserApercu();
    setNomFichier('');
    if (inputRef.current) inputRef.current.value = '';

    const lignesTexte = texteCollé.split(/\r?\n/).filter((l) => l.trim() !== '');
    const separateur = lignesTexte[0]?.includes('\t')
      ? '\t'
      : lignesTexte[0]?.includes(';')
      ? ';'
      : ',';

    const rangees = lignesTexte.map((l) => l.split(separateur));
    const construites = construireLignes(rangees);

    if (construites.length === 0) {
      setErreurFichier("Impossible d'interpréter le texte collé. Vérifie le format (une ligne par élève).");
      return;
    }

    setLignes(construites);
  }

  async function lancerImport() {
    const lignesValides = lignes.filter((l) => l.valide);
    if (lignesValides.length === 0) return;

    setImporting(true);
    setResultats([]);
    setResume(null);

    try {
      const res = await fetch('/api/eleves/import-masse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lignes: lignesValides.map((l) => ({
            nom: l.nom,
            prenom: l.prenom,
            matricule: l.matricule,
            niveau: l.niveau,
            sexe: l.sexe || null,
            date_naissance: l.date_naissance || null,
            lieu_naissance: l.lieu_naissance || null,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErreurFichier(data.error || "Erreur lors de l'import.");
        return;
      }

      setResultats(data.resultats ?? []);
      setResume({ nbSucces: data.nbSucces ?? 0, nbEchecs: data.nbEchecs ?? 0 });
      setLignes([]);
      setNomFichier('');
      setTexteCollé('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setErreurFichier(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setImporting(false);
    }
  }

  function telechargerIdentifiants() {
    const succesRows = resultats
      .filter((r) => r.succes)
      .map((r) => ({
        Nom: r.nom,
        Prénom: r.prenom,
        Identifiant: r.matricule,
        'Mot de passe': r.motDePasse,
      }));

    if (succesRows.length === 0) return;

    const feuille = XLSX.utils.json_to_sheet(succesRows);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Identifiants');
    XLSX.writeFile(classeur, 'identifiants_eleves_importes.xlsx');
  }

  const nbValides = lignes.filter((l) => l.valide).length;
  const nbInvalides = lignes.length - nbValides;

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Import en masse des élèves</h1>
      <p className="text-sm text-gray-500 mb-4">
        Importe une liste d'élèves avec leur matricule officiel (délivré par le ministère),
        soit en envoyant un fichier Excel/CSV, soit en collant directement les données
        copiées depuis un tableau. Chaque élève est placé dans la classe par défaut de son
        niveau (créée automatiquement si besoin) ; tu pourras ensuite répartir les élèves
        dans des sous-classes ou classes d'excellence.
      </p>

      <div className="border rounded-lg p-4 mb-6">
        <p className="font-semibold text-sm mb-2">1. Télécharger le modèle (optionnel)</p>
        <p className="text-xs text-gray-500 mb-3">
          Colonnes attendues, dans cet ordre : <strong>Matricule</strong> (officiel, ministère),{' '}
          <strong>Nom</strong>, <strong>Prénom</strong>, <strong>Niveau</strong>{' '}
          (toutes obligatoires), <strong>Sexe</strong> (M/F), <strong>Date de naissance</strong>{' '}
          (AAAA-MM-JJ), <strong>Lieu de naissance</strong> — ces trois dernières sont optionnelles.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => telechargerModele('xlsx')}
            className="border rounded-md px-3 py-2 text-xs font-medium"
          >
            Modèle Excel (.xlsx)
          </button>
          <button
            onClick={() => telechargerModele('csv')}
            className="border rounded-md px-3 py-2 text-xs font-medium"
          >
            Modèle CSV
          </button>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4">
        <p className="font-semibold text-sm mb-2">2a. Importer un fichier</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFichier}
          className="text-sm"
        />
        {nomFichier && <p className="text-xs text-gray-500 mt-2">Fichier chargé : {nomFichier}</p>}
      </div>

      <div className="border rounded-lg p-4 mb-6">
        <p className="font-semibold text-sm mb-2">2b. Ou coller les données directement</p>
        <p className="text-xs text-gray-500 mb-2">
          Sélectionne et copie les colonnes depuis Excel, Google Sheets ou un tableau, puis
          colle-les ci-dessous (une ligne par élève, colonnes dans l'ordre du modèle).
        </p>
        <textarea
          value={texteCollé}
          onChange={(e) => setTexteCollé(e.target.value)}
          rows={6}
          placeholder="21427141U	Kouassi	Awa	6ème	F	2013-04-12	Abidjan"
          className="w-full border rounded-md px-3 py-2 text-xs font-mono"
        />
        <button
          onClick={analyserTexteColle}
          disabled={!texteCollé.trim()}
          className="mt-2 border rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
        >
          Analyser le texte collé
        </button>
      </div>

      {erreurFichier && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          {erreurFichier}
        </div>
      )}

      {lignes.length > 0 && (
        <div className="border rounded-lg p-4 mb-6">
          <p className="font-semibold text-sm mb-2">
            3. Vérifier avant import — {nbValides} ligne(s) valide(s)
            {nbInvalides > 0 && (
              <span className="text-red-600"> · {nbInvalides} en erreur (ignorée(s))</span>
            )}
          </p>

          <div className="border rounded-md overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-2">Matricule</th>
                  <th className="text-left px-2 py-2">Nom</th>
                  <th className="text-left px-2 py-2">Prénom</th>
                  <th className="text-left px-2 py-2">Niveau</th>
                  <th className="text-left px-2 py-2">Sexe</th>
                  <th className="text-left px-2 py-2">Naissance</th>
                  <th className="text-left px-2 py-2">Lieu</th>
                  <th className="text-left px-2 py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} className={`border-t ${!l.valide ? 'bg-red-50' : ''}`}>
                    <td className="px-2 py-1.5 font-mono">{l.matricule || '—'}</td>
                    <td className="px-2 py-1.5">{l.nom || '—'}</td>
                    <td className="px-2 py-1.5">{l.prenom || '—'}</td>
                    <td className="px-2 py-1.5">{l.niveau || '—'}</td>
                    <td className="px-2 py-1.5">{l.sexe || '-'}</td>
                    <td className="px-2 py-1.5">{l.date_naissance || '-'}</td>
                    <td className="px-2 py-1.5">{l.lieu_naissance || '-'}</td>
                    <td className="px-2 py-1.5">
                      {l.valide ? (
                        <span className="text-green-600">OK</span>
                      ) : (
                        <span className="text-red-600">{l.erreurLocale}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={lancerImport}
            disabled={importing || nbValides === 0}
            className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-50 mt-4"
          >
            {importing ? 'Import en cours...' : `Importer ${nbValides} élève(s)`}
          </button>
        </div>
      )}

      {resume && (
        <div className="border rounded-lg p-4">
          <p className="font-semibold text-sm mb-2">
            Import terminé : {resume.nbSucces} créé(s)
            {resume.nbEchecs > 0 && <span className="text-red-600"> · {resume.nbEchecs} échec(s)</span>}
          </p>

          {resume.nbSucces > 0 && (
            <button
              onClick={telechargerIdentifiants}
              className="border rounded-md px-3 py-2 text-xs font-medium mb-3"
            >
              Télécharger les identifiants (Excel)
            </button>
          )}

          <div className="border rounded-md overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-2">Matricule</th>
                  <th className="text-left px-2 py-2">Élève</th>
                  <th className="text-left px-2 py-2">Résultat</th>
                </tr>
              </thead>
              <tbody>
                {resultats.map((r) => (
                  <tr key={r.ligne} className="border-t">
                    <td className="px-2 py-1.5 font-mono">{r.matricule}</td>
                    <td className="px-2 py-1.5">{r.nom} {r.prenom}</td>
                    <td className="px-2 py-1.5">
                      {r.succes ? (
                        <span className="text-green-600">{r.motDePasse}</span>
                      ) : (
                        <span className="text-red-600">{r.erreur}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
      }
