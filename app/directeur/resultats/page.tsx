'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Classe = { id: string; nom: string };
type ResultatEleve = {
  eleve_id: string;
  eleve_nom: string;
  eleve_prenom: string;
  moyenne_generale: number;
  rang: number;
};

export default function ResultatsPage() {
  const supabase = createClient();

  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeId, setClasseId] = useState('');
  const [trimestre, setTrimestre] = useState(1);
  const [anneeScolaire, setAnneeScolaire] = useState('');
  const [resultats, setResultats] = useState<ResultatEleve[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', userData.user.id)
        .single();

      if (!profil?.etablissement_id) {
        setLoading(false);
        return;
      }

      const { data: etab } = await supabase
        .from('etablissements')
        .select('annee_scolaire_active')
        .eq('id', profil.etablissement_id)
        .single();
      setAnneeScolaire(etab?.annee_scolaire_active || new Date().getFullYear().toString());

      const { data: classesData } = await supabase
        .from('classes')
        .select('id, nom')
        .eq('etablissement_id', profil.etablissement_id)
        .order('nom');
      setClasses(classesData || []);
      setLoading(false);
    };
    init();
  }, [supabase]);

  const chargerResultats = useCallback(async () => {
    if (!classeId || !anneeScolaire) {
      setResultats([]);
      return;
    }
    setLoading(true);
    setErreur('');

    const { data: classementData, error } = await supabase.rpc('classement_classe', {
      p_classe_id: classeId,
      p_trimestre: trimestre,
      p_annee_scolaire: anneeScolaire,
    });

    if (error) {
      setErreur(error.message);
      setLoading(false);
      return;
    }

    const idsEleves = (classementData || []).map((r: any) => r.eleve_id);
    const { data: profs } = idsEleves.length > 0
      ? await supabase.from('profiles').select('id, nom, prenom').in('id', idsEleves)
      : { data: [] };
    const profsParId = new Map((profs || []).map((p) => [p.id, p]));

    const liste: ResultatEleve[] = (classementData || []).map((r: any) => {
      const p = profsParId.get(r.eleve_id);
      return {
        eleve_id: r.eleve_id,
        eleve_nom: p?.nom || '',
        eleve_prenom: p?.prenom || '',
        moyenne_generale: Number(r.moyenne_generale),
        rang: r.rang,
      };
    });

    setResultats(liste);
    setLoading(false);
  }, [classeId, trimestre, anneeScolaire, supabase]);

  useEffect(() => {
    chargerResultats();
  }, [chargerResultats]);

  const moyenneClasse = resultats.length > 0
    ? Math.round((resultats.reduce((s, r) => s + r.moyenne_generale, 0) / resultats.length) * 100) / 100
    : 0;

  const nbAdmis = resultats.filter((r) => r.moyenne_generale >= 10).length;
  const tauxReussite = resultats.length > 0 ? Math.round((nbAdmis / resultats.length) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Résultats</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium mb-1">Classe</label>
          <select
            value={classeId}
            onChange={(e) => setClasseId(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="">-- Sélectionner une classe --</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Trimestre</label>
          <select
            value={trimestre}
            onChange={(e) => setTrimestre(parseInt(e.target.value))}
            className="w-full border rounded-lg p-2"
          >
            <option value={1}>Trimestre 1</option>
            <option value={2}>Trimestre 2</option>
            <option value={3}>Trimestre 3</option>
          </select>
        </div>
      </div>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Chargement...</p>}

      {!loading && classeId && resultats.length === 0 && (
        <p className="text-gray-500 text-sm">Aucun résultat disponible pour cette classe/trimestre.</p>
      )}

      {!loading && resultats.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{moyenneClasse}</div>
              <div className="text-xs text-gray-500">Moyenne classe</div>
            </div>
            <div className="border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{tauxReussite}%</div>
              <div className="text-xs text-gray-500">Taux réussite</div>
            </div>
            <div className="border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{nbAdmis}/{resultats.length}</div>
              <div className="text-xs text-gray-500">Admis ≥10</div>
            </div>
          </div>

          <div className="space-y-2">
            {resultats.map((r) => (
              <div key={r.eleve_id} className="border rounded-lg p-3 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    r.rang === 1 ? 'bg-yellow-100 text-yellow-700' :
                    r.rang === 2 ? 'bg-gray-200 text-gray-700' :
                    r.rang === 3 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {r.rang}
                  </span>
                  <span className="text-sm font-medium">{r.eleve_nom} {r.eleve_prenom}</span>
                </div>
                <span className={`text-sm font-bold ${r.moyenne_generale >= 10 ? 'text-green-700' : 'text-red-700'}`}>
                  {r.moyenne_generale}/20
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
          }
