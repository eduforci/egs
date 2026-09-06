'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';

interface Resume {
  total_agfne: number;
  total_egs: number;
  conformes: number;
  identites_divergentes: number;
  absents_egs: number;
  absents_agfne: number;
  doublons: number;
}

interface Rapport {
  resume: Resume;
  identitesDivergentes: any[];
  absentsEGS: any[];
  absentsAgfne: any[];
  doublons: any[];
}

export default function ComparerAgfnePage() {
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [nomFichier, setNomFichier] = useState('');

  async function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErreur(null);
    setRapport(null);
    setNomFichier(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const feuille = workbook.Sheets[workbook.SheetNames[0]];
      const donnees: any[][] = XLSX.utils.sheet_to_json(feuille, { header: 1, defval: '' });

      if (donnees.length < 2) {
        throw new Error('Le fichier ne contient pas de données exploitables (juste un en-tête ou vide).');
      }

      // On ignore la première ligne (en-têtes) et on mappe par position de colonne,
      // selon l'ordre documenté ACTU-ELEVES : 0=Matricule, 1=Nom, 2=Prénom, 4=Niveau
      const lignes = donnees.slice(1)
        .filter((ligne) => ligne.some((cellule) => String(cellule).trim() !== ''))
        .map((ligne) => ({
          matricule: String(ligne[0] ?? '').trim(),
          nom: String(ligne[1] ?? '').trim(),
          prenom: String(ligne[2] ?? '').trim(),
          niveau: String(ligne[4] ?? '').trim(),
        }));

      const res = await fetch('/api/directeur-etudes/agfne/comparer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lignes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur lors de la comparaison');
      setRapport(json);
    } catch (err: any) {
      setErreur(err.message || 'Fichier illisible ou format inattendu');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1" style={{ color: '#0B3D2E' }}>
        Contrôle AGFNE
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Compare le fichier ACTU-ELEVES téléchargé depuis AGFNE avec les élèves d'EGS
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm mb-4">
        ⚠️ Le format exact du fichier AGFNE n'a pas encore été vérifié avec un vrai
        fichier officiel. Ce contrôle part d'une hypothèse (ordre des colonnes documenté)
        — vérifie les résultats avec attention la première fois.
      </div>

      <label className="block mb-4">
        <span className="block text-sm font-medium mb-1">Fichier ACTU-ELEVES (.xlsx ou .csv)</span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFichier}
          disabled={loading}
          className="w-full text-sm"
        />
      </label>

      {loading && <p className="text-sm text-gray-500">Analyse en cours...</p>}
      {erreur && <p className="text-red-600 text-sm mb-4">{erreur}</p>}

      {rapport && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="border rounded p-3">
              <p className="text-xs text-gray-500">Fichier AGFNE</p>
              <p className="text-lg font-bold">{rapport.resume.total_agfne}</p>
            </div>
            <div className="border rounded p-3">
              <p className="text-xs text-gray-500">Actifs dans EGS</p>
              <p className="text-lg font-bold">{rapport.resume.total_egs}</p>
            </div>
            <div className="border rounded p-3" style={{ borderColor: '#0B3D2E' }}>
              <p className="text-xs text-gray-500">✓ Conformes</p>
              <p className="text-lg font-bold" style={{ color: '#0B3D2E' }}>{rapport.resume.conformes}</p>
            </div>
            <div className="border rounded p-3" style={{ borderColor: '#C9962B' }}>
              <p className="text-xs text-gray-500">⚠ Identité divergente</p>
              <p className="text-lg font-bold" style={{ color: '#C9962B' }}>{rapport.resume.identites_divergentes}</p>
            </div>
            <div className="border rounded p-3 border-red-300">
              <p className="text-xs text-gray-500">🔴 Absents d'EGS</p>
              <p className="text-lg font-bold text-red-600">{rapport.resume.absents_egs}</p>
            </div>
            <div className="border rounded p-3 border-red-300">
              <p className="text-xs text-gray-500">🔴 Absents d'AGFNE</p>
              <p className="text-lg font-bold text-red-600">{rapport.resume.absents_agfne}</p>
            </div>
          </div>

          {rapport.resume.doublons > 0 && (
            <p className="text-sm text-amber-700 mb-4">
              ⚠️ {rapport.resume.doublons} matricule(s) en double dans le fichier AGFNE (ignorés du reste du contrôle)
            </p>
          )}

          {rapport.identitesDivergentes.length > 0 && (
            <details className="mb-3" open>
              <summary className="font-semibold cursor-pointer" style={{ color: '#C9962B' }}>
                Identités divergentes ({rapport.identitesDivergentes.length})
              </summary>
              <table className="w-full text-xs border mt-2">
                <thead>
                  <tr style={{ backgroundColor: '#C9962B33' }}>
                    <th className="border p-1 text-left">Matricule</th>
                    <th className="border p-1 text-left">EGS</th>
                    <th className="border p-1 text-left">AGFNE</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.identitesDivergentes.map((d, i) => (
                    <tr key={i}>
                      <td className="border p-1">{d.matricule}</td>
                      <td className="border p-1">{d.prenom_egs} {d.nom_egs} ({d.niveau_egs})</td>
                      <td className="border p-1">{d.prenom_agfne} {d.nom_agfne} ({d.niveau_agfne})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {rapport.absentsEGS.length > 0 && (
            <details className="mb-3">
              <summary className="font-semibold cursor-pointer text-red-600">
                Présents dans AGFNE, absents d'EGS ({rapport.absentsEGS.length})
              </summary>
              <table className="w-full text-xs border mt-2">
                <thead>
                  <tr style={{ backgroundColor: '#C9962B33' }}>
                    <th className="border p-1 text-left">Matricule</th>
                    <th className="border p-1 text-left">Nom</th>
                    <th className="border p-1 text-left">Niveau AGFNE</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.absentsEGS.map((d, i) => (
                    <tr key={i}>
                      <td className="border p-1">{d.matricule}</td>
                      <td className="border p-1">{d.prenom} {d.nom}</td>
                      <td className="border p-1">{d.niveau_agfne}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {rapport.absentsAgfne.length > 0 && (
            <details className="mb-3">
              <summary className="font-semibold cursor-pointer text-red-600">
                Présents dans EGS, absents d'AGFNE ({rapport.absentsAgfne.length})
              </summary>
              <table className="w-full text-xs border mt-2">
                <thead>
                  <tr style={{ backgroundColor: '#C9962B33' }}>
                    <th className="border p-1 text-left">Matricule</th>
                    <th className="border p-1 text-left">Nom</th>
                    <th className="border p-1 text-left">Niveau EGS</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.absentsAgfne.map((d, i) => (
                    <tr key={i}>
                      <td className="border p-1">{d.matricule}</td>
                      <td className="border p-1">{d.prenom} {d.nom}</td>
                      <td className="border p-1">{d.niveau}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </div>
  );
  }
        
