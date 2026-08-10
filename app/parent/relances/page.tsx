'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type Relance = {
  id: string;
  message: string;
  created_at: string;
  eleve_nom: string;
  eleve_prenom: string;
};

export default function RelancesParentPage() {
  const supabase = createClient();
  const [relances, setRelances] = useState<Relance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const charger = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data, error } = await supabase
        .from('relances_paiement')
        .select('id, message, created_at, eleve_id')
        .order('created_at', { ascending: false });

      if (error) {
        setLoading(false);
        return;
      }

      const idsEleves = Array.from(new Set((data || []).map((r) => r.eleve_id)));
      const { data: profs } = idsEleves.length > 0
        ? await supabase.from('profiles').select('id, nom, prenom').in('id', idsEleves)
        : { data: [] };
      const profsParId = new Map((profs || []).map((p) => [p.id, p]));

      setRelances(
        (data || []).map((r) => {
          const p = profsParId.get(r.eleve_id);
          return {
            id: r.id,
            message: r.message,
            created_at: r.created_at,
            eleve_nom: p?.nom || '',
            eleve_prenom: p?.prenom || '',
          };
        })
      );
      setLoading(false);
    };
    charger();
  }, [supabase]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Rappels de paiement</h1>

      {relances.length === 0 && (
        <p className="text-gray-500 text-sm">Aucun rappel de paiement.</p>
      )}

      <div className="space-y-2">
        {relances.map((r) => (
          <div key={r.id} className="border rounded-lg p-3 bg-orange-50 border-orange-200">
            <div className="font-medium text-sm">{r.eleve_nom} {r.eleve_prenom}</div>
            <p className="text-sm text-gray-700 mt-1">{r.message}</p>
            <div className="text-xs text-gray-500 mt-2">
              {new Date(r.created_at).toLocaleDateString('fr-FR')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
        }
