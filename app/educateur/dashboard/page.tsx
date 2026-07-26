'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Classe = { id: string; nom: string; niveau: string };

export default function DashboardEducateur() {
  const [classes, setClasses] = useState<Classe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function charger() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Non authentifié.");

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('etablissement_id')
          .eq('id', user.id)
          .single();

        if (profileError) throw new Error(`Erreur profil : ${profileError.message}`);

        const { data: classesData, error: classesError } = await supabase
          .from('classes')
          .select('id, nom, niveau')
          .eq('etablissement_id', profile.etablissement_id)
          .order('niveau', { ascending: true });

        if (classesError) throw new Error(`Erreur classes : ${classesError.message}`);

        setClasses(classesData ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    }
    charger();
  }, []);

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Espace Éducateur</h1>
      <p className="text-sm text-gray-500 mb-4">Saisie des notes de conduite par classe</p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}

      {!loading && !error && classes.length === 0 && (
        <p className="text-sm text-gray-500">Aucune classe trouvée pour cet établissement.</p>
      )}

      {!loading && !error && classes.length > 0 && (
        <ul className="space-y-2">
          {classes.map((c) => (
            <li key={c.id}>
              <Link
                href={`/educateur/classes/${c.id}/conduite`}
                className="block border rounded-lg p-3 hover:bg-gray-50"
              >
                <span className="font-medium">{c.nom}</span>
                <span className="text-gray-400 text-sm ml-2">{c.niveau}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
      }
