'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  JOURS,
  JOURS_LABEL,
  FENETRES,
  dureeHeures,
  formaterHeures,
  modeDuJour,
  type Disponibilite,
  type ModeJour,
} from '@/lib/planning';

const DISCIPLINES: { cle: string; label: string }[] = [
  { cle: 'anglais', label: 'Anglais' },
  { cle: 'dessin', label: 'Dessin / Éd. musicale' },
  { cle: 'edhc', label: 'EDHC' },
  { cle: 'eps', label: 'EPS' },
  { cle: 'francais', label: 'Français' },
  { cle: 'hg', label: 'Histoire-Géo' },
  { cle: 'lv2', label: 'LV2 (All./Esp.)' },
  { cle: 'maths', label: 'Mathématiques' },
  { cle: 'philo', label: 'Philosophie' },
  { cle: 'pc', label: 'Physique-Chimie' },
  { cle: 'svt', label: 'SVT' },
];

type Prof = {
  id: string;
  nom: string;
  prenom: string;
  disciplines: string[];
  cycleProf: string;
  vacataire: boolean;
  maxHeures: string;
  dispos: Disponibilite[];
  chargeHeures: number;
};

const MODES: { value: ModeJour; label: string }[] = [
  { value: 'libre', label: 'Toute la journée' },
  { value: 'matin', label: 'Matin' },
  { value: 'apres_midi', label: 'Après-midi' },
  { value: 'indisponible', label: 'Indisponible' },
];

