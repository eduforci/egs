'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type AbsenceRow = {
  id: string;
  date: string;
  type: 'absence' | 'retard';
  duree_minutes: number | null;
  justifie: boolean;
  motif: string | null;
};

type Enfant = { id: string; nom: string; prenoms: string; classe_id: string };

export default function AbsencesConsultationPage() {
  const supabase = createClient();
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [enfantId, setEnfantId] = useState<string>('');
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [estEleve, setEstEleve] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: profil } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();

      if (profil?.role === 'eleve') {
        setEstEleve(true);
        setEnfantId(userData.user.id);
        setLoading(false);
        return;
      }

      // Parent : lister ses enfants via parents_eleves
      const { data: liens } = await supabase
        .from('parents_eleves')
        .select('eleve_id, eleves(id, nom, prenoms, classe_id)')
        .eq('parent_id', userData.user.id);

      const listeEnfants = (liens || [])
        .map((l: any) => l.eleves)
        .filter(Boolean);

      setEnfants(listeEnfants);
      if (listeEnfants.length > 0) setEnfantId(listeEnfants[0].id);
      setLoading(false);
    };
    init();
  }, [supabase]);

  useEffect(() => {
    const chargerAbsences = async () => {
      if (!enfantId) return;
      const { data, error } = await supabase
        .from('absences')
        .select('id, date, type, duree_minutes, justifie, motif')
        .eq('eleve_id', enfantId)
        .order('date', { ascending: false });

      if (!error) setAbsences(data || []);
    };
    chargerAbsences();
  }, [enfantId, supabase]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  const totalAbsences = absences.filter((a) => a.type === 'absence').length;
  const totalRetards = absences.filter((a) => a.type === 'retard').length;
  const nonJustifiees = absences.filter((a) => a.type === 'absence' && !a.justifie).length;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Absences {estEleve ? '' : "de l'enfant"}</h1>

      {!estEleve && enfants.length > 1 && (
        <select
          value={enfantId}
          onChange={(e) => setEnfantId(e.target.value)}
          className="w-full border rounded-lg p-2"
        >
          {enfants.map((e) => (
            <option key={e.id} value={e.id}>{e.nom} {e.prenoms}</option>
          ))}
        </select>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="text-2xl font-bold text-red-700">{totalAbsences}</div>
          <div className="text-xs text-red-600">Absences</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="text-2xl font-bold text-orange-700">{totalRetards}</div>
          <div className="text-xs text-orange-600">Retards</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-2xl font-bold text-gray-700">{nonJustifiees}</div>
          <div className="text-xs text-gray-600">Non justifiées</div>
        </div>
      </div>

      <div className="space-y-2">
        {absences.length === 0 && (
          <p className="text-gray-500 text-sm">Aucune absence enregistrée.</p>
        )}
        {absences.map((a) => (
          <div key={a.id} className="border rounded-lg p-3 flex justify-between items-start">
            <div>
              <div className="font-medium">
                {new Date(a.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div className="text-sm text-gray-600">
                {a.type === 'absence' ? 'Absence' : `Retard (${a.duree_minutes ?? '?'} min)`}
                {a.motif ? ` — ${a.motif}` : ''}
              </div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${a.justifie ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {a.justifie ? 'Justifiée' : 'Non justifiée'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
            }
