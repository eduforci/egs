'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Classe = { id: string; nom: string; annee_scolaire: string };

export default function ClotureAccueilPage() {
  const supabase = createClient();
  const [classes, setClasses] = useState<Classe[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profil } = await supabase.from('profiles').select('etablissement_id').eq('id', user?.id).single();
      if (!profil?.etablissement_id) { setChargement(false); return; }
      const { data: etab } = await supabase.from('etablissements').select('annee_scolaire_active').eq('id', profil.etablissement_id).single();
      let req = supabase.from('classes').select('id, nom, annee_scolaire').eq('etablissement_id', profil.etablissement_id);
      if (etab?.annee_scolaire_active) req = req.eq('annee_scolaire', etab.annee_scolaire_active);
      const { data } = await req;
      setClasses(((data ?? []) as Classe[]).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true })));
      setChargement(false);
    })();
  }, [supabase]);

  return (
    <main className="max-w-xl mx-auto p-4 pb-16 space-y-3">
      <div>
        <h1 className="text-xl font-bold">Clôture et conseil de classe</h1>
        <p className="text-sm text-gray-500">
          Pour chaque classe : clôturer le trimestre (les notes ne peuvent plus être modifiées), tenir le conseil de classe,
          puis en fin d'année décider du passage de chaque élève.
        </p>
      </div>
      {chargement && <p className="text-sm text-gray-500">Chargement…</p>}
      {!chargement && classes.length === 0 && <p className="text-sm text-gray-400">Aucune classe pour l'année en cours.</p>}
      <div className="border rounded-lg divide-y">
        {classes.map((c) => (
          <Link key={c.id} href={`/direction/cloture/${c.id}`} className="flex items-center justify-between px-3 py-3 text-sm hover:bg-gray-50">
            <span className="font-medium">{c.nom}</span>
            <span className="text-blue-600 text-xs">Ouvrir →</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
