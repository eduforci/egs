'use client';

import { useEffect, useState } from 'react';

interface EleveSansMatricule {
  id: string;
  nom: string;
  prenom: string;
  classe: string;
  niveau: string;
}

export default function SansMatriculePage() {
  const [eleves, setEleves] = useState<EleveSansMatricule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/directeur-etudes/agfne/sans-matricule')
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setEleves(json.eleves);
        setTotal(json.total);
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1" style={{ color: '#0B3D2E' }}>
        Élèves sans matricule
      </h1>
      <p className="text-sm text-gray-600 mb-4">Module AGFNE — Fichier élèves</p>

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}
      {erreur && <p className="text-red-600 text-sm">{erreur}</p>}

      {!loading && !erreur && (
        <>
          <p className="mb-4 text-sm font-medium">
            {total} élève{total > 1 ? 's' : ''} sans matricule enregistré
          </p>

          {total === 0 ? (
            <p className="text-sm text-gray-500">Tous les élèves ont un matricule renseigné.</p>
          ) : (
            <table className="w-full text-sm border">
              <thead>
                <tr style={{ backgroundColor: '#C9962B33' }}>
                  <th className="border p-1 text-left">Nom</th>
                  <th className="border p-1 text-left">Prénom</th>
                  <th className="border p-1 text-left">Classe</th>
                </tr>
              </thead>
              <tbody>
                {eleves.map((e) => (
                  <tr key={e.id}>
                    <td className="border p-1">{e.nom}</td>
                    <td className="border p-1">{e.prenom}</td>
                    <td className="border p-1">{e.classe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
