'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const CYCLES = [
  { value: 'maternelle', label: 'Maternelle' },
  { value: 'primaire', label: 'Primaire' },
  { value: 'college', label: 'Collège' },
  { value: 'lycee', label: 'Lycée' },
  { value: 'superieur', label: 'Supérieur' },
];

const TYPES = [
  { value: 'general', label: 'Enseignement général' },
  { value: 'technique', label: 'Enseignement technique' },
  { value: 'professionnel', label: 'Enseignement professionnel' },
];

type Compte = { cycle: string; type: string; nb: number };

export default function StructureEcolePage() {
  const supabase = createClient();
  const [etablissementId, setEtablissementId] = useState('');
  const [nomEcole, setNomEcole] = useState('');
  const [cycles, setCycles] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>(['general']);
  const [classesParCycle, setClassesParCycle] = useState<Record<string, number>>({});
  const [classesParType, setClassesParType] = useState<Record<string, number>>({});
  const [installe, setInstalle] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const charger = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setLoading(false);
      return;
    }
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

    const { data: etab } = await supabase
      .from('etablissements')
      .select('nom, annee_scolaire_active')
      .eq('id', profil.etablissement_id)
      .single();
    setNomEcole(etab?.nom || '');

    // Structure : lecture séparée pour ne rien casser si le script SQL n'est pas encore installé
    const { data: structure, error: erreurStructure } = await supabase
      .from('etablissements')
      .select('cycles_actifs, types_enseignement')
      .eq('id', profil.etablissement_id)
      .single();
    if (erreurStructure) {
      setInstalle(false);
    } else {
      setInstalle(true);
      setCycles((structure as any)?.cycles_actifs ?? []);
      const t = (structure as any)?.types_enseignement;
      setTypes(Array.isArray(t) && t.length > 0 ? t : ['general']);
    }

    // Nombre de classes (année active) par cycle et par type
    const { data: classes } = await supabase
      .from('classes')
      .select('cycle')
      .eq('etablissement_id', profil.etablissement_id)
      .eq('annee_scolaire', etab?.annee_scolaire_active ?? '');
    const parCycle: Record<string, number> = {};
    (classes || []).forEach((c: any) => {
      if (c.cycle) parCycle[c.cycle] = (parCycle[c.cycle] || 0) + 1;
    });
    setClassesParCycle(parCycle);

    const { data: classesTypes } = await supabase
      .from('classes')
      .select('type_enseignement')
      .eq('etablissement_id', profil.etablissement_id)
      .eq('annee_scolaire', etab?.annee_scolaire_active ?? '');
    const parType: Record<string, number> = {};
    (classesTypes || []).forEach((c: any) => {
      const t = c.type_enseignement || 'general';
      parType[t] = (parType[t] || 0) + 1;
    });
    setClassesParType(parType);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const basculer = (liste: string[], valeur: string): string[] =>
    liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];

  const enregistrer = async () => {
    setMessage(null);
    if (cycles.length === 0) {
      setMessage({ type: 'error', text: 'Choisissez au moins un cycle.' });
      return;
    }
    if (types.length === 0) {
      setMessage({ type: 'error', text: "Choisissez au moins un type d'enseignement." });
      return;
    }
    // On ne retire pas un cycle ou un type qui a encore des classes.
    const cyclesUtilises = Object.keys(classesParCycle).filter((c) => classesParCycle[c] > 0 && !cycles.includes(c));
    if (cyclesUtilises.length > 0) {
      const libelles = cyclesUtilises.map((c) => CYCLES.find((x) => x.value === c)?.label ?? c).join(', ');
      setMessage({
        type: 'error',
        text: `Impossible de retirer : ${libelles} (des classes existent encore dans ce cycle).`,
      });
      return;
    }
    const typesUtilises = Object.keys(classesParType).filter((t) => classesParType[t] > 0 && !types.includes(t));
    if (typesUtilises.length > 0) {
      const libelles = typesUtilises.map((t) => TYPES.find((x) => x.value === t)?.label ?? t).join(', ');
      setMessage({
        type: 'error',
        text: `Impossible de retirer : ${libelles} (des classes existent encore dans ce type).`,
      });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('etablissements')
      .update({ cycles_actifs: cycles, types_enseignement: types })
      .eq('id', etablissementId);
    setSaving(false);
    if (error) {
      setMessage({ type: 'error', text: `Enregistrement impossible : ${error.message}` });
    } else {
      setMessage({ type: 'success', text: "Structure de l'école enregistrée." });
    }
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  const estGroupe = cycles.length > 1 || types.length > 1;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Structure de l'école</h1>
        <p className="text-sm text-gray-500">
          Indiquez ce que {nomEcole || "l'école"} enseigne : un seul cycle, ou plusieurs (groupe scolaire).
        </p>
      </div>

      {!installe && (
        <div className="p-3 rounded-lg text-sm bg-orange-50 text-orange-800 border border-orange-200">
          Le script SQL « groupe_scolaire » n'est pas encore installé dans Supabase. Exécutez-le d'abord.
        </div>
      )}

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

      <div className="border rounded-xl p-4 bg-white space-y-3">
        <p className="font-semibold text-sm">Cycles enseignés</p>
        {CYCLES.map((c) => (
          <label key={c.value} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={cycles.includes(c.value)}
              onChange={() => setCycles((prev) => basculer(prev, c.value))}
              className="h-4 w-4"
            />
            <span className="flex-1">{c.label}</span>
            {classesParCycle[c.value] > 0 && (
              <span className="text-xs text-gray-500">{classesParCycle[c.value]} classe(s)</span>
            )}
          </label>
        ))}
      </div>

      <div className="border rounded-xl p-4 bg-white space-y-3">
        <p className="font-semibold text-sm">Types d'enseignement</p>
        {TYPES.map((t) => (
          <label key={t.value} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={types.includes(t.value)}
              onChange={() => setTypes((prev) => basculer(prev, t.value))}
              className="h-4 w-4"
            />
            <span className="flex-1">{t.label}</span>
            {classesParType[t.value] > 0 && (
              <span className="text-xs text-gray-500">{classesParType[t.value]} classe(s)</span>
            )}
          </label>
        ))}
      </div>

      {estGroupe && (
        <p className="text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-3">
          Votre école est un <strong>groupe scolaire</strong> : à la création d'une classe, vous choisirez son
          cycle{types.length > 1 ? " et son type d'enseignement" : ''}.
        </p>
      )}

      <button
        onClick={enregistrer}
        disabled={saving || !installe}
        className="w-full bg-black text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </div>
  );
}
