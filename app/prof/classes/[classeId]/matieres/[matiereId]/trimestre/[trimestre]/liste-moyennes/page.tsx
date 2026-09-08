'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ColonneNote {
  id: string;
  libelle: string | null;
  bareme_max: number;
}

interface EleveMoyenne {
  id: string;
  matricule: string | null;
  nom: string;
  prenom: string;
  detailNotes: { evaluation_id: string; libelle: string | null; bareme_max: number; valeur: number | null }[];
  bonus: number;
  moyenne: number | null;
  moyenneCoef: number | null;
  rang: string;
}

interface ListeMoyennes {
  classe: { nom: string; niveau: string; annee_scolaire: string };
  matiere: string;
  coefficient: number | null;
  enseignant: string;
  trimestre: string;
  colonnesNotes: ColonneNote[];
  eleves: EleveMoyenne[];
}

function fmt(n: number | null) {
  if (n === null) return '-';
  return n.toFixed(2);
}

export default function ListeMoyennesPage() {
  const params = useParams();
  const classeId = params.classeId as string;
  const matiereId = params.matiereId as string;
  const trimestre = params.trimestre as string;

  const [liste, setListe] = useState<ListeMoyennes | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/enseignant/classes/${classeId}/matieres/${matiereId}/trimestre/${trimestre}/liste-moyennes`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setListe(json);
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [classeId, matiereId, trimestre]);

  function telechargerPDF() {
    if (!liste) return;
    const doc = new jsPDF();

    doc.setFontSize(11);
    doc.setDrawColor(0);
    doc.rect(14, 12, 182, 8);
    doc.text(
      `${liste.classe.niveau} — TRIMESTRE ${liste.trimestre} — ${liste.matiere.toUpperCase()}`,
      105,
      17.5,
      { align: 'center' }
    );

    doc.setFontSize(9);
    doc.text(`COEFFICIENT : ${liste.coefficient ?? '—'}`, 14, 26);
    doc.text(`PROFESSEUR : ${liste.enseignant.toUpperCase()}`, 196, 26, { align: 'right' });

    const nomsColonnesNotes = liste.colonnesNotes.map((c) => c.libelle || `/${c.bareme_max}`);

    autoTable(doc, {
      startY: 32,
      head: [['N°', 'MATRICULE', 'NOM ET PRÉNOMS', ...nomsColonnesNotes, 'BONUS', 'MOY.', 'MOY. COEF.', 'RANG']],
      body: liste.eleves.map((e, i) => [
        String(i + 1),
        e.matricule ?? '—',
        `${e.nom} ${e.prenom}`,
        ...liste.colonnesNotes.map((c) => {
          const n = e.detailNotes.find((d) => d.evaluation_id === c.id);
          return n?.valeur !== null && n?.valeur !== undefined ? String(n.valeur) : '-';
        }),
        '', // Bonus laissé vide — à remplir à la main sur le papier
        fmt(e.moyenne),
        fmt(e.moyenneCoef),
        e.rang,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [10, 30, 70], fontSize: 7 },
    });

    doc.save(`liste_moyennes_${liste.classe.nom}_${liste.matiere}_T${liste.trimestre}.pdf`);
  }

  if (loading) return <div className="p-4">Chargement...</div>;
  if (erreur) return <div className="p-4 text-red-600 text-sm">{erreur}</div>;
  if (!liste) return null;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="border-2 border-black text-center py-2 font-bold mb-2" style={{ color: '#0B3D2E' }}>
        {liste.classe.niveau} — TRIMESTRE {liste.trimestre} — {liste.matiere.toUpperCase()}
      </div>

      <div className="flex justify-between text-sm mb-4">
        <p><strong>Coefficient :</strong> {liste.coefficient ?? '—'}</p>
        <p><strong>Professeur :</strong> {liste.enseignant}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border mb-4">
          <thead>
            <tr style={{ backgroundColor: '#0B3D2E', color: 'white' }}>
              <th className="border p-1">N°</th>
              <th className="border p-1 text-left">Matricule</th>
              <th className="border p-1 text-left">Nom et Prénoms</th>
              {liste.colonnesNotes.map((c) => (
                <th key={c.id} className="border p-1">{c.libelle || `/${c.bareme_max}`}</th>
              ))}
              <th className="border p-1">Bonus</th>
              <th className="border p-1">Moy.</th>
              <th className="border p-1">Moy. coef.</th>
              <th className="border p-1">Rang</th>
            </tr>
          </thead>
          <tbody>
            {liste.eleves.map((e, i) => (
              <tr key={e.id}>
                <td className="border p-1 text-center">{i + 1}</td>
                <td className="border p-1 font-mono">{e.matricule ?? '—'}</td>
                <td className="border p-1">{e.nom} {e.prenom}</td>
                {liste.colonnesNotes.map((c) => {
                  const n = e.detailNotes.find((d) => d.evaluation_id === c.id);
                  return (
                    <td key={c.id} className="border p-1 text-center">
                      {n?.valeur !== null && n?.valeur !== undefined ? n.valeur : '-'}
                    </td>
                  );
                })}
                <td className="border p-1"></td>
                <td className="border p-1 text-center font-medium">{fmt(e.moyenne)}</td>
                <td className="border p-1 text-center font-medium">{fmt(e.moyenneCoef)}</td>
                <td className="border p-1 text-center">{e.rang}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {liste.eleves.length === 0 && (
        <p className="text-sm text-gray-500 mb-4">Aucun élève dans cette classe.</p>
      )}

      <button
        onClick={telechargerPDF}
        className="w-full py-2 rounded text-white font-medium"
        style={{ backgroundColor: '#0B3D2E' }}
      >
        Télécharger en PDF
      </button>
    </div>
  );
}
  
