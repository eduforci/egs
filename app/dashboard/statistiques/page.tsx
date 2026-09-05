'use client';

import { useState, useEffect } from 'react';

export default function StatistiquesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [etablissementId, setEtablissementId] = useState('');

  const fetchData = async () => {
    if (!etablissementId) {
      setError('Veuillez entrer un ID d\'établissement');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/desps?etablissementId=${etablissementId}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'Erreur inconnue');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Charger automatiquement si l'ID est dans l'URL
    const params = new URLSearchParams(window.location.search);
    const id = params.get('etablissementId');
    if (id) {
      setEtablissementId(id);
      // On attend que l'état soit mis à jour
    }
  }, []);

  // Exécuter quand etablissementId change
  useEffect(() => {
    if (etablissementId) {
      fetchData();
    }
  }, [etablissementId]);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📊 Statistiques DESPS</h1>

      {/* Formulaire ID */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <label className="block text-sm font-medium mb-2">
          ID de l'établissement
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={etablissementId}
            onChange={(e) => setEtablissementId(e.target.value)}
            placeholder="ex: 123e4567-e89b-12d3-a456-426614174000"
            className="flex-1 p-2 border rounded-lg"
          />
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Charger
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Trouvez l'ID dans Supabase → Table Editor → établissements
        </p>
      </div>

      {/* Chargement */}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-2 text-gray-600">Chargement des statistiques...</p>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          ❌ Erreur : {error}
        </div>
      )}

      {/* Données */}
      {data && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-blue-800">📋 Informations</h2>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <span className="text-gray-600">Année scolaire :</span>
                <span className="ml-2 font-medium">{data.anneeScolaire}</span>
              </div>
              <div>
                <span className="text-gray-600">Trimestre :</span>
                <span className="ml-2 font-medium">{data.trimestre}</span>
              </div>
              <div>
                <span className="text-gray-600">Total élèves :</span>
                <span className="ml-2 font-bold text-blue-600">{data.total}</span>
              </div>
              <div>
                <span className="text-gray-600">Date :</span>
                <span className="ml-2 text-sm">{new Date(data.dateGeneration).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-3">👥 Effectifs par niveau</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-3 text-left">Niveau</th>
                  <th className="border p-3 text-center">Garçons</th>
                  <th className="border p-3 text-center">Filles</th>
                  <th className="border p-3 text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.effectifs.map((row: any) => (
                  <tr key={row.niveau} className="hover:bg-gray-50">
                    <td className="border p-3 font-medium">{row.niveau}</td>
                    <td className="border p-3 text-center">{row.garcons}</td>
                    <td className="border p-3 text-center">{row.filles}</td>
                    <td className="border p-3 text-center">{row.total}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-bold">
                  <td className="border p-3">TOTAL</td>
                  <td className="border p-3 text-center">{data.totalGarcons}</td>
                  <td className="border p-3 text-center">{data.totalFilles}</td>
                  <td className="border p-3 text-center">{data.total}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `DESPS_${data.anneeScolaire}_T${data.trimestre}.json`;
                a.click();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              📥 Exporter JSON
            </button>
            <button
              onClick={() => {
                alert('Fonctionnalité Excel à venir');
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              📊 Exporter Excel
            </button>
            <button
              onClick={() => {
                alert('Fonctionnalité PDF à venir');
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              📄 Exporter PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
          }
