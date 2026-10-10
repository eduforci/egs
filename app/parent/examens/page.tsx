'use client';

import { useState, useEffect, useCallback } from 'react';

type ResultatExamen = {
  examen_id: string;
  examen_nom: string;
  annee_scolaire: string | null;
  classe_nom: string | null;
  moyenne: number | null;
  points_obtenus: number | null;
  points_total: number | null;
  mention: string | null;
  rang: number | null;
  decision: string | null;
  a_participe: boolean;
  publie_le: string;
};

type Enfant = {
  id: string;
  nom: string;
  prenom: string;
  resultats: ResultatExamen[];
};

const STYLE_DECISION: Record<string, string> = {
  Admis: 'bg-green-100 text-green-700',
  'Admis(e)': 'bg-green-100 text-green-700',
  Ajourné: 'bg-orange-100 text-orange-700',
  Refusé: 'bg-red-100 text-red-700',
  Exclu: 'bg-red-100 text-red-700',
  Absent: 'bg-gray-100 text-gray-600',
};

function formaterDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formaterNombre(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

export default function ExamensParentPage() {
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const reponse = await fetch('/api/parent/examens', { cache: 'no-store' });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data?.error || 'Impossible de charger les résultats.');
      } else {
        setErreur('');
        setEnfants(data.enfants ?? []);
      }
    } catch {
      setErreur('Erreur réseau. Réessayez.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    charger();
    const auRetour = () => {
      if (document.visibilityState === 'visible') charger();
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [charger]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  const total = enfants.reduce((s, e) => s + e.resultats.length, 0);

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Résultats d'examens</h1>
        <p className="text-sm text-gray-500">
          Les résultats apparaissent ici dès que l'école les publie.
        </p>
      </div>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">{erreur}</div>
      )}

      {!erreur && total === 0 && (
        <p className="text-gray-500 text-sm">Aucun résultat d'examen publié pour le moment.</p>
      )}

      {enfants
        .filter((e) => e.resultats.length > 0)
        .map((e) => (
          <div key={e.id} className="space-y-2">
            <h2 className="font-semibold text-lg">
              {`${e.nom} ${e.prenom}`.trim() || 'Élève'}
            </h2>

            {e.resultats.map((r) => {
              const absent = !r.a_participe || r.decision === 'Absent';
              const style = (r.decision && STYLE_DECISION[r.decision]) || 'bg-gray-100 text-gray-700';
              return (
                <div key={r.examen_id} className="border rounded-xl p-4 bg-white space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="font-medium">{r.examen_nom}</div>
                      <div className="text-xs text-gray-500">
                        {[r.classe_nom, r.annee_scolaire].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {r.decision && (
                      <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${style}`}>
                        {r.decision}
                      </span>
                    )}
                  </div>

                  {absent ? (
                    <p className="text-sm text-gray-600">L'élève n'a pas participé à cet examen.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="border rounded-lg p-2">
                        <p className="text-xs text-gray-500">Moyenne</p>
                        <p className="font-semibold">{formaterNombre(r.moyenne)}/20</p>
                      </div>
                      <div className="border rounded-lg p-2">
                        <p className="text-xs text-gray-500">Rang</p>
                        <p className="font-semibold">{r.rang ? `${r.rang}e` : '—'}</p>
                      </div>
                      <div className="border rounded-lg p-2">
                        <p className="text-xs text-gray-500">Mention</p>
                        <p className="font-semibold text-sm">{r.mention || '—'}</p>
                      </div>
                    </div>
                  )}

                  {!absent && r.points_obtenus !== null && r.points_total !== null && (
                    <p className="text-xs text-gray-500">
                      Points : {formaterNombre(r.points_obtenus)} sur {formaterNombre(r.points_total)}
                    </p>
                  )}

                  <p className="text-xs text-gray-400">Publié le {formaterDate(r.publie_le)}</p>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
