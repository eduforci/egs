'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@supabase/auth-helpers-react';
import ExportButton from './components/ExportButton';
import ImportButton from './components/ImportButton';
import VerificationPanel from './components/VerificationPanel';

export default function DespsPage() {
  const { user } = useUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [anneeScolaire] = useState('2026-2027');
  const [trimestre] = useState(1);

  // Récupérer les données au chargement
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/desps/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            etablissementId: user?.id,
            anneeScolaire,
            trimestre
          })
        });
        const result = await response.json();
        setData(result.data);
      } catch (error) {
        console.error('Erreur:', error);
      } finally {
        setLoading(false);
      }
    }

    if (user) fetchData();
  }, [user, anneeScolaire, trimestre]);

  if (loading) return <div>Chargement...</div>;
  if (!data) return <div>Aucune donnée disponible</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">
        Statistiques DESPS - {anneeScolaire}
      </h1>

      {/* Panneau de vérification */}
      <VerificationPanel data={data} />

      {/* Tableau des effectifs */}
      <div className="mt-8 bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Niveau
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Garçons
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Filles
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.effectifs.map((row: any) => (
              <tr key={row.niveau}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {row.niveau}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500">
                  {row.garcons}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500">
                  {row.filles}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium">
                  {row.total}
                </td>
              </tr>
            ))}
            {/* Ligne totale */}
            <tr className="bg-gray-50 font-bold">
              <td className="px-6 py-4 whitespace-nowrap text-sm">TOTAL</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                {data.totalGeneral.garcons}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                {data.totalGeneral.filles}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                {data.totalGeneral.total}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Informations complémentaires */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Nouveaux élèves</p>
          <p className="text-2xl font-bold text-blue-600">{data.nouveaux}</p>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Redoublants</p>
          <p className="text-2xl font-bold text-yellow-600">{data.redoublants}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Transférés</p>
          <p className="text-2xl font-bold text-green-600">{data.transferes}</p>
        </div>
      </div>

      {/* Boutons d'action */}
      <div className="mt-8 flex gap-4">
        <ExportButton 
          etablissementId={user?.id}
          anneeScolaire={anneeScolaire}
          trimestre={trimestre}
        />
        <ImportButton remonteeId={data.identification.remonteeId} />
        <button className="px-4 py-2 border rounded-lg hover:bg-gray-50">
          Voir l'historique
        </button>
      </div>
    </div>
  );
                }
