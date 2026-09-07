'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface EtapeParcours {
  annee_scolaire: string;
  classe: string;
  niveau: string;
  date_inscription: string;
  date_sortie: string | null;
  statut: string;
}

interface FicheCursus {
  eleve: {
    nom: string;
    prenom: string;
    matricule: string | null;
    date_naissance: string | null;
    lieu_naissance: string | null;
    nationalite: string | null;
  };
  etablissement: { nom: string; code_etablissement: string | null } | null;
  parcours: EtapeParcours[];
}

export default function FicheCursusPage() {
  const params = useParams();
  const eleveId = params.eleveId as string;

  const [fiche, setFiche] = useState<FicheCursus | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/directeur-etudes/agfne/fiche-cursus/${eleveId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setFiche(json);
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [eleveId]);

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR');
  }

  function telechargerPDF() {
    if (!fiche) return;
    const doc = new jsPDF();

    doc.setFontSize(9);
    doc.text('Document interne EGS — ne remplace pas la fiche cursus officielle AGFNE', 14, 12);

    doc.setFontSize(14);
    doc.text('Fiche cursus scolaire', 14, 22);

    doc.setFontSize(10);
    doc.text(`Nom : ${fiche.eleve.nom}`, 14, 32);
    doc.text(`Prénom : ${fiche.eleve.prenom}`, 14, 38);
    doc.text(`Matricule : ${fiche.eleve.matricule ?? 'Non attribué'}`, 14, 44);
    doc.text(`Né(e) le : ${formatDate(fiche.eleve.date_naissance)} à ${fiche.eleve.lieu_naissance ?? '—'}`, 14, 50);
    doc.text(`Nationalité : ${fiche.eleve.nationalite ?? '—'}`, 14, 56);
    doc.text(`Établissement : ${fiche.etablissement?.nom ?? '—'}`, 14, 62);

    autoTable(doc, {
      startY: 70,
      head: [['Année scolaire', 'Niveau', 'Classe', 'Du', 'Au', 'Statut']],
      body: fiche.parcours.map((p) => [
        p.annee_scolaire,
        p.niveau,
        p.classe,
        formatDate(p.date_inscription),
        p.date_sortie ? formatDate(p.date_sortie) : 'En cours',
        p.statut,
      ]),
    });

    doc.save(`fiche_cursus_${fiche.eleve.nom}_${fiche.eleve.prenom}.pdf`);
  }

  if (loading) return <div className="p-4">Chargement...</div>;
  if (erreur) return <div className="p-4 text-red-600 text-sm">{erreur}</div>;
  if (!fiche) return null;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs mb-4">
        Document interne EGS — ne remplace pas la fiche cursus officielle produite par AGFNE
      </div>

      <h1 className="text-xl font-bold mb-1" style={{ color: '#0B3D2E' }}>
        Fiche cursus — {fiche.eleve.prenom} {fiche.eleve.nom}
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Matricule : {fiche.eleve.matricule ?? 'Non attribué'}
      </p>

      <div className="border rounded p-3 mb-4 text-sm space-y-1">
        <p>Né(e) le {formatDate(fiche.eleve.date_naissance)} à {fiche.eleve.lieu_naissance ?? '—'}</p>
        <p>Nationalité : {fiche.eleve.nationalite ?? '—'}</p>
        <p>Établissement : {fiche.etablissement?.nom ?? '—'}</p>
      </div>

      <h2 className="font-semibold mb-2" style={{ color: '#0B3D2E' }}>Parcours scolaire</h2>

      {fiche.parcours.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">Aucun historique d'inscription trouvé.</p>
      ) : (
        <table className="w-full text-xs border mb-4">
          <thead>
            <tr style={{ backgroundColor: '#C9962B33' }}>
              <th className="border p-1 text-left">Année</th>
              <th className="border p-1 text-left">Niveau</th>
              <th className="border p-1 text-left">Classe</th>
              <th className="border p-1 text-left">Statut</th>
            </tr>
          </thead>
          <tbody>
            {fiche.parcours.map((p, i) => (
              <tr key={i}>
                <td className="border p-1">{p.annee_scolaire}</td>
                <td className="border p-1">{p.niveau}</td>
                <td className="border p-1">{p.classe}</td>
                <td className="border p-1">{p.statut}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
