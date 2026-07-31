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
  serie: string | null;
  points_obtenus: number;
  points_total: number;
  moyenne: number;
  mention: string;
  a_participe: boolean;
  rang: number | null;
  decision: string;
};

type Statistiques = {
  inscrits: number;
  presents: number;
  absents: number;
  exclus: number;
  admis: number;
  ajournes: number;
  pourcentage_admis: number;
  moyenne_generale: number;
};

type MoyenneGroupe = { classe_nom?: string; serie?: string; nb_candidats: number; moyenne: number; taux_admission: number };
type MoyenneMatiere = { matiere_nom: string; epreuve_nom: string; moyenne: number; nb_notes: number };

const DECISION_STYLE: Record<string, string> = {
  Admis: 'text-green-600',
  Ajourné: 'text-orange-600',
  Refusé: 'text-red-600',
  Absent: 'text-gray-400',
  Exclu: 'text-red-600',
};

const ONGLETS = [
  { value: 'individuels', label: 'Individuels' },
  { value: 'statistiques', label: 'Statistiques' },
  { value: 'classe', label: 'Par classe' },
  { value: 'serie', label: 'Par série' },
  { value: 'matiere', label: 'Par matière' },
  { value: 'palmares', label: 'Palmarès' },
];

export default function ResultatsExamenPage() {
  const params = useParams();
  const examenId = params?.id as string;
  const supabase = createClient();

  const [examenNom, setExamenNom] = useState('');
  const [libelleEchec, setLibelleEchec] = useState('Refusés');
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [stats, setStats] = useState<Statistiques | null>(null);
  const [parClasse, setParClasse] = useState<MoyenneGroupe[]>([]);
  const [parSerie, setParSerie] = useState<MoyenneGroupe[]>([]);
  const [parMatiere, setParMatiere] = useState<MoyenneMatiere[]>([]);

  const [onglet, setOnglet] = useState('individuels');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: examen, error: examenError } = await supabase
        .from('examens')
        .select('nom, cycle')
        .eq('id', examenId)
        .single();

      if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
      setExamenNom(examen.nom);
      // "Ajourné" est réservé au cycle universitaire (pas encore disponible dans EGS) ;
      // primaire, collège et lycée utilisent tous "Refusé", conformément aux normes nationales.
      setLibelleEchec(examen.cycle === 'universite' ? 'Ajournés' : 'Refusés');

      const [resResultats, resStats, resClasse, resSerie, resMatiere] = await Promise.all([
        supabase.rpc('calculer_resultats_examen', { p_examen_id: examenId }),
        supabase.rpc('calculer_statistiques_examen', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_classe', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_serie', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_matiere', { p_examen_id: examenId }),
      ]);

      if (resResultats.error) throw new Error(`Erreur résultats : ${resResultats.error.message}`);
      if (resStats.error) throw new Error(`Erreur statistiques : ${resStats.error.message}`);
      if (resClasse.error) throw new Error(`Erreur par classe : ${resClasse.error.message}`);
      if (resSerie.error) throw new Error(`Erreur par série : ${resSerie.error.message}`);
      if (resMatiere.error) throw new Error(`Erreur par matière : ${resMatiere.error.message}`);

      setResultats((resResultats.data as Resultat[]) ?? []);
      setStats(resStats.data as Statistiques);
      setParClasse((resClasse.data as MoyenneGroupe[]) ?? []);
      setParSerie((resSerie.data as MoyenneGroupe[]) ?? []);
      setParMatiere((resMatiere.data as MoyenneMatiere[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [examenId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const classes = resultats.filter((r) => r.decision === 'Admis' || r.decision === 'Ajourné' || r.decision === 'Refusé');
  const major = classes[0];
  const top10 = classes.slice(0, 10);
  const top20 = classes.slice(0, 20);

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-4xl mx-auto pb-16">
      <div className="flex justify-between items-start mb-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold mb-1">Résultats — {examenNom}</h1>
          {stats && (
            <p className="text-sm text-gray-500">
              {stats.inscrits} inscrit(s) · {stats.admis} admis · {stats.pourcentage_admis}% de réussite
            </p>
          )}
        </div>
        <button onClick={() => window.print()} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md">
          Imprimer / PDF
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}

      {/* Onglets */}
      <div className="flex gap-1 mb-4 overflow-x-auto print:hidden">
        {ONGLETS.map((o) => (
          <button
            key={o.value}
            onClick={() => setOnglet(o.value)}
            className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${
              onglet === o.value ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Résultats individuels */}
      {onglet === 'individuels' && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Rang</th>
                <th className="text-left px-3 py-2">Candidat</th>
                <th className="text-left px-3 py-2">Classe</th>
                <th className="text-left px-3 py-2">Moyenne</th>
                <th className="text-left px-3 py-2">Mention</th>
                <th className="text-left px-3 py-2">Décision</th>
              </tr>
            </thead>
            <tbody>
              {resultats.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">Aucun résultat.</td></tr>
              ) : (
                resultats.map((r) => (
                  <tr key={r.eleve_id} className="border-t">
                    <td className="px-3 py-2 font-semibold">{r.rang ?? '-'}</td>
                    <td className="px-3 py-2">{r.nom} {r.prenom}</td>
                    <td className="px-3 py-2 text-gray-500">{r.classe_nom}</td>
                    <td className="px-3 py-2">{r.moyenne}/20 <span className="text-gray-400 text-xs">({r.points_obtenus}/{r.points_total})</span></td>
                    <td className="px-3 py-2 text-gray-500">{['Admis','Ajourné','Refusé'].includes(r.decision) ? r.mention : '-'}</td>
                    <td className={`px-3 py-2 font-medium ${DECISION_STYLE[r.decision] ?? ''}`}>{r.decision}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Statistiques */}
      {onglet === 'statistiques' && stats && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Inscrits', valeur: stats.inscrits },
            { label: 'Présents', valeur: stats.presents },
            { label: 'Absents', valeur: stats.absents },
            { label: 'Exclus', valeur: stats.exclus },
            { label: 'Admis', valeur: stats.admis },
            { label: libelleEchec, valeur: stats.ajournes },
            { label: 'Taux de réussite', valeur: `${stats.pourcentage_admis}%` },
            { label: 'Moyenne générale', valeur: `${stats.moyenne_generale}/20` },
          ].map((s) => (
            <div key={s.label} className="border rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{s.valeur}</p>
              <p className="text-[10px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Par classe */}
      {onglet === 'classe' && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Classe</th>
                <th className="text-left px-3 py-2">Candidats</th>
                <th className="text-left px-3 py-2">Moyenne</th>
                <th className="text-left px-3 py-2">Taux admission</th>
              </tr>
            </thead>
            <tbody>
              {parClasse.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Aucune donnée.</td></tr>
              ) : (
                parClasse.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{c.classe_nom}</td>
                    <td className="px-3 py-2">{c.nb_candidats}</td>
                    <td className="px-3 py-2">{c.moyenne}/20</td>
                    <td className="px-3 py-2">{c.taux_admission}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Par série */}
      {onglet === 'serie' && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Série</th>
                <th className="text-left px-3 py-2">Candidats</th>
                <th className="text-left px-3 py-2">Moyenne</th>
                <th className="text-left px-3 py-2">Taux admission</th>
              </tr>
            </thead>
            <tbody>
              {parSerie.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Aucune donnée.</td></tr>
              ) : (
                parSerie.map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{s.serie}</td>
                    <td className="px-3 py-2">{s.nb_candidats}</td>
                    <td className="px-3 py-2">{s.moyenne}/20</td>
                    <td className="px-3 py-2">{s.taux_admission}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Par matière */}
      {onglet === 'matiere' && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Matière</th>
                <th className="text-left px-3 py-2">Épreuve</th>
                <th className="text-left px-3 py-2">Moyenne</th>
                <th className="text-left px-3 py-2">Notes saisies</th>
              </tr>
            </thead>
            <tbody>
              {parMatiere.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Aucune donnée.</td></tr>
              ) : (
                parMatiere.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{m.matiere_nom}</td>
                    <td className="px-3 py-2 text-gray-500">{m.epreuve_nom}</td>
                    <td className="px-3 py-2">{m.moyenne}/20</td>
                    <td className="px-3 py-2 text-gray-500">{m.nb_notes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Palmarès */}
      {onglet === 'palmares' && (
        <div className="space-y-4">
          {major && (
            <div className="border-2 border-amber-400 bg-amber-50 rounded-lg p-4 text-center">
              <p className="text-xs text-amber-700 font-semibold uppercase mb-1">Major de l'examen</p>
              <p className="text-lg font-bold">{major.nom} {major.prenom}</p>
              <p className="text-sm text-gray-600">{major.classe_nom} · {major.moyenne}/20</p>
            </div>
          )}

          <div>
            <p className="font-semibold text-sm mb-2">Top 10</p>
            <div className="border rounded-lg overflow-hidden">
              {top10.map((r) => (
                <div key={r.eleve_id} className="flex justify-between px-3 py-2 border-t first:border-t-0 text-sm">
                  <span>{r.rang}. {r.nom} {r.prenom}</span>
                  <span className="text-gray-500">{r.moyenne}/20</span>
                </div>
              ))}
              {top10.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">Aucun candidat classé.</p>}
            </div>
          </div>

          <div>
            <p className="font-semibold text-sm mb-2">Top 20</p>
            <div className="border rounded-lg overflow-hidden">
              {top20.map((r) => (
                <div key={r.eleve_id} className="flex justify-between px-3 py-2 border-t first:border-t-0 text-sm">
                  <span>{r.rang}. {r.nom} {r.prenom}</span>
                  <span className="text-gray-500">{r.moyenne}/20</span>
                </div>
              ))}
              {top20.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">Aucun candidat classé.</p>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
    }
                                                              
