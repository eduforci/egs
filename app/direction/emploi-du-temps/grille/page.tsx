'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Periode = {
  id: string;
  cycle: string;
  ordre: number;
  heure_debut: string;
  heure_fin: string;
  est_pause: boolean;
  libelle: string | null;
};

const CYCLES = [
  { value: 'maternelle', label: 'Maternelle' },
  { value: 'primaire', label: 'Primaire' },
  { value: 'college', label: 'Collège' },
  { value: 'lycee', label: 'Lycée' },
];

const FORM_VIDE = {
  heure_debut: '07:30',
  heure_fin: '08:25',
  est_pause: false,
  libelle: '',
};

export default function GrilleHoraireePage() {
  const supabase = createClient();
  const [cycle, setCycle] = useState('college');
  const [periodes, setPeriodes] = useState<Periode[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [etablissementId, setEtablissementId] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', userData.user.id)
        .single();
      if (profil?.etablissement_id) setEtablissementId(profil.etablissement_id);
    };
    init();
  }, [supabase]);

  const chargerPeriodes = useCallback(async () => {
    if (!etablissementId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('creneaux_horaires_types')
      .select('*')
      .eq('etablissement_id', etablissementId)
      .eq('cycle', cycle)
      .order('ordre');

    if (error) {
      setMessage({ type: 'error', text: 'Erreur chargement: ' + error.message });
      setLoading(false);
      return;
    }
    setPeriodes(data || []);
    setLoading(false);
  }, [etablissementId, cycle, supabase]);

  useEffect(() => {
    chargerPeriodes();
  }, [chargerPeriodes]);

  const ouvrirAjout = () => {
    setEditingId(null);
    setForm(FORM_VIDE);
    setShowForm(true);
    setMessage(null);
  };

  const ouvrirEdition = (p: Periode) => {
    setEditingId(p.id);
    setForm({
      heure_debut: p.heure_debut.slice(0, 5),
      heure_fin: p.heure_fin.slice(0, 5),
      est_pause: p.est_pause,
      libelle: p.libelle || '',
    });
    setShowForm(true);
    setMessage(null);
  };

  const annuler = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(FORM_VIDE);
  };

  const valider = async () => {
    setSaving(true);
    setMessage(null);

    if (form.heure_fin <= form.heure_debut) {
      setMessage({ type: 'error', text: "L'heure de fin doit être après l'heure de début." });
      setSaving(false);
      return;
    }

    if (form.est_pause && !form.libelle.trim()) {
      setMessage({ type: 'error', text: 'Donnez un libellé pour la pause (ex: RECREATION).' });
      setSaving(false);
      return;
    }

    if (editingId) {
      const { error } = await supabase
        .from('creneaux_horaires_types')
        .update({
          heure_debut: form.heure_debut,
          heure_fin: form.heure_fin,
          est_pause: form.est_pause,
          libelle: form.est_pause ? form.libelle.trim() : null,
        })
        .eq('id', editingId);

      if (error) {
        setMessage({ type: 'error', text: 'Erreur modification: ' + error.message });
        setSaving(false);
        return;
      }
      setMessage({ type: 'success', text: 'Période modifiée.' });
    } else {
      const prochainOrdre = periodes.length > 0 ? Math.max(...periodes.map((p) => p.ordre)) + 1 : 1;

      const { error } = await supabase.from('creneaux_horaires_types').insert({
        etablissement_id: etablissementId,
        cycle,
        ordre: prochainOrdre,
        heure_debut: form.heure_debut,
        heure_fin: form.heure_fin,
        est_pause: form.est_pause,
        libelle: form.est_pause ? form.libelle.trim() : null,
      });

      if (error) {
        setMessage({ type: 'error', text: 'Erreur ajout: ' + error.message });
        setSaving(false);
        return;
      }
      setMessage({ type: 'success', text: 'Période ajoutée.' });
    }

    setForm(FORM_VIDE);
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
    chargerPeriodes();
  };

  const supprimer = async (id: string) => {
    const { error } = await supabase.from('creneaux_horaires_types').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Erreur suppression: ' + error.message });
      return;
    }
    if (editingId === id) annuler();
    chargerPeriodes();
  };

  const deplacer = async (id: string, direction: 'haut' | 'bas') => {
    const index = periodes.findIndex((p) => p.id === id);
    const cible = direction === 'haut' ? index - 1 : index + 1;
    if (cible < 0 || cible >= periodes.length) return;

    const a = periodes[index];
    const b = periodes[cible];

    await supabase.from('creneaux_horaires_types').update({ ordre: b.ordre }).eq('id', a.id);
    await supabase.from('creneaux_horaires_types').update({ ordre: a.ordre }).eq('id', b.id);

    chargerPeriodes();
  };

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Grille horaire type</h1>
      <p className="text-sm text-gray-500">
        Définissez les créneaux fixes de la journée pour chaque cycle. Cette grille sera utilisée pour créer les emplois du temps.
      </p>

      <div>
        <label className="block text-sm font-medium mb-1">Cycle</label>
        <select
          value={cycle}
          onChange={(e) => { setCycle(e.target.value); annuler(); }}
          className="w-full border rounded-lg p-2"
        >
          {CYCLES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {!showForm && (
        <button
          onClick={ouvrirAjout}
          className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium"
        >
          + Ajouter une période
        </button>
      )}

      {showForm && (
        <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
          <div className="flex justify-between items-center">
            <span className="font-medium text-sm text-gray-700">
              {editingId ? 'Modifier la période' : 'Nouvelle période'}
            </span>
            <button onClick={annuler} className="text-sm text-gray-500">Annuler</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">Début</label>
              <input
                type="time"
                value={form.heure_debut}
                onChange={(e) => setForm({ ...form, heure_debut: e.target.value })}
                className="w-full border rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Fin</label>
              <input
                type="time"
                value={form.heure_fin}
                onChange={(e) => setForm({ ...form, heure_fin: e.target.value })}
                className="w-full border rounded-lg p-2"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.est_pause}
              onChange={(e) => setForm({ ...form, est_pause: e.target.checked })}
            />
            C'est une pause (récréation, déjeuner) — pas un créneau de cours
          </label>

          {form.est_pause && (
            <input
              type="text"
              placeholder="Libellé (ex: RECREATION, APRES-MIDI)"
              value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value.toUpperCase() })}
              className="w-full border rounded-lg p-2"
            />
          )}

          <button
            onClick={valider}
            disabled={saving}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      )}

      {loading && <p className="text-gray-500">Chargement...</p>}

      {!loading && periodes.length === 0 && (
        <p className="text-gray-500 text-sm">Aucune période définie pour ce cycle.</p>
      )}

      {!loading && periodes.length > 0 && (
        <div className="space-y-2">
          {periodes.map((p, index) => (
            <div
              key={p.id}
              className={`border rounded-lg p-3 flex justify-between items-center ${p.est_pause ? 'bg-gray-100' : ''}`}
            >
              <div>
                <div className="font-medium">
                  {p.heure_debut.slice(0, 5)} - {p.heure_fin.slice(0, 5)}
                </div>
                {p.est_pause && (
                  <div className="text-xs text-gray-500 uppercase">{p.libelle}</div>
                )}
              </div>
              <div className="flex gap-2 items-center text-sm">
                <button onClick={() => deplacer(p.id, 'haut')} disabled={index === 0} className="text-gray-500 disabled:opacity-30">↑</button>
                <button onClick={() => deplacer(p.id, 'bas')} disabled={index === periodes.length - 1} className="text-gray-500 disabled:opacity-30">↓</button>
                <button onClick={() => ouvrirEdition(p)} className="text-blue-600">Modifier</button>
                <button onClick={() => supprimer(p.id)} className="text-red-600">Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
