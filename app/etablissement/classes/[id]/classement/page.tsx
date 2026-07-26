'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type LigneClassement = {
  eleve_id: string;
  moyenne_generale: number;
  rang: number;
  mention: string;
  decision: string;
  nom?: string;
  prenom?: string;
};

const ANNEES_SCOLAIRES = ['2024-2025', '2025-2026', '2026-2027'];

export default function ClassementClassePage() {
  const params = useParams();
  const classeId = params?.id as string;

  const [trimestre, setTrimestre] = useState<number>(1);
  const [anneeScolaire, setAnneeScolaire] = useState<string>('2025-2026');
  const [classeNom, setClasseNom] = useState<string>('');

  const [classement, setClassement] = useState<LigneClassement[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const chargerClassement = useCallback(async () => {
    if (!classeId) return;

    setLoading(true);
    setError(null);

    try {
      // Récupérer le nom de la classe
      const { data: classeData, error: classeError } = await supabase
        .from('classes')
        .select('nom')
        .eq('id', classeId)
        .single();

      if (classeError) {
        throw new Error(`Erreur récupération classe : ${classeError.message}`);
      }
      setClasseNom(classeData?.nom ?? '');

      // Appel de la fonction RPC de classement
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'calculer_moyennes_classe',
        {
          p_classe_id: classeId,
          p_trimestre: trimestre,
          p_annee_scolaire: anneeScolaire,
        }
      );

      if (rpcError) {
        throw new Error(`Erreur calcul des moyennes : ${rpcError.message}`);
      }

      const lignes = (rpcData ?? []) as LigneClassement[];

      if (lignes.length === 0) {
        setClassement([]);
        setLoading(false);
        return;
      }

      // Récupérer les noms/prénoms des élèves
      const eleveIds = lignes.map((l) => l.eleve_id);
      const { data: elevesData, error: elevesError } = await supabase
        .from('eleves')
        .select('id, nom, prenom')
        .in('id', eleveIds);

      if (elevesError) {
        throw new Error(`Erreur récupération élèves : ${elevesError.message}`);
      }

      const elevesMap = new Map(
        (elevesData ?? []).map((e) => [e.id, { nom: e.nom, prenom: e.prenom }])
      );

      const classementComplet = lignes
        .map((l) => ({
          ...l,
          nom: elevesMap.get(l.eleve_id)?.nom ?? 'Inconnu',
          prenom: elevesMap.get(l.eleve_id)?.prenom ?? '',
        }))
        .sort((a, b) => a.rang - b.rang);

      setClassement(classementComplet);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [classeId, trimestre, anneeScolaire, supabase]);

  useEffect(() => {
    chargerClassement();
  }, [chargerClassement]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold mb-1">
        Classement {classeNom ? `— ${classeNom}` : ''}
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        Trimestre {trimestre} · Année {anneeScolaire}
      </p>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Trimestre</label>
          <select
            value={trimestre}
            onChange={(e) => setTrimestre(Number(e.target.value))}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value={1}>Trimestre 1</option>
            <option value={2}>Trimestre 2</option>
            <option value={3}>Trimestre 3</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Année scolaire</label>
          <select
            value={anneeScolaire}
            onChange={(e) => setAnneeScolaire(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            {ANNEES_SCOLAIRES.map((annee) => (
              <option key={annee} value={annee}>
                {annee}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={chargerClassement}
            disabled={loading}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {loading ? 'Chargement...' : 'Actualiser'}
          </button>
        </div>
      </div>

      {/* Erreur visible */}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {/* Chargement */}
      {loading && !error && (
        <p className="text-sm text-gray-500">Calcul du classement en cours...</p>
      )}

      {/* Vide */}
      {!loading && !error && classement.length === 0 && (
        <p className="text-sm text-gray-500">
          Aucune note trouvée pour ce trimestre et cette année scolaire.
        </p>
      )}

      {/* Tableau */}
      {!loading && !error && classement.length > 0 && (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Rang</th>
                <th className="text-left px-3 py-2">Élève</th>
                <th className="text-left px-3 py-2">Moyenne</th>
                <th className="text-left px-3 py-2">Mention</th>
                <th className="text-left px-3 py-2">Décision</th>
              </tr>
            </thead>
            <tbody>
              {classement.map((ligne) => (
                <tr key={ligne.eleve_id} className="border-t">
                  <td className="px-3 py-2 font-semibold">{ligne.rang}</td>
                  <td className="px-3 py-2">
                    {ligne.nom} {ligne.prenom}
                  </td>
                  <td className="px-3 py-2">{ligne.moyenne_generale}</td>
                  <td className="px-3 py-2">{ligne.mention}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        ligne.decision === 'Admis(e)'
                          ? 'text-green-600 font-medium'
                          : 'text-red-600 font-medium'
                      }
                    >
                      {ligne.decision}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
          }
        
