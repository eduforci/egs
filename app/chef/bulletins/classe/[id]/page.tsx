'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Eleve = {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
};

export default function BulletinsClassePage() {
  const params = useParams();
  const classeId = params?.id as string;
  const supabase = createClient();

  const [classeNom, setClasseNom] = useState('');
  const [trimestre, setTrimestre] = useState(1);
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: classe, error: classeError } = await supabase
        .from('classes')
        .select('nom')
        .eq('id', classeId)
        .single();

      if (classeError) throw new Error(classeError.message);
      setClasseNom(classe.nom);

      const { data: elevesRaw, error: elevesError } = await supabase
        .from('eleves')
        .select('id, matricule')
        .eq('classe_id', classeId);

      if (elevesError) throw new Error(elevesError.message);

      const ids = (elevesRaw ?? []).map((e) => e.id);
      const { data: profils, error: profilsError } =
        ids.length > 0
          ? await supabase.from('profiles').select('id, nom, prenom').in('id', ids)
          : { data: [], error: null };

      if (profilsError) throw new Error(profilsError.message);

      const profilsMap = new Map((profils ?? []).map((p) => [p.id, p]));

      const liste: Eleve[] = (elevesRaw ?? [])
        .map((e) => ({
          id: e.id,
          matricule: e.matricule,
          nom: profilsMap.get(e.id)?.nom ?? '',
          prenom: profilsMap.get(e.id)?.prenom ?? '',
        }))
        .sort((a, b) => a.nom.localeCompare(b.nom));

      setEleves(liste);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [classeId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Bulletins — {classeNom}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {eleves.length} élève(s) — ouvre le bulletin de chacun pour l'imprimer ou l'enregistrer en PDF individuellement.
      </p>

      <div className="mb-4">
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

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}

      {!loading && eleves.length === 0 && !error && (
        <p className="text-sm text-gray-400">Aucun élève dans cette classe.</p>
      )}

      {!loading && eleves.length > 0 && (
        <div className="border rounded-lg divide-y">
          {eleves.map((e) => (
            <Link
              key={e.id}
              href={`/chef/bulletins/${classeId}/${e.id}/${trimestre}`}
              target="_blank"
              className="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50"
            >
              <span>
                {e.nom} {e.prenom}
                <span className="text-gray-400 font-mono text-xs ml-2">{e.matricule}</span>
              </span>
              <span className="text-blue-600 text-xs">Ouvrir le bulletin →</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
  }
