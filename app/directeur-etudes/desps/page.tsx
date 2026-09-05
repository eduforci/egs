'use client';

import { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface NiveauStats {
  niveau: string;
  garcons: number;
  filles: number;
  total: number;
  nouveaux: number;
  redoublants: number;
}

interface FichierDesps {
  etablissement?: string;
  code_etablissement?: string;
  annee_scolaire: string;
  trimestre: number;
  niveaux: NiveauStats[];
  genere_le?: string;
}

export default function DespsPage() {
  const [anneeScolaire, setAnneeScolaire] = useState('2026-2027');
  const [trimestre, setTrimestre] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fichier, setFichier] = useState<FichierDesps | null>(null);

  async function genererStats() {
    setLoading(true);
    setErreur(null);
    try {
      const res = await fetch('/api/directeur-etudes/desps/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annee_scolaire: anneeScolaire, trimestre }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur lors de la génération');
      setFichier(json.fichierComplet);
    } catch (e: any) {
      setErreur(e.message);
    } finally {
      setLoading(false);
    }
  }

  function totaux() {
    if (!fichier) return { garcons: 0, filles: 0, total: 0 };
    return fichier.niveaux.reduce(
      (acc, n) => ({
        garcons: acc.garcons + n.garcons,
        filles: acc.filles + n.filles,
        total: acc.total + n.total,
      }),
      { garcons: 0, filles: 0, total: 0 }
    );
  }

  function telechargerJSON() {
    if (!fichier) return;
    const blob = new Blob([JSON.stringify(fichier, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EGS_DESPS_${fichier.annee_scolaire}_T${fichier.trimestre}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function telechargerExcel() {
    if (!fichier) return;
    const rows = fichier.niveaux.map((n) => ({
      Niveau: n.niveau,
      Garçons: n.garcons,
      Filles: n.filles,
      Total: n.total,
      Nouveaux: n.nouveaux,
      Redoublants: n.redoublants,
    }));
    const t = totaux();
    rows.push({ Niveau: 'TOTAL', Garçons: t.garcons, Filles: t.filles, Total: t.total, Nouveaux: 0, Redoublants: 0 });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DESPS');
    XLSX.writeFile(wb, `EGS_DESPS_${fichier.annee_scolaire}_T${fichier.trimestre}.xlsx`);
  }

  function telechargerPDF() {
    if (!fichier) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Fiche statistique DESPS', 14, 18);
    doc.setFontSize(10);
    doc.text(`Établissement : ${fichier.etablissement ?? ''}`, 14, 26);
    doc.text(`Code établissement : ${fichier.code_etablissement ?? ''}`, 14, 32);
    doc.text(`Année scolaire : ${fichier.annee_scolaire} — Trimestre ${fichier.trimestre}`, 14, 38);

    const t = totaux();
    autoTable(doc, {
      startY: 45,
      head: [['Niveau', 'Garçons', 'Filles', 'Total', 'Nouveaux', 'Redoublants']],
      body: [
        ...fichier.niveaux.map((n) => [n.niveau, n.garcons, n.filles, n.total, n.nouveaux, n.redoublants]),
        ['TOTAL', t.garcons, t.filles, t.total, '', ''],
      ],
    });

    doc.save(`EGS_DESPS_${fichier.annee_scolaire}_T${fichier.trimestre}.pdf`);
  }

  const t = totaux();

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4" style={{ color: '#0B3D2E' }}>
        Statistiques DESPS
      </h1>

      <div className="flex gap-2 mb-4">
        <select
          value={anneeScolaire}
          onChange={(e) => setAnneeScolaire(e.target.value)}
          className="border rounded px-2 py-1 flex-1"
        >
          <option value="2025-2026">2025-2026</option>
          <option value="2026-2027">2026-2027</option>
        </select>
        <select
          value={trimestre}
          onChange={(e) => setTrimestre(Number(e.target.value))}
          className="border rounded px-2 py-1"
        >
          <option value={1}>1er trimestre</option>
          <option value={2}>2ème trimestre</option>
          <option value={3}>3ème trimestre</option>
        </select>
      </div>

      <button
        onClick={genererStats}
        disabled={loading}
        className="w-full py-2 rounded text-white font-medium mb-4"
        style={{ backgroundColor: '#0B3D2E' }}
      >
        {loading ? 'Génération...' : 'Générer la fiche'}
      </button>

      {erreur && <p className="text-red-600 text-sm mb-4">{erreur}</p>}

      {fichier && (
        <>
          <table className="w-full text-sm border mb-4">
            <thead>
              <tr style={{ backgroundColor: '#C9962B33' }}>
                <th className="border p-1 text-left">Niveau</th>
                <th className="border p-1">G</th>
                <th className="border p-1">F</th>
                <th className="border p-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {fichier.niveaux.map((n) => (
                <tr key={n.niveau}>
                  <td className="border p-1">{n.niveau}</td>
                  <td className="border p-1 text-center">{n.garcons}</td>
                  <td className="border p-1 text-center">{n.filles}</td>
                  <td className="border p-1 text-center">{n.total}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border p-1">TOTAL</td>
                <td className="border p-1 text-center">{t.garcons}</td>
                <td className="border p-1 text-center">{t.filles}</td>
                <td className="border p-1 text-center">{t.total}</td>
              </tr>
            </tbody>
          </table>

          <div className="flex gap-2">
            <button onClick={telechargerJSON} className="flex-1 py-2 border rounded text-sm">JSON</button>
            <button onClick={telechargerExcel} className="flex-1 py-2 border rounded text-sm">Excel</button>
            <button onClick={telechargerPDF} className="flex-1 py-2 border rounded text-sm">PDF</button>
          </div>
        </>
      )}
    </div>
  );
      }
