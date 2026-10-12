'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { JOURS, JOURS_LABEL } from '@/lib/planning';

type LigneJour = { actif: boolean; fin: string };

const DEFAUT: Record<string, LigneJour> = Object.fromEntries(
  JOURS.map((j) => [j, { actif: j !== 'samedi', fin: '' }])
);

export default function JoursEcolePage() {
  const supabase = createClient();
  const [etablissementId, setEtablissementId] = useState('');
  const [lignes, setLignes] = useState<Record<string, LigneJour>>(DEFAUT);
  const [nbPeriodes, setNbPeriodes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const charger = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', userData.user.id)
        .single();
      if (!profil?.etablissement_id) return;
      setEtablissementId(profil.etablissement_id);

      const { data: param, error } = await supabase
        .from('planning_parametres')
        .select('jours')
        .eq('etablissement_id', profil.etablissement_id)
        .maybeSingle();
      if (error) {
        setMessage({ type: 'error', text: "Exécutez d'abord le script SQL « planning_v2 » dans Supabase." });
      } else if (param && Array.isArray(param.jours)) {
        const l: Record<string, LigneJour> = Object.fromEntries(JOURS.map((j) => [j, { actif: false, fin: '' }]));
        (param.jours as { jour: string; fin: string | null }[]).forEach((x) => {
          if (l[x.jour]) l[x.jour] = { actif: true, fin: x.fin ?? '' };
        });
        setLignes(l);
      }

      const { data: periodes } = await supabase
        .from('creneaux_horaires_types')
        .select('cycle, est_pause')
        .eq('etablissement_id', profil.etablissement_id);
      const n: Record<string, number> = {};
      (periodes || []).forEach((p: any) => {
        if (!p.est_pause) n[p.cycle] = (n[p.cycle] || 0) + 1;
      });
      setNbPeriodes(n);
      setLoading(false);
    };
    charger();
  }, [supabase]);

  const enregistrer = async () => {
    const jours = JOURS.filter((j) => lignes[j].actif).map((j) => ({ jour: j, fin: lignes[j].fin || null }));
    if (jours.length === 0) {
      setMessage({ type: 'error', text: 'Cochez au moins un jour de cours.' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('planning_parametres')
      .upsert({ etablissement_id: etablissementId, jours, updated_at: new Date().toISOString() }, { onConflict: 'etablissement_id' });
    setMessage(
      error
        ? { type: 'error', text: 'Erreur : ' + error.message }
        : { type: 'success', text: 'Jours de cours enregistrés.' }
    );
    setSaving(false);
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div>
        <Link href="/direction/planning" className="text-sm text-blue-600 underline">
          ← Planning
        </Link>
        <h1 className="text-2xl font-bold mt-1">Jours et heures de l'école</h1>
        <p className="text-sm text-gray-500">
          Choisissez les jours de cours. Les heures de cours et les pauses se règlent dans la grille horaire.
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="border rounded-xl bg-white divide-y">
        {JOURS.map((j) => (
          <div key={j} className="p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={lignes[j].actif}
                onChange={(e) => setLignes((prev) => ({ ...prev, [j]: { ...prev[j], actif: e.target.checked } }))}
              />
              {JOURS_LABEL[j]}
            </label>
            {lignes[j].actif && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Cours jusqu'à (facultatif)</span>
                <input
                  type="time"
                  value={lignes[j].fin}
                  onChange={(e) => setLignes((prev) => ({ ...prev, [j]: { ...prev[j], fin: e.target.value } }))}
                  className="border rounded-lg p-1 text-sm"
                />
                <span>Ex. mercredi 12:00</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={enregistrer}
        disabled={saving}
        className="w-full bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>

      <div className="border rounded-xl p-4 bg-gray-50 space-y-2 text-sm">
        <p className="font-semibold">Heures de cours et pauses</p>
        <p className="text-gray-600">
          Collège : {nbPeriodes['college'] || 0} période(s) de cours · Lycée : {nbPeriodes['lycee'] || 0} période(s)
        </p>
        <p className="text-xs text-gray-500">
          Exemple : 7h-8h, 8h-9h ... 11h-12h, pause 12h-14h, 14h-15h ... 17h-18h. Chaque école tape ses propres heures.
        </p>
        <Link href="/direction/emploi-du-temps/grille" className="text-blue-600 underline text-sm">
          Régler la grille horaire
        </Link>
      </div>
    </div>
  );
                                                                        }
          
