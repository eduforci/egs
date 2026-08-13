'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Justification = {
  id: string;
  date_debut: string;
  date_fin: string;
  heure_debut: string | null;
  heure_fin: string | null;
  type: string;
  motif: string;
  statut: string;
  valide_at: string | null;
};

const TYPES_JUSTIFICATION = [
  { value: 'mission', label: 'Mission' },
  { value: 'permission', label: 'Permission' },
  { value: 'absence_justifiee', label: 'Absence justifiée' },
  { value: 'autorisation', label: 'Autorisation' },
  { value: 'activite_exceptionnelle', label: 'Activité exceptionnelle' },
];

const STATUT_STYLE: Record<string, { label: string; classe: string }> = {
  en_attente: { label: 'En attente', classe: 'bg-orange-100 text-orange-700' },
  validee: { label: 'Validée', classe: 'bg-green-100 text-green-700' },
  refusee: { label: 'Refusée', classe: 'bg-red-100 text-red-700' },
};

export default function JustificationsPersonnelPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [justifications, setJustifications] = useState<Justification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'permission',
    date_debut: new Date().toISOString().slice(0, 10),
    date_fin: new Date().toISOString().slice(0, 10),
    heure_debut: '',
    heure_fin: '',
    motif: '',
  });

  const charger = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;
    setProfileId(userData.user.id);

    const { data: profil } = await supabase
      .from('profiles')
      .select('etablissement_id')
      .eq('id', userData.user.id)
      .single();

    if (!profil?.etablissement_id) {
      setLoading(false);
      return;
    }
    setEtablissementId(profil.etablissement_id);

    const { data, error } = await supabase
      .from('pointage_justifications')
      .select('id, date_debut, date_fin, heure_debut, heure_fin, type, motif, statut, valide_at')
      .eq('profile_id', userData.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setMessage({ type: 'error', text: error.message });
      setLoading(false);
      return;
    }

    setJustifications(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const soumettre = async () => {
    if (!form.motif.trim()) {
      setMessage({ type: 'error', text: 'Précisez un motif.' });
      return;
    }
    if (form.date_fin < form.date_debut) {
      setMessage({ type: 'error', text: 'La date de fin doit être après la date de début.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    const { error } = await supabase.from('pointage_justifications').insert({
      etablissement_id: etablissementId,
      profile_id: profileId,
      type: form.type,
      date_debut: form.date_debut,
      date_fin: form.date_fin,
      heure_debut: form.heure_debut || null,
      heure_fin: form.heure_fin || null,
      motif: form.motif.trim(),
      statut: 'en_attente',
      demande_par: profileId,
    });

    if (error) {
      setMessage({ type: 'error', text: 'Erreur: ' + error.message });
      setSaving(false);
      return;
    }

    setMessage({ type: 'success', text: 'Demande envoyée, en attente de validation.' });
    setForm({
      type: 'permission',
      date_debut: new Date().toISOString().slice(0, 10),
      date_fin: new Date().toISOString().slice(0, 10),
      heure_debut: '',
      heure_fin: '',
      motif: '',
    });
    setShowForm(false);
    setSaving(false);
    charger();
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Mes justifications</h1>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium"
        >
          + Nouvelle demande
        </button>
      )}

      {showForm && (
        <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
          <div className="flex justify-between items-center">
            <span className="font-medium text-sm text-gray-700">Nouvelle justification</span>
            <button onClick={() => setShowForm(false)} className="text-sm text-gray-500">Annuler</button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full border rounded-lg p-2"
            >
              {TYPES_JUSTIFICATION.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">Date début</label>
              <input
                type="date"
                value={form.date_debut}
                onChange={(e) => setForm({ ...form, date_debut: e.target.value })}
                className="w-full border rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date fin</label>
              <input
                type="date"
                value={form.date_fin}
                onChange={(e) => setForm({ ...form, date_fin: e.target.value })}
                className="w-full border rounded-lg p-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">Heure début (optionnel)</label>
              <input
                type="time"
                value={form.heure_debut}
                onChange={(e) => setForm({ ...form, heure_debut: e.target.value })}
                className="w-full border rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Heure fin (optionnel)</label>
              <input
                type="time"
                value={form.heure_fin}
                onChange={(e) => setForm({ ...form, heure_fin: e.target.value })}
                className="w-full border rounded-lg p-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Motif</label>
            <textarea
              value={form.motif}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              className="w-full border rounded-lg p-2 min-h-20"
              placeholder="Expliquez la raison..."
            />
          </div>

          <button
            onClick={soumettre}
            disabled={saving}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Envoi...' : 'Envoyer la demande'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="font-semibold text-gray-700 text-sm">Historique</h2>
        {justifications.length === 0 && (
          <p className="text-gray-500 text-sm">Aucune justification demandée.</p>
        )}
        {justifications.map((j) => {
          const style = STATUT_STYLE[j.statut] || { label: j.statut, classe: 'bg-gray-100 text-gray-700' };
          return (
            <div key={j.id} className="border rounded-lg p-3">
              <div className="flex justify-between items-start">
                <div className="font-medium text-sm">
                  {TYPES_JUSTIFICATION.find((t) => t.value === j.type)?.label || j.type}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${style.classe}`}>{style.label}</span>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Du {new Date(j.date_debut).toLocaleDateString('fr-FR')} au {new Date(j.date_fin).toLocaleDateString('fr-FR')}
                {j.heure_debut && ` — ${j.heure_debut.slice(0, 5)} à ${j.heure_fin?.slice(0, 5) || ''}`}
              </div>
              <div className="text-xs text-gray-500 mt-1">{j.motif}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
      }
