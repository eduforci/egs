'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Resultat = {
  eleve_id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe_nom: string;
  points_obtenus: number;
  points_total: number;
  rang: number;
  decision: string;
};

export default function ResultatsExamenPage() {
  const params = useParams();
  const examenId = params?.id as string;

  const [examenNom, setExamenNom] = useState('');
  const [pointsRequis, setPointsRequis] = useState(0);
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: examen, error: examenError } = await supabase
        .from('examens')
        .select('nom, points_requis')
        .eq('id', examenId)
        .single();

      if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
      setExamenNom(examen.nom);
      setPointsRequis(examen.points_requis);

      const { data, error: rpcError } = await supabase.rpc('calculer_resultats_examen', {
        p_examen_id: examenId,
      });

      if (rpcError) throw new Error(`Erreur calcul résultats : ${rpcError.message}`);
      setResultats((data as Resultat[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [examenId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const admis = resultats.filter((r) => r.decision === 'Admis(e)').length;
  const pointsTotal = resultats[0]?.points_total ?? 0;

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-start mb-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold mb-1">Résultats — {examenNom}</h1>
          <p className="text-sm text-gray-500">
            {resultats.length} candidat(s) · {admis} admis(e) · Seuil {pointsRequis}/{pointsTotal || '?'}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md"
        >
          Imprimer / PDF
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          {error}
        </div>
      )}

      {!error && resultats.length === 0 && (
        <p className="text-sm text-gray-400">
          Aucun résultat pour le moment — vérifie que des notes ont été saisies.
        </p>
      )}

      {resultats.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Rang</th>
                <th className="text-left px-3 py-2">Candidat</th>
                <th className="text-left px-3 py-2">Matricule</th>
                <th className="text-left px-3 py-2">Classe</th>
                <th className="text-left px-3 py-2">Points</th>
                <th className="text-left px-3 py-2">Décision</th>
              </tr>
            </thead>
            <tbody>
              {resultats.map((r) => (
                <tr key={r.eleve_id} className="border-t">
                  <td className="px-3 py-2 font-semibold">{r.rang}</td>
                  <td className="px-3 py-2">{r.nom} {r.prenom}</td>
                  <td className="px-3 py-2 text-gray-500">{r.matricule}</td>
                  <td className="px-3 py-2 text-gray-500">{r.classe_nom}</td>
                  <td className="px-3 py-2">{r.points_obtenus}/{r.points_total}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.decision === 'Admis(e)'
                          ? 'text-green-600 font-medium'
                          : 'text-red-600 font-medium'
                      }
                    >
                      {r.decision}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
  
