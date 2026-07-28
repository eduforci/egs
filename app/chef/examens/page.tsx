'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Examen = {
  id: string;
  nom: string;
  type: string;
  niveau: string;
  annee_scolaire: string;
  moyenne_admission: number;
  statut: string;
};

const TYPES = [
  { value: 'final', label: 'Examen final' },
  { value: 'blanc_local', label: 'Examen blanc local' },
  { value: 'blanc_regional', label: 'Examen blanc régional' },
];

export default function ExamensPage() {
  const [examens, setExamens] = useState<Examen[]>([]);
  const [niveaux, setNiveaux] = useState<string[]>([]);
  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [anneeActive, setAnneeActive] = useState('');

  const [nom, setNom] = useState('');
  const [type, setType] = useState('final');
  const [niveau, setNiveau] = useState('');
  const [moyenneAdmission, setMoyenneAdmission] = useState('10');

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', user.id)
        .single();

      if (profileError) throw new Error(`Erreur profil : ${profileError.message}`);
      setEtablissementId(profile.etablissement_id);

      const { data: etab, error: etabError } = await supabase
        .from('etablissements')
        .select('annee_scolaire_active')
        .eq('id', profile.etablissement_id)
        .single();

      if (etabError) throw new Error(`Erreur établissement : ${etabError.message}`);
      setAnneeActive(etab.annee_scolaire_active);

      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('niveau')
        .eq('etablissement_id', profile.etablissement_id);

      if (classesError) throw new Error(`Erreur niveaux : ${classesError.message}`);
      const niveauxUniques = Array.from(new Set((classesData ?? []).map((c) => c.niveau)));
      setNiveaux(niveauxUniques);

      const { data: examensData, error: examensError } = await supabase
        .from('examens')
        .select('id, nom, type, niveau, annee_scolaire, moyenne_admission, statut')
        .eq('etablissement_id', profile.etablissement_id)
        .order('created_at', { ascending: false });

      if (examensError) throw new Error(`Erreur examens : ${examensError.message}`);
      setExamens(examensData ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creerExamen() {
    if (!nom.trim() || !niveau || !etablissementId) {
      setError('Nom et niveau obligatoires.');
      return;
    }
    setCreating(true);
    setError(null);

    const { error: insertError } = await supabase.from('examens').insert({
      etablissement_id: etablissementId,
      nom: nom.trim(),
      type,
      niveau,
      annee_scolaire: anneeActive,
      moyenne_admission: parseFloat(moyenneAdmission) || 10,
    });

    setCreating(false);

    if (insertError) {
      setError(`Erreur création : ${insertError.message}`);
      return;
    }

    setNom('');
    setNiveau('');
    setMoyenneAdmission('10');
    charger();
  }

  const statutLabel: Record<string, string> = {
    preparation: 'En préparation',
    en_cours: 'En cours',
    termine: 'Terminé',
  };

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Examens</h1>
      <p className="text-sm text-gray-500 mb-4">
        Examens finaux, blancs locaux et blancs régionaux — année {anneeActive}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {/* Liste des examens existants */}
      <div className="space-y-2 mb-6">
        {examens.length === 0 && (
          <p className="text-sm text-gray-400">Aucun examen créé pour le moment.</p>
        )}
        {examens.map((ex) => (
          <Link
            key={ex.id}
            href={`/chef/examens/${ex.id}`}
            className="block border rounded-lg p-3 hover:bg-gray-50"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{ex.nom}</p>
                <p className="text-xs text-gray-500">
                  {TYPES.find((t) => t.value === ex.type)?.label} · {ex.niveau} · Seuil {ex.moyenne_admission}/20
                </p>
              </div>
              <span className="text-xs bg-gray-100 rounded-full px-2 py-1">
                {statutLabel[ex.statut] ?? ex.statut}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Créer un nouvel examen */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-3">Créer un examen</p>
        <div className="space-y-3">
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom (ex: BEPC Blanc n°1)"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select
            value={niveau}
            onChange={(e) => setNiveau(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Choisir un niveau</option>
            {niveaux.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Seuil d'admission (/20)</label>
            <input
              type="number"
              step="0.5"
              value={moyenneAdmission}
              onChange={(e) => setMoyenneAdmission(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={creerExamen}
            disabled={creating || !nom.trim() || !niveau}
            className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-50"
          >
            {creating ? 'Création...' : 'Créer l\'examen'}
          </button>
        </div>
      </div>
    </main>
  );
  }
        
