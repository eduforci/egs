'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Classe = { id: string; nom: string };
type Eleve = { id: string; nom: string; prenoms: string; matricule: string };
type StatutEleve = 'present' | 'absence' | 'retard';

type LigneAppel = {
  eleve_id: string;
  statut: StatutEleve;
  duree_minutes: number | null;
  justifie: boolean;
  motif: string;
};

export default function CahierAppelPage() {
  const supabase = createClient();

  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeId, setClasseId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [lignes, setLignes] = useState<Record<string, LigneAppel>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Charger les classes affectées à l'enseignant
  useEffect(() => {
    const loadClasses = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data, error } = await supabase
        .from('affectations_enseignant')
        .select('classe_id, classes(id, nom)')
        .eq('enseignant_id', userData.user.id);

      if (error) {
        setMessage({ type: 'error', text: "Erreur chargement classes: " + error.message });
        return;
      }

      const classesUniques = new Map<string, Classe>();
      (data || []).forEach((row: any) => {
        if (row.classes) classesUniques.set(row.classes.id, row.classes);
      });
      setClasses(Array.from(classesUniques.values()));
    };
    loadClasses();
  }, [supabase]);

  // Charger les élèves de la classe sélectionnée + absences déjà saisies pour cette date
  const chargerEleves = useCallback(async () => {
    if (!classeId || !date) return;
    setLoading(true);
    setMessage(null);

    const { data: elevesData, error: elevesError } = await supabase
      .from('eleves')
      .select('id, nom, prenoms, matricule')
      .eq('classe_id', classeId)
      .order('nom', { ascending: true });

    if (elevesError) {
      setMessage({ type: 'error', text: "Erreur chargement élèves: " + elevesError.message });
      setLoading(false);
      return;
    }

    const { data: absencesData, error: absencesError } = await supabase
      .from('absences')
      .select('eleve_id, type, duree_minutes, justifie, motif')
      .eq('classe_id', classeId)
      .eq('date', date)
      .is('matiere_id', null);

    if (absencesError) {
      setMessage({ type: 'error', text: "Erreur chargement absences: " + absencesError.message });
      setLoading(false);
      return;
    }

    const absencesParEleve = new Map(
      (absencesData || []).map((a) => [a.eleve_id, a])
    );

    const nouvellesLignes: Record<string, LigneAppel> = {};
    (elevesData || []).forEach((eleve) => {
      const abs = absencesParEleve.get(eleve.id);
      nouvellesLignes[eleve.id] = {
        eleve_id: eleve.id,
        statut: abs ? (abs.type as StatutEleve) : 'present',
        duree_minutes: abs?.duree_minutes ?? null,
        justifie: abs?.justifie ?? false,
        motif: abs?.motif ?? '',
      };
    });

    setEleves(elevesData || []);
    setLignes(nouvellesLignes);
    setLoading(false);
  }, [classeId, date, supabase]);

  useEffect(() => {
    chargerEleves();
  }, [chargerEleves]);

  const majLigne = (eleveId: string, patch: Partial<LigneAppel>) => {
    setLignes((prev) => ({
      ...prev,
      [eleveId]: { ...prev[eleveId], ...patch },
    }));
  };

  const enregistrer = async () => {
    setSaving(true);
    setMessage(null);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setMessage({ type: 'error', text: 'Session expirée, reconnectez-vous.' });
      setSaving(false);
      return;
    }

    // Récupérer etablissement_id et trimestre actif via l'élève / classe
    const { data: classeInfo } = await supabase
      .from('classes')
      .select('etablissement_id')
      .eq('id', classeId)
      .single();

    const etablissementId = classeInfo?.etablissement_id;

    const { data: trimestreActif } = await supabase
      .from('trimestres')
      .select('id')
      .eq('etablissement_id', etablissementId)
      .lte('date_debut', date)
      .gte('date_fin', date)
      .maybeSingle();

    // 1. Supprimer les anciennes lignes journée complète pour cette classe/date
    await supabase
      .from('absences')
      .delete()
      .eq('classe_id', classeId)
      .eq('date', date)
      .is('matiere_id', null);

    // 2. Réinsérer uniquement les absents/retards
    const aInserer = Object.values(lignes)
      .filter((l) => l.statut !== 'present')
      .map((l) => ({
        eleve_id: l.eleve_id,
        classe_id: classeId,
        etablissement_id: etablissementId,
        trimestre_id: trimestreActif?.id ?? null,
        matiere_id: null,
        date,
        type: l.statut,
        duree_minutes: l.statut === 'retard' ? l.duree_minutes : null,
        justifie: l.justifie,
        motif: l.motif || null,
        enseignant_id: userData.user.id,
      }));

    if (aInserer.length > 0) {
      const { error: insertError } = await supabase.from('absences').insert(aInserer);
      if (insertError) {
        setMessage({ type: 'error', text: "Erreur enregistrement: " + insertError.message });
        setSaving(false);
        return;
      }
    }

    setMessage({ type: 'success', text: `Appel enregistré (${aInserer.length} absence(s)/retard(s)).` });
    setSaving(false);
  };

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Cahier d'appel</h1>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Classe</label>
          <select
            value={classeId}
            onChange={(e) => setClasseId(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="">-- Sélectionner une classe --</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {loading && <p className="text-gray-500">Chargement...</p>}

      {!loading && classeId && eleves.length === 0 && (
        <p className="text-gray-500">Aucun élève dans cette classe.</p>
      )}

      {!loading && eleves.length > 0 && (
        <div className="space-y-3">
          {eleves.map((eleve) => {
            const ligne = lignes[eleve.id];
            if (!ligne) return null;
            return (
              <div key={eleve.id} className="border rounded-lg p-3 space-y-2">
                <div className="font-medium">{eleve.nom} {eleve.prenoms}</div>
                <div className="text-xs text-gray-500">{eleve.matricule}</div>

                <div className="flex gap-2">
                  {(['present', 'absence', 'retard'] as StatutEleve[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => majLigne(eleve.id, { statut: s })}
                      className={`flex-1 py-1.5 rounded-md text-sm font-medium border ${
                        ligne.statut === s
                          ? s === 'present'
                            ? 'bg-green-600 text-white border-green-600'
                            : s === 'absence'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white text-gray-600 border-gray-300'
                      }`}
                    >
                      {s === 'present' ? 'Présent' : s === 'absence' ? 'Absent' : 'Retard'}
                    </button>
                  ))}
                </div>

                {ligne.statut === 'retard' && (
                  <input
                    type="number"
                    placeholder="Durée du retard (minutes)"
                    value={ligne.duree_minutes ?? ''}
                    onChange={(e) => majLigne(eleve.id, { duree_minutes: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full border rounded-md p-1.5 text-sm"
                  />
                )}

                {ligne.statut !== 'present' && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ligne.justifie}
                        onChange={(e) => majLigne(eleve.id, { justifie: e.target.checked })}
                      />
                      Justifié
                    </label>
                    <input
                      type="text"
                      placeholder="Motif (optionnel)"
                      value={ligne.motif}
                      onChange={(e) => majLigne(eleve.id, { motif: e.target.value })}
                      className="w-full border rounded-md p-1.5 text-sm"
                    />
                  </>
                )}
              </div>
            );
          })}

          <button
            onClick={enregistrer}
            disabled={saving}
            className="w-full bg-gray-800 text-white py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer les notes de présence'}
          </button>
        </div>
      )}
    </div>
  );
        }
