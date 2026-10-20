'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { LIMITE_IMPORT, analyserTableau, decouperTexte, type LigneAnalysee } from '@/lib/univ-import';

type Resultat = { nbAjoutes: number; ignores: { ligne: number; nom: string; raison: string }[] };

export default function ImportEtudiantsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lignes, setLignes] = useState<LigneAnalysee[]>([]);
  const [fichier, setFichier] = useState('');
  const [colle, setColle] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  const remettreAZero = () => { setLignes([]); setResultat(null); setErreur(null); };

  function modele() {
    const feuille = XLSX.utils.json_to_sheet([
      { Matricule: 'UNI-0001', Nom: 'Kouassi', Prénoms: 'Awa Marie', 'Date de naissance': '12/04/2003', 'Lieu de naissance': 'Abidjan' },
      { Matricule: 'UNI-0002', Nom: 'Traoré', Prénoms: 'Ibrahim', 'Date de naissance': '', 'Lieu de naissance': '' },
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Étudiants');
    XLSX.writeFile(classeur, 'modele_import_etudiants.xlsx');
  }

  function lireFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    remettreAZero(); setColle(''); setFichier(f.name);
    const lecteur = new FileReader();
    lecteur.onload = (ev) => {
      try {
        const classeur = XLSX.read(ev.target?.result, { type: 'binary' });
        const feuille = classeur.Sheets[classeur.SheetNames[0]];
        const rangees: unknown[][] = XLSX.utils.sheet_to_json(feuille, { header: 1, defval: '', raw: false });
        const res = analyserTableau(rangees.map((r) => r.map((c) => String(c ?? ''))));
        if (res.length === 0) setErreur('Le fichier ne contient aucune ligne exploitable.');
        else setLignes(res);
      } catch {
        setErreur("Impossible de lire ce fichier. Utilisez un fichier Excel (.xlsx) ou CSV.");
      }
    };
    lecteur.readAsBinaryString(f);
  }

  function analyserColle() {
    if (!colle.trim()) return;
    remettreAZero(); setFichier('');
    if (inputRef.current) inputRef.current.value = '';
    const res = analyserTableau(decouperTexte(colle));
    if (res.length === 0) setErreur("Impossible d'interpréter le texte collé (une ligne par étudiant).");
    else setLignes(res);
  }

  const valides = lignes.filter((l) => !l.erreur);
  const invalides = lignes.length - valides.length;

  async function importer() {
    if (valides.length === 0) return;
    setOccupe(true); setErreur(null);
    try {
      const r = await fetch('/api/universite/etudiants/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lignes: valides.map((l) => ({ matricule: l.matricule, nom: l.nom, prenoms: l.prenoms, date_naissance: l.date_naissance, lieu_naissance: l.lieu_naissance })) }),
      });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error || "Erreur pendant l'import."); if (j.nbAjoutes) setResultat({ nbAjoutes: j.nbAjoutes, ignores: j.ignores ?? [] }); return; }
      setResultat({ nbAjoutes: j.nbAjoutes, ignores: j.ignores ?? [] });
      setLignes([]); setFichier(''); setColle('');
      if (inputRef.current) inputRef.current.value = '';
    } catch { setErreur('Erreur réseau.'); }
    finally { setOccupe(false); }
  }

  return (
    <main className="max-w-xl mx-auto p-4 pb-16 space-y-4">
      <Link href="/direction/universite/etudiants" className="text-sm text-blue-700">← Étudiants</Link>
      <h1 className="text-xl font-bold">Importer des étudiants</h1>
      <p className="text-sm text-gray-600">
        Envoyez un fichier Excel ou CSV, ou collez directement des lignes copiées depuis un tableau.
        Colonnes : Matricule, Nom, Prénoms, Date de naissance (JJ/MM/AAAA), Lieu de naissance. Seul le nom est obligatoire.
        Les étudiants déjà enregistrés sont ignorés. Maximum {LIMITE_IMPORT} par import.
      </p>

      <section className="border rounded-lg p-3 space-y-2">
        <p className="font-medium text-sm">1. Modèle (facultatif)</p>
        <button onClick={modele} className="border rounded-md px-3 py-2 text-sm bg-white">📥 Télécharger le modèle Excel</button>
      </section>

      <section className="border rounded-lg p-3 space-y-2">
        <p className="font-medium text-sm">2. Fichier ou texte collé</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={lireFichier} className="text-sm w-full" />
        {fichier && <p className="text-xs text-gray-500">Fichier : {fichier}</p>}
        <textarea value={colle} onChange={(e) => setColle(e.target.value)} rows={5} placeholder="Ou collez ici : une ligne par étudiant"
          className="w-full border rounded-md px-2 py-1.5 text-sm font-mono" />
        <button onClick={analyserColle} disabled={!colle.trim()} className="border rounded-md px-3 py-2 text-sm bg-white disabled:opacity-50">Analyser le texte collé</button>
      </section>

      {erreur && <div className="text-sm rounded-md p-3 border bg-red-50 border-red-300 text-red-700">{erreur}</div>}

      {lignes.length > 0 && (
        <section className="space-y-2">
          <p className="font-medium text-sm">3. Vérification</p>
          <p className="text-sm">
            <span className="text-green-700">{valides.length} prête(s)</span>
            {invalides > 0 && <span className="text-red-700"> · {invalides} à corriger (ignorée(s) à l'import)</span>}
          </p>
          <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
            {lignes.map((l) => (
              <div key={l.ligne} className={`p-2 text-xs ${l.erreur ? 'bg-red-50' : ''}`}>
                <p className="font-medium">{l.nom || '(sans nom)'} {l.prenoms}
                  <span className="text-gray-500 font-normal"> · {l.matricule || 'sans matricule'}{l.date_naissance ? ` · ${l.date_naissance.split('-').reverse().join('/')}` : ''}</span></p>
                {l.erreur && <p className="text-red-700">Ligne {l.ligne} : {l.erreur}</p>}
              </div>
            ))}
          </div>
          <button onClick={importer} disabled={occupe || valides.length === 0} className="w-full rounded-md py-2.5 text-sm bg-blue-600 text-white disabled:opacity-50">
            {occupe ? 'Import en cours…' : `Importer ${valides.length} étudiant(s)`}
          </button>
        </section>
      )}

      {resultat && (
        <section className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-medium text-green-800">{resultat.nbAjoutes} étudiant(s) ajouté(s).</p>
          {resultat.ignores.length > 0 && (
            <div>
              <p className="text-sm text-amber-800">{resultat.ignores.length} ignoré(s) :</p>
              <ul className="text-xs text-gray-700 list-disc pl-5">
                {resultat.ignores.map((x, i) => <li key={i}>Ligne {x.ligne} — {x.nom} : {x.raison}</li>)}
              </ul>
            </div>
          )}
          <Link href="/direction/universite/etudiants" className="inline-block border rounded-md px-3 py-2 text-sm bg-white">Voir la liste des étudiants</Link>
        </section>
      )}
    </main>
  );
}
