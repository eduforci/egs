'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Eleve {
  id: string;
  matricule: string | null;
  nom: string;
  prenom: string;
}

interface ListeClasse {
  classe: { nom: string; niveau: string; annee_scolaire: string };
  etablissement: {
    nom: string;
    adresse: string | null;
    telephone: string | null;
    email: string | null;
    code_etablissement: string | null;
    dren: string | null;
    statut_juridique: string | null;
    logo_url: string | null;
  };
  eleves: Eleve[];
}

export default function ListeClassePage() {
  const params = useParams();
  const classeId = params.classeId as string;

  const [liste, setListe] = useState<ListeClasse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/prof/classes/${classeId}/liste`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setListe(json);
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [classeId]);

  function telechargerPDF() {
    if (!liste) return;
    const doc = new jsPDF();

    doc.setFontSize(9);
    doc.text('MINISTÈRE DE L\'ÉDUCATION NATIONALE,', 14, 14);
    doc.text('DE L\'ALPHABÉTISATION ET DE', 14, 19);
    doc.text('L\'ENSEIGNEMENT TECHNIQUE', 14, 24);
    doc.text(liste.etablissement.dren ?? '', 14, 30);

    doc.text('RÉPUBLIQUE DE CÔTE D\'IVOIRE', 140, 14);
    doc.text('Union - Discipline - Travail', 140, 19);
    doc.text(`Année Scolaire : ${liste.classe.annee_scolaire}`, 140, 27);
    doc.text(
      `Code : ${liste.etablissement.code_etablissement ?? '—'}   Statut : ${liste.etablissement.statut_juridique ?? '—'}`,
      140,
      33
    );

    doc.setFontSize(11);
    doc.text(liste.etablissement.nom, 14, 42, { maxWidth: 100 });
    doc.setFontSize(8);
    if (liste.etablissement.telephone) doc.text(`Tél : ${liste.etablissement.telephone}`, 14, 48);
    if (liste.etablissement.email) doc.text(`Email : ${liste.etablissement.email}`, 14, 52);

    const titre = `LISTE DE CLASSE — ${liste.classe.nom} (${liste.classe.niveau})`;
    doc.setFontSize(11);
    const largeurTitre = doc.getTextWidth(titre) + 16;
    const xCadre = (210 - largeurTitre) / 2;
    doc.setDrawColor(0);
    doc.rect(xCadre, 58, largeurTitre, 8);
    doc.text(titre, 105, 63.5, { align: 'center' });

    autoTable(doc, {
      startY: 70,
      head: [['N°', 'Matricule', 'Nom et Prénoms', 'Note 1', 'Note 2', 'Note 3', 'Note 4', 'Note 5', 'Note 6', 'Note 7', 'Note 8', 'Moy.', 'Rang']],
      body: liste.eleves.map((e, i) => [
        String(i + 1),
        e.matricule ?? '—',
        `${e.nom} ${e.prenom}`,
        '', '', '', '', '', '', '', '', '', '',
      ]),
      styles: { fontSize: 8, lineWidth: 0.1, lineColor: [0, 0, 0] },
      headStyles: { fillColor: [10, 30, 70], fontSize: 7, lineWidth: 0.1, lineColor: [0, 0, 0] },
      theme: 'grid',
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 20 },
        2: { cellWidth: 32 },
        3: { cellWidth: 10 },
        4: { cellWidth: 10 },
        5: { cellWidth: 10 },
        6: { cellWidth: 10 },
        7: { cellWidth: 10 },
        8: { cellWidth: 10 },
        9: { cellWidth: 10 },
        10: { cellWidth: 10 },
        11: { cellWidth: 12 },
        12: { cellWidth: 12 },
      },
    });

    doc.save(`liste_${liste.classe.nom}_${liste.classe.annee_scolaire}.pdf`);
  }

  if (loading) return <div className="p-4">Chargement...</div>;
  if (erreur) return <div className="p-4 text-red-600 text-sm">{erreur}</div>;
  if (!liste) return null;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="border rounded p-4 mb-4 text-xs">
        <div className="flex justify-between mb-2">
          <div>
            <p className="font-semibold">MINISTÈRE DE L'ÉDUCATION NATIONALE,</p>
            <p className="font-semibold">DE L'ALPHABÉTISATION ET DE</p>
            <p className="font-semibold">L'ENSEIGNEMENT TECHNIQUE</p>
            <p className="mt-1">{liste.etablissement.dren}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">RÉPUBLIQUE DE CÔTE D'IVOIRE</p>
            <p className="italic">Union - Discipline - Travail</p>
            <p className="mt-2">Année Scolaire : {liste.classe.annee_scolaire}</p>
            <p>Code : {liste.etablissement.code_etablissement ?? '—'} · Statut : {liste.etablissement.statut_juridique ?? '—'}</p>
          </div>
        </div>

        <div className="text-center my-2">
          <p className="font-bold">{liste.etablissement.nom}</p>
          {liste.etablissement.telephone && <p>Tél : {liste.etablissement.telephone}</p>}
          {liste.etablissement.email && <p>Email : {liste.etablissement.email}</p>}
        </div>

        <div className="flex justify-center">
          <div className="border-2 border-black text-center py-1.5 px-6 font-bold inline-block" style={{ color: '#0B3D2E' }}>
            LISTE DE CLASSE — {liste.classe.nom} ({liste.classe.niveau})
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full text-sm border mb-4">
        <thead>
          <tr style={{ backgroundColor: '#0B3D2E', color: 'white' }}>
            <th className="border p-1 w-10">N°</th>
            <th className="border p-1 text-left">Matricule</th>
            <th className="border p-1 text-left">Nom et Prénoms</th>
            <th className="border p-1 w-14">Note 1</th>
            <th className="border p-1 w-14">Note 2</th>
            <th className="border p-1 w-14">Note 3</th>
            <th className="border p-1 w-14">Note 4</th>
            <th className="border p-1 w-14">Note 5</th>
            <th className="border p-1 w-14">Note 6</th>
            <th className="border p-1 w-14">Note 7</th>
            <th className="border p-1 w-14">Note 8</th>
            <th className="border p-1 w-14">Moy.</th>
            <th className="border p-1 w-14">Rang</th>
          </tr>
        </thead>
        <tbody>
          {liste.eleves.map((e, i) => (
            <tr key={e.id}>
              <td className="border p-1 text-center">{i + 1}</td>
              <td className="border p-1 font-mono text-xs">{e.matricule ?? '—'}</td>
              <td className="border p-1">{e.nom} {e.prenom}</td>
              <td className="border p-1"></td>
              <td className="border p-1"></td>
              <td className="border p-1"></td>
              <td className="border p-1"></td>
              <td className="border p-1"></td>
              <td className="border p-1"></td>
              <td className="border p-1"></td>
              <td className="border p-1"></td>
              <td className="border p-1"></td>
              <td className="border p-1"></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {liste.eleves.length === 0 && (
        <p className="text-sm text-gray-500 mb-4">Aucun élève actif dans cette classe.</p>
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
  
