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

export default function ImportElevesPage() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [lignes, setLignes] = useState<LigneParsee[]>([]);
  const [nomFichier, setNomFichier] = useState('');
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
      },
      {
        Matricule: '23607403P',
        Nom: 'Traoré',
        Prénom: 'Ibrahim',
        Niveau: '6ème',
        Sexe: 'M',
        'Date de naissance': '',
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

  function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;

    setErreurFichier(null);
    setResultats([]);
    setResume(null);
    setNomFichier(fichier.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const classeur = XLSX.read(data, { type: 'binary' });
        const feuille = classeur.Sheets[classeur.SheetNames[0]];
        const lignesBrutes = XLSX.utils.sheet_to_json<Record<string, any>>(feuille, { defval: '' });

        if (lignesBrutes.length === 0) {
          setErreurFichier('Le fichier ne contient aucune ligne exploitable.');
          setLignes([]);
          return;
        }

        const matriculesVus = new Set<string>();

        const parsees: LigneParsee[] = lignesBrutes.map((row) => {
          const cle = (k: string) =>
            Object.keys(row).find((c) => c.trim().toLowerCase() === k.toLowerCase());

          const nom = (row[cle('nom') ?? 'Nom'] ?? '').toString().trim();
          const prenom = (row[cle('prénom') ?? cle('prenom') ?? 'Prénom'] ?? '').toString().trim();
          const matricule = (row[cle('matricule') ?? 'Matricule'] ?? '').toString().trim();
          const niveau = (row[cle('niveau') ?? 'Niveau'] ?? '').toString().trim();
          const sexeRaw = (row[cle('sexe') ?? 'Sexe'] ?? '').toString().trim().toUpperCase();
          const sexe = sexeRaw === 'M' || sexeRaw === 'F' ? sexeRaw : '';
          let dateNaissance = (row[cle('date de naissance') ?? 'Date de naissance'] ?? '')
            .toString()
            .trim();

          if (dateNaissance && !DATE_REGEX.test(dateNaissance)) {
            const dateExcel = new Date(dateNaissance);
            if (!isNaN(dateExcel.getTime())) {
              dateNaissance = dateExcel.toISOString().split('T')[0];
            } else {
              dateNaissance = '';
            }
          }

          let erreurLocale: string | null = null;
          if (!nom || !prenom || !matricule || !niveau) {
            erreurLocale = 'Nom, prénom, matricule et niveau sont obligatoires.';
          } else if (matriculesVus.has(matricule)) {
            erreurLocale = 'Matricule en double dans ce fichier.';
          }

          if (matricule) matriculesVus.add(matricule);

          return {
            nom,
            prenom,
            matricule,
            niveau,
            sexe,
            date_naissance: dateNaissance,
            valide: erreurLocale === null,
            erreurLocale,
          };
        });

        setLignes(parsees);
      } catch (err) {
        setErreurFichier(
          "Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un fichier Excel (.xlsx) ou CSV valide."
        );
        setLignes([]);
      }
    };
    reader.readAsBinaryString(fichier);
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
        Importe une liste d'élèves avec leur matricule officiel (délivré par le ministère)
        depuis un fichier Excel ou CSV. Chaque élève est placé dans la classe par défaut
        de son niveau (créée automatiquement si besoin) ; tu pourras ensuite répartir les
        élèves dans des sous-classes ou classes d'excellence.
      </p>

      {/* Modèle */}
      <div className="border rounded-lg p-4 mb-6">
        <p className="font-semibold text-sm mb-2">1. Télécharger le modèle (optionnel)</p>
        <p className="text-xs text-gray-500 mb-3">
          Colonnes attendues : <strong>Matricule</strong> (officiel, ministère),{' '}
          <strong>Nom</strong>, <strong>Prénom</strong>, <strong>Niveau</strong>{' '}
          (toutes obligatoires), <strong>Sexe</strong> (M/F), <strong>Date de naissance</strong>{' '}
          (AAAA-MM-JJ) — ces deux dernières sont optionnelles.
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

      {/* Upload */}
      <div className="border rounded-lg p-4 mb-6">
        <p className="font-semibold text-sm mb-2">2. Importer ton fichier</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFichier}
          className="text-sm"
        />
        {nomFichier && <p className="text-xs text-gray-500 mt-2">Fichier chargé : {nomFichier}</p>}
        {erreurFichier && (
          <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mt-3">
            {erreurFichier}
          </div>
        )}
      </div>

      {/* Aperçu */}
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
            {importing
              ? 'Import en cours...'
              : `Importer ${nbValides} élève(s)`}
          </button>
        </div>
      )}

      {/* Résultats */}
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
            
