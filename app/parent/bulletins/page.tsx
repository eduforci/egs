'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Enfant = { id: string; classe_id: string; nom: string; prenom: string; classe_nom: string };

export default function BulletinsParentAccueil() {
  const supabase = createClient();
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [trimestre, setTrimestre] = useState('1');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const charger = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: liens } = await supabase
        .from('parents_eleves')
        .select('eleve_id, eleves(id, classe_id, classes(nom))')
        .eq('parent_id', userData.user.id);

      const idsEleves = (liens || []).map((l: any) => l.eleve_id);
      const { data: profs } = idsEleves.length > 0
        ? await supabase.from('profiles').select('id, nom, prenom').in('id', idsEleves)
        : { data: [] };
      const profsParId = new Map((profs || []).map((p) => [p.id, p]));

      const liste: Enfant[] = (liens || []).map((l: any) => {
        const p = profsParId.get(l.eleve_id);
        return {
          id: l.eleve_id,
          classe_id: l.eleves?.classe_id,
          classe_nom: l.eleves?.classes?.nom || '',
          nom: p?.nom || '',
          prenom: p?.prenom || '',
        };
      });

      setEnfants(liste);
      setLoading(false);
    };
    charger();
  }, [supabase]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Bulletins</h1>
      <p className="text-sm text-gray-500">Choisissez un trimestre et consultez le bulletin de votre enfant.</p>

      <div>
        <label className="block text-sm font-medium mb-1">Trimestre</label>
        <select
          value={trimestre}
          onChange={(e) => setTrimestre(e.target.value)}
          className="w-full border rounded-lg p-2"
        >
          <option value="1">Trimestre 1</option>
          <option value="2">Trimestre 2</option>
          <option value="3">Trimestre 3</option>
        </select>
      </div>

      {enfants.length === 0 && (
        <p className="text-gray-500 text-sm">Aucun enfant associé à votre compte.</p>
      )}

      <div className="space-y-2">
        {enfants.map((e) => (
          <Link
            key={e.id}
            href={`/parent/bulletins/${e.classe_id}/${e.id}/${trimestre}`}
            className="flex items-center justify-between border rounded-lg p-3"
          >
            <div>
              <div className="font-medium">{e.nom} {e.prenom}</div>
              <div className="text-xs text-gray-500">{e.classe_nom}</div>
            </div>
            <span className="text-blue-600 text-sm">Voir le bulletin →</span>
          </Link>
        ))}
      </div>
    </div>
  );
        }
