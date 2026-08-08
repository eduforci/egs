'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type Creneau = {
  id: string;
  jour: string;
  heure_debut: string;
  heure_fin: string;
  salle: string | null;
  classes?: { nom: string };
  matieres?: { nom: string };
};

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_LABEL: Record<string, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
  jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi',
};

export default function EmploiDuTempsEnseignantPage() {
  const supabase = createClient();
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data, error } = await supabase
        .from('emploi_du_temps')
        .select('id, jour, heure_debut, heure_fin, salle, classes(nom), matieres(nom)')
        .eq('enseignant_id', userData.user.id)
        .order('heure_debut');

      if (error) {
        setErreur(error.message);
        setLoading(false);
        return;
      }
      setCreneaux((data as any) || []);
      setLoading(false);
    };
    load();
  }, [supabase]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Mon emploi du temps</h1>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      {creneaux.length === 0 && (
        <p className="text-gray-500 text-sm">Aucun cours planifié.</p>
      )}

      {JOURS.map((jour) => {
        const creneauxJour = creneaux.filter((c) => c.jour === jour);
        if (creneauxJour.length === 0) return null;
        return (
          <div key={jour} className="space-y-2">
            <h2 className="font-semibold text-gray-700">{JOURS_LABEL[jour]}</h2>
            {creneauxJour.map((c) => (
              <div key={c.id} className="border rounded-lg p-3">
                <div className="font-medium">{c.heure_debut.slice(0, 5)} - {c.heure_fin.slice(0, 5)}</div>
                <div className="text-sm text-gray-600">{c.matieres?.nom} — {c.classes?.nom}</div>
                {c.salle && <div className="text-xs text-gray-500">{c.salle}</div>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
            }