export default function ProfesseursPlanningPage() {
  const supabase = createClient();
  const [etablissementId, setEtablissementId] = useState('');
  const [profs, setProfs] = useState<Prof[]>([]);
  const [loading, setLoading] = useState(true);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<string, ModeJour>>({});
  const [vacataire, setVacataire] = useState(false);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [cycleProf, setCycleProf] = useState('');
  const [maxHeures, setMaxHeures] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const charger = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;
    const { data: profil } = await supabase
      .from('profiles')
      .select('etablissement_id')
      .eq('id', userData.user.id)
      .single();
    if (!profil?.etablissement_id) return;
    setEtablissementId(profil.etablissement_id);

    const { data: enseignants } = await supabase
      .from('profiles')
      .select('id, nom, prenom')
      .eq('etablissement_id', profil.etablissement_id)
      .eq('role', 'enseignant')
      .order('nom');

    const reponsePlanning = await supabase
      .from('enseignants_planning')
      .select('enseignant_id, vacataire, max_heures_semaine, disciplines, cycle_prof')
      .eq('etablissement_id', profil.etablissement_id);
    let planning: any[] | null = reponsePlanning.data as any[] | null;
    let erreurPlanning: any = reponsePlanning.error;
    if (erreurPlanning) {
      const ancien = await supabase
        .from('enseignants_planning')
        .select('enseignant_id, vacataire, max_heures_semaine')
        .eq('etablissement_id', profil.etablissement_id);
      planning = ancien.data as any[] | null;
      erreurPlanning = ancien.error;
    }
    if (erreurPlanning) {
      setMessage({
        type: 'error',
        text: "Exécutez d'abord le script SQL « planning_v1 » dans Supabase (" + erreurPlanning.message + ").",
      });
    }

    const { data: dispos } = await supabase
      .from('enseignants_disponibilites')
      .select('enseignant_id, jour, heure_debut, heure_fin')
      .eq('etablissement_id', profil.etablissement_id);

    const { data: creneaux } = await supabase
      .from('emploi_du_temps')
      .select('enseignant_id, heure_debut, heure_fin')
      .eq('etablissement_id', profil.etablissement_id);

    const planningParId = new Map((planning || []).map((p: any) => [p.enseignant_id, p]));
    const charge = new Map<string, number>();
    (creneaux || []).forEach((c: any) => {
      if (!c.enseignant_id) return;
      charge.set(c.enseignant_id, (charge.get(c.enseignant_id) || 0) + dureeHeures(c.heure_debut, c.heure_fin));
    });

    setProfs(
      (enseignants || []).map((e: any) => {
        const p: any = planningParId.get(e.id);
        return {
          id: e.id,
          nom: e.nom || '',
          prenom: e.prenom || '',
          disciplines: Array.isArray(p?.disciplines) ? p.disciplines : [],
          cycleProf: p?.cycle_prof ?? '',
          vacataire: p?.vacataire === true,
          maxHeures: p?.max_heures_semaine === null || p?.max_heures_semaine === undefined ? '' : String(p.max_heures_semaine),
          dispos: (dispos || []).filter((d: any) => d.enseignant_id === e.id),
          chargeHeures: charge.get(e.id) || 0,
        };
      })
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const ouvrir = (p: Prof) => {
    if (ouvert === p.id) {
      setOuvert(null);
      return;
    }
    setOuvert(p.id);
    setVacataire(p.vacataire);
    setDisciplines(p.disciplines);
    setCycleProf(p.cycleProf);
    setMaxHeures(p.maxHeures);
    const m: Record<string, ModeJour> = {};
    JOURS.forEach((j) => (m[j] = modeDuJour(p.dispos, j)));
    setModes(m);
    setMessage(null);
  };

  const enregistrer = async (p: Prof) => {
    const max = maxHeures.trim() === '' ? null : parseFloat(maxHeures.replace(',', '.'));
    if (max !== null && (isNaN(max) || max < 0 || max > 60)) {
      setMessage({ type: 'error', text: "Le plafond d'heures doit être un nombre entre 0 et 60." });
      return;
    }
    const tousIndisponibles = JOURS.every((j) => modes[j] === 'indisponible');
    if (tousIndisponibles) {
      setMessage({ type: 'error', text: 'Au moins un jour doit être disponible.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    const { error: erreurPlanning } = await supabase.from('enseignants_planning').upsert(
      {
        enseignant_id: p.id,
        etablissement_id: etablissementId,
        vacataire,
        disciplines,
        cycle_prof: cycleProf || null,
        max_heures_semaine: max,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'enseignant_id' }
    );
    if (erreurPlanning) {
      setMessage({ type: 'error', text: 'Erreur : ' + erreurPlanning.message });
      setSaving(false);
      return;
    }

    // Disponibilités : tout libre = aucune ligne ; sinon une plage par jour disponible.
    const toutLibre = JOURS.every((j) => modes[j] === 'libre');
    const { error: erreurSuppression } = await supabase
      .from('enseignants_disponibilites')
      .delete()
      .eq('enseignant_id', p.id);
    if (erreurSuppression) {
      setMessage({ type: 'error', text: 'Erreur : ' + erreurSuppression.message });
      setSaving(false);
      return;
    }

    if (!toutLibre) {
      const lignes = JOURS.filter((j) => modes[j] !== 'indisponible').map((j) => {
        const f = FENETRES[modes[j] as Exclude<ModeJour, 'indisponible'>];
        return {
          enseignant_id: p.id,
          etablissement_id: etablissementId,
          jour: j,
          heure_debut: f.debut,
          heure_fin: f.fin,
        };
      });
      const { error: erreurInsertion } = await supabase.from('enseignants_disponibilites').insert(lignes);
      if (erreurInsertion) {
        setMessage({ type: 'error', text: 'Erreur : ' + erreurInsertion.message });
        setSaving(false);
        return;
      }
    }

    setMessage({ type: 'success', text: 'Enregistré.' });
    setSaving(false);
    setOuvert(null);
    charger();
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  const nbVacataires = profs.filter((p) => p.vacataire).length;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <Link href="/direction/planning" className="text-sm text-blue-600 underline">
          ← Planning
        </Link>
        <h1 className="text-2xl font-bold mt-1">Professeurs et vacataires</h1>
        <p className="text-sm text-gray-500">
          {profs.length} professeur(s) dont {nbVacataires} vacataire(s). Touchez un nom pour régler ses
          disponibilités.
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

      {profs.length === 0 && <p className="text-sm text-gray-500">Aucun enseignant dans cette école.</p>}

      <div className="space-y-2">
        {profs.map((p) => (
          <div key={p.id} className="border rounded-xl bg-white">
            <button onClick={() => ouvrir(p)} className="w-full text-left p-3 flex justify-between items-center gap-2">
              <div>
                <div className="font-medium">
                  {p.nom} {p.prenom}
                  {p.vacataire && (
                    <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                      Vacataire
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  Charge : {formaterHeures(p.chargeHeures)}
                  {p.maxHeures ? ` sur ${p.maxHeures} h maximum` : ''}
                  {p.dispos.length > 0 ? ' · disponibilités limitées' : ''}
                </div>
              </div>
              <span className="text-gray-400">{ouvert === p.id ? '▲' : '▼'}</span>
            </button>

            {ouvert === p.id && (
              <div className="border-t p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={vacataire} onChange={(e) => setVacataire(e.target.checked)} />
                  Ce professeur est vacataire
                </label>

                <div>
                  <p className="text-xs text-gray-500 mb-1">Discipline(s) enseignée(s)</p>
                  <div className="grid grid-cols-2 gap-1">
                    {DISCIPLINES.map((d) => (
                      <label key={d.cle} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={disciplines.includes(d.cle)}
                          onChange={() =>
                            setDisciplines((prev) => (prev.includes(d.cle) ? prev.filter((x) => x !== d.cle) : [...prev, d.cle]))
                          }
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cycle où il enseigne</label>
                  <select
                    value={cycleProf}
                    onChange={(e) => setCycleProf(e.target.value)}
                    className="w-full border rounded-lg p-1.5 text-sm bg-white"
                  >
                    <option value="">Collège et lycée</option>
                    <option value="college">Collège seulement (21 h par semaine)</option>
                    <option value="lycee">Lycée seulement (18 h par semaine)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Maximum d'heures par semaine (facultatif, surtout pour un vacataire)</label>
                  <input
                    value={maxHeures}
                    onChange={(e) => setMaxHeures(e.target.value)}
                    inputMode="decimal"
                    placeholder="Ex : 12"
                    className="w-28 border rounded-lg p-1.5 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500">Disponibilité par jour</p>
                  {JOURS.map((j) => (
                    <div key={j} className="flex items-center justify-between gap-2">
                      <span className="text-sm w-24">{JOURS_LABEL[j]}</span>
                      <select
                        value={modes[j] || 'libre'}
                        onChange={(e) => setModes((prev) => ({ ...prev, [j]: e.target.value as ModeJour }))}
                        className="flex-1 border rounded-lg p-1.5 text-sm bg-white"
                      >
                        {MODES.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => enregistrer(p)}
                  disabled={saving}
                  className="w-full bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
      }
          
