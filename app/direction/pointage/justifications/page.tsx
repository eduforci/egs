'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type JustificationDemande = {
  id: string;
  profile_id: string;
  nom: string;
  prenom: string;
  role: string;
  type: string;
  date_debut: string;
  date_fin: string;
  heure_debut: string | null;
  heure_fin: string | null;
  motif: string;
  statut: string;
};

const TYPES_LABEL: Record<string, string> = {
  mission: 'Mission',
  permission: 'Permission',
  absence_justifiee: 'Absence justifiée',
  autorisation: 'Autorisation',
  activite_exceptionnelle: 'Activité exceptionnelle',
};

export default function JustificationsDirectionPage() {
  const supabase = createClient();

  const [demandes, setDemandes] = useState<JustificationDemande[]>([]);
  const [filtreStatut, setFiltreStatut] = useState('en_attente');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [traitementEnCours, setTraitementEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
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

    let query = supabase
      .from('pointage_justifications')
      .select('id, profile_id, type, date_debut, date_fin, heure_debut, heure_fin, motif, statut')
      .eq('etablissement_id', profil.etablissement_id)
      .order('created_at', { ascending: false });

    if (filtreStatut) query = query.eq('statut', filtreStatut);

    const { data, error } = await query;

    if (error) {
      setMessage({ type: 'error', text: error.message });
      setLoading(false);
      return;
    }

    const idsProfils = Array.from(new Set((data || []).map((d) => d.profile_id)));
    const { data: profs } = idsProfils.length > 0
      ? await supabase.from('profiles').select('id, nom, prenom, role').in('id', idsProfils)
      : { data: [] };
    const profsParId = new Map((profs || []).map((p) => [p.id, p]));

    const liste: JustificationDemande[] = (data || []).map((d) => {
      const p = profsParId.get(d.profile_id);
      return {
        ...d,
        nom: p?.nom || '',
        prenom: p?.prenom || '',
        role: p?.role || '',
      };
    });

    setDemandes(liste);
    setLoading(false);
  }, [supabase, filtreStatut]);

  useEffect(() => {
    charger();
  }, [charger]);

  const traiter = async (id: string, nouveauStatut: 'validee' | 'refusee') => {
    setTraitementEnCours(id);
    setMessage(null);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('pointage_justifications')
      .update({
        statut: nouveauStatut,
        valide_par: userData?.user?.id,
        valide_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      setMessage({ type: 'error', text: 'Erreur: ' + error.message });
      setTraitementEnCours(null);
      return;
    }

    setMessage({ type: 'success', text: nouveauStatut === 'validee' ? 'Demande validée.' : 'Demande refusée.' });
    setTraitementEnCours(null);
    charger();
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Justifications du personnel</h1>

      <div>
        <label className="block text-sm font-medium mb-1">Statut</label>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className="w-full border rounded-lg p-2"
        >
          <option value="en_attente">En attente</option>
          <option value="validee">Validées</option>
          <option value="refusee">Refusées</option>
          <option value="">Toutes</option>
        </select>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Chargement...</p>}

      {!loading && demandes.length === 0 && (
        <p className="text-gray-500 text-sm">Aucune demande.</p>
      )}

      <div className="space-y-2">
        {demandes.map((d) => (
          <div key={d.id} className="border rounded-lg p-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium text-sm">{d.nom} {d.prenom}</div>
                <div className="text-xs text-gray-500">{d.role}</div>
              </div>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                {TYPES_LABEL[d.type] || d.type}
              </span>
            </div>
            <div className="text-sm text-gray-600 mt-2">
              Du {new Date(d.date_debut).toLocaleDateString('fr-FR')} au {new Date(d.date_fin).toLocaleDateString('fr-FR')}
              {d.heure_debut && ` — ${d.heure_debut.slice(0, 5)} à ${d.heure_fin?.slice(0, 5) || ''}`}
            </div>
            <div className="text-sm text-gray-700 mt-1 italic">"{d.motif}"</div>

            {d.statut === 'en_attente' && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => traiter(d.id, 'validee')}
                  disabled={traitementEnCours === d.id}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  ✓ Valider
                </button>
                <button
                  onClick={() => traiter(d.id, 'refusee')}
                  disabled={traitementEnCours === d.id}
                  className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  ✗ Refuser
                </button>
              </div>
            )}

            {d.statut !== 'en_attente' && (
              <div className={`mt-2 text-xs px-2 py-1 rounded-full inline-block ${d.statut === 'validee' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {d.statut === 'validee' ? 'Validée' : 'Refusée'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
        }
