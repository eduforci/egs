'use client';

import { useEffect, useState } from 'react';

interface Remontee {
  id: string;
  annee_scolaire: string;
  trimestre: number;
  statut: string;
  cree_le: string;
  importe_le: string | null;
  total_eleves: number;
}

export default function HistoriqueDespsPage() {
  const [historique, setHistorique] = useState<Remontee[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/directeur-etudes/desps/historique')
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setHistorique(json.historique);
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, []);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4" style={{ color: '#0B3D2E' }}>
        Historique des remontées DESPS
      </h1>

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}
      {erreur && <p className="text-red-600 text-sm">{erreur}</p>}

      {!loading && historique.length === 0 && (
        <p className="text-sm text-gray-500">Aucune remontée pour le moment.</p>
      )}

      <div className="space-y-3">
        {historique.map((r) => (
          <div key={r.id} className="border rounded p-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{r.annee_scolaire} — Trimestre {r.trimestre}</p>
                <p className="text-sm text-gray-600">
                  {r.statut === 'importe'
                    ? `Importé le ${formatDate(r.importe_le!)}`
                    : `Exporté le ${formatDate(r.cree_le)}`}
                </p>
                <p className="text-sm text-gray-600">{r.total_eleves} élèves</p>
              </div>
              <span
                className="text-xl"
                style={{ color: r.statut === 'importe' ? '#0B3D2E' : '#C9962B' }}
              >
                {r.statut === 'importe' ? '✓' : '○'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
