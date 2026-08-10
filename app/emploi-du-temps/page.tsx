'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type Creneau = {
  id: string;
  jour: string;
  heure_debut: string;
  heure_fin: string;
  salle: string | null;
  matieres?: { nom: string };
  profiles?: { nom: string; prenom: string };
};

type Enfant = { id: string; nom: string; prenom: string; classe_id: string };

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_LABEL: Record<string, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
  jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi',
};

export default function EmploiDuTempsConsultationPage() {
  const supabase = createClient();
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [classeId, setClasseId] = useState('');
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
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
        const { data: eleve } = await supabase
          .from('eleves')
          .select('classe_id')
          .eq('id', userData.user.id)
          .single();
        if (eleve?.classe_id) setClasseId(eleve.classe_id);
        setLoading(false);
        return;
      }

      const { data: liens } = await supabase
        .from('parents_eleves')
        .select('eleve_id, eleves(id, classe_id, profiles(nom, prenom))')
        .eq('parent_id', userData.user.id);

      const listeEnfants = (liens || [])
        .map((l: any) => l.eleves && {
          id: l.eleves.id,
          classe_id: l.eleves.classe_id,
          nom: l.eleves.profiles?.nom ?? '',
          prenom: l.eleves.profiles?.prenom ?? '',
        })
        .filter(Boolean);

      setEnfants(listeEnfants);
      if (listeEnfants.length > 0) setClasseId(listeEnfants[0].classe_id);
      setLoading(false);
    };
    init();
  }, [supabase]);

  useEffect(() => {
    const chargerCreneaux = async () => {
      if (!classeId) return;
      const { data, error } = await supabase
        .from('emploi_du_temps')
        .select('id, jour, heure_debut, heure_fin, salle, matieres(nom), profiles(nom, prenom)')
        .eq('classe_id', classeId)
        .order('heure_debut');

      if (!error) setCreneaux((data as any) || []);
    };
    chargerCreneaux();
  }, [classeId, supabase]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Emploi du temps</h1>

      {!estEleve && enfants.length > 1 && (
        <select
          value={classeId}
          onChange={(e) => setClasseId(e.target.value)}
          className="w-full border rounded-lg p-2"
        >
          {enfants.map((e) => (
            <option key={e.id} value={e.classe_id}>{e.nom} {e.prenom}</option>
          ))}
        </select>
      )}

      {creneaux.length === 0 && (
        <p className="text-gray-500 text-sm">Aucun créneau disponible.</p>
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
                <div className="text-sm text-gray-600">{c.matieres?.nom}</div>
                <div className="text-xs text-gray-500">
                  {c.profiles?.nom} {c.profiles?.prenom}{c.salle ? ` — ${c.salle}` : ''}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
        }
