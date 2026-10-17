'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { abregerMatiere } from '@/lib/matieres-abrev';

type Colonne = { matiere: string; coefficient: number; groupe: string | null };
type Stat = { moyenne: number | null; mini: number | null; maxi: number | null; nb: number };
type Ligne = {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  moyenne: number | null;
  rang: number | null;
  mention: string | null;
  decision: string | null;
  matieres: { matiere: string; moyenne: number | null; coefficient: number }[];
};
type Donnees = {
  classe: string;
  ecole: string;
  annee: string;
  trimestre: number;
  colonnes: Colonne[];
  parMatiere: Stat[];
  general: Stat;
  admis: number;
  lignes: Ligne[];
};

const fmt = (v: number | null | undefined) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '');

export default function MatriceMoyennesPage() {
  const params = useParams();
  const classeId = params?.classeId as string;
  const [trimestre, setTrimestre] = useState(1);
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [masquees, setMasquees] = useState<Set<string>>(new Set()); // matières retirées de l'affichage
  const [choixOuvert, setChoixOuvert] = useState(false);

  // trimestre choisi sur la page précédente
  useEffect(() => {
    try {
      const t = Number(new URLSearchParams(window.location.search).get('trimestre'));
      if ([1, 2, 3].includes(t)) setTrimestre(t);
    } catch { /* trimestre 1 par défaut */ }
  }, []);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/bulletins/matrice?classeId=${classeId}&trimestre=${trimestre}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Chargement impossible.');
      setDonnees(j as Donnees);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setChargement(false);
    }
  }, [classeId, trimestre]);

  useEffect(() => {
    charger();
  }, [charger]);

  // colonnes affichées (index d'origine conservé pour retrouver les statistiques)
  const visibles = useMemo(
    () => (donnees ? donnees.colonnes.map((c, i) => ({ c, i })).filter(({ c }) => !masquees.has(c.matiere)) : []),
    [donnees, masquees]
  );

  const basculer = (matiere: string) => {
    const s = new Set(masquees);
    if (s.has(matiere)) s.delete(matiere);
    else s.add(matiere);
    setMasquees(s);
  };

  const exporterExcel = () => {
    if (!donnees) return;
    const sep = ';';
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: string[][] = [];
    rows.push([`${donnees.ecole} - ${donnees.classe} - Trimestre ${donnees.trimestre} - ${donnees.annee}`]);
    rows.push(['Rang', 'Matricule', 'Nom et prénoms', ...visibles.map(({ c }) => abregerMatiere(c.matiere)), 'Moyenne', 'Mention', 'Décision']);
    rows.push(['', '', 'Coefficient', ...visibles.map(({ c }) => String(c.coefficient)), '', '', '']);
    donnees.lignes.forEach((l) =>
      rows.push([
        l.rang != null ? String(l.rang) : '',
        l.matricule,
        `${l.nom} ${l.prenom}`.trim(),
        ...visibles.map(({ c }) => fmt(l.matieres.find((m) => m.matiere === c.matiere)?.moyenne)),
        fmt(l.moyenne),
        l.mention ?? '',
        l.decision ?? '',
      ])
    );
    rows.push(['', '', 'Moyenne de la classe', ...visibles.map(({ i }) => fmt(donnees.parMatiere[i]?.moyenne)), fmt(donnees.general.moyenne), '', '']);
    rows.push(['', '', 'Moyenne la plus faible', ...visibles.map(({ i }) => fmt(donnees.parMatiere[i]?.mini)), fmt(donnees.general.mini), '', '']);
    rows.push(['', '', 'Moyenne la plus forte', ...visibles.map(({ i }) => fmt(donnees.parMatiere[i]?.maxi)), fmt(donnees.general.maxi), '', '']);
    const csv = '﻿' + rows.map((r) => r.map(esc).join(sep)).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `moyennes-${donnees.classe}-T${donnees.trimestre}.csv`.replace(/\s+/g, '_');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <main className="p-4 max-w-full mx-auto pb-16">
      {/* le tableau est imprimé en paysage */}
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } body { background: #fff; } .matrice td, .matrice th { font-size: 9px; padding: 2px 3px; } }`}</style>

      <div className="print:hidden space-y-3 mb-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Tableau des moyennes{donnees ? ` — ${donnees.classe}` : ''}</h1>
          <Link href="/chef/bulletins" className="text-xs text-blue-600 underline whitespace-nowrap">
            ← Bulletins
          </Link>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Trimestre</label>
            <select value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))} className="border rounded-md px-3 py-2 text-sm">
              <option value={1}>Trimestre 1</option>
              <option value={2}>Trimestre 2</option>
              <option value={3}>Trimestre 3</option>
            </select>
          </div>
          <button onClick={() => setChoixOuvert(!choixOuvert)} className="border rounded-md px-3 py-2 text-sm bg-white">
            Matières affichées
          </button>
          <button onClick={() => window.print()} disabled={!donnees} className="border rounded-md px-3 py-2 text-sm bg-blue-600 text-white disabled:opacity-50">
            Imprimer
          </button>
          <button onClick={exporterExcel} disabled={!donnees} className="border rounded-md px-3 py-2 text-sm bg-green-600 text-white disabled:opacity-50">
            Exporter Excel
          </button>
        </div>

        {choixOuvert && donnees && (
          <div className="border rounded-lg p-3 bg-gray-50 space-y-1">
            <p className="text-xs text-gray-600">
              Décochez une matière pour la retirer du tableau imprimé ou exporté. Les moyennes et les rangs restent ceux du
              bulletin officiel.
            </p>
            {donnees.colonnes.map((c) => (
              <label key={c.matiere} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!masquees.has(c.matiere)} onChange={() => basculer(c.matiere)} />
                <span className="font-mono text-xs w-12">{abregerMatiere(c.matiere)}</span>
                <span>{c.matiere}</span>
                <span className="text-xs text-gray-400">coef. {c.coefficient}</span>
              </label>
            ))}
          </div>
        )}

        {erreur && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3">{erreur}</div>}
        {chargement && <p className="text-sm text-gray-500">Calcul des moyennes de la classe…</p>}
      </div>

      {donnees && !chargement && (
        <>
          <div className="hidden print:block text-center mb-2">
            <div className="font-bold text-sm">{donnees.ecole}</div>
            <div className="text-xs">
              Moyennes de la classe {donnees.classe} — Trimestre {donnees.trimestre} — Année {donnees.annee}
            </div>
          </div>

          {donnees.lignes.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun élève dans cette classe.</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg print:border-0">
              <table className="matrice w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-1.5 py-1 text-center">Rang</th>
                    <th className="border px-1.5 py-1 text-left">Nom et prénoms</th>
                    {visibles.map(({ c }) => (
                      <th key={c.matiere} className="border px-1.5 py-1 text-center" title={c.matiere}>
                        {abregerMatiere(c.matiere)}
                      </th>
                    ))}
                    <th className="border px-1.5 py-1 text-center">Moy.</th>
                    <th className="border px-1.5 py-1 text-left">Décision</th>
                  </tr>
                  <tr className="bg-gray-50 text-gray-600">
                    <td className="border px-1.5 py-0.5" />
                    <td className="border px-1.5 py-0.5 italic">Coefficient</td>
                    {visibles.map(({ c }) => (
                      <td key={c.matiere} className="border px-1.5 py-0.5 text-center">{c.coefficient}</td>
                    ))}
                    <td className="border px-1.5 py-0.5" />
                    <td className="border px-1.5 py-0.5" />
                  </tr>
                </thead>
                <tbody>
                  {donnees.lignes.map((l) => (
                    <tr key={l.id} className="odd:bg-white even:bg-gray-50/50">
                      <td className="border px-1.5 py-0.5 text-center">{l.rang ?? ''}</td>
                      <td className="border px-1.5 py-0.5 whitespace-nowrap">
                        {l.nom} {l.prenom}
                      </td>
                      {visibles.map(({ c }) => {
                        const v = l.matieres.find((m) => m.matiere === c.matiere)?.moyenne;
                        return (
                          <td key={c.matiere} className={`border px-1.5 py-0.5 text-center ${typeof v === 'number' && v < 10 ? 'text-red-600' : ''}`}>
                            {fmt(v)}
                          </td>
                        );
                      })}
                      <td className={`border px-1.5 py-0.5 text-center font-semibold ${typeof l.moyenne === 'number' && l.moyenne < 10 ? 'text-red-600' : ''}`}>
                        {fmt(l.moyenne)}
                      </td>
                      <td className="border px-1.5 py-0.5 whitespace-nowrap">{l.decision ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {([
                    ['Moyenne de la classe', 'moyenne'],
                    ['Plus faible moyenne', 'mini'],
                    ['Plus forte moyenne', 'maxi'],
                  ] as const).map(([titre, cle]) => (
                    <tr key={cle} className="bg-gray-100 font-medium">
                      <td className="border px-1.5 py-0.5" />
                      <td className="border px-1.5 py-0.5">{titre}</td>
                      {visibles.map(({ c, i }) => (
                        <td key={c.matiere} className="border px-1.5 py-0.5 text-center">{fmt(donnees.parMatiere[i]?.[cle])}</td>
                      ))}
                      <td className="border px-1.5 py-0.5 text-center">{fmt(donnees.general[cle])}</td>
                      <td className="border px-1.5 py-0.5" />
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          )}

          <p className="mt-2 text-xs text-gray-600">
            {donnees.lignes.length} élève(s) — {donnees.admis} avec une moyenne d'au moins 10/20
            {donnees.lignes.length > 0 ? ` (${Math.round((donnees.admis / donnees.lignes.length) * 100)} %)` : ''}.
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            Légende :{' '}
            {visibles.map(({ c }) => `${abregerMatiere(c.matiere)} = ${c.matiere}`).join(' · ')}
          </p>
        </>
      )}
    </main>
  );
}
