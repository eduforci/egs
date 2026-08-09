'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Classe = { id: string; nom: string };
type AbsenceLigne = {
  id: string;
  date: string;
  type: string;
  duree_minutes: number | null;
  justifie: boolean;
  motif: string | null;
  eleve_id: string;
  eleve_nom: string;
  eleve_prenom: string;
  classe_nom: string;
};

export default function AbsencesDirecteurPage() {
  const supabase = createClient();

  const [classes, setClasses] = useState<Classe[]>([]);
  const [filtreClasse, setFiltreClasse] = useState('');
  const [filtreJustifie, setFiltreJustifie] = useState<'tous' | 'justifie' | 'non_justifie'>('tous');
  const [absences, setAbsences] = useState<AbsenceLigne[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur('');

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

    const { data: classesData } = await supabase
      .from('classes')
      .select('id, nom')
      .eq('etablissement_id', profil.etablissement_id)
      .order('nom');
    setClasses(classesData || []);

    let query = supabase
      .from('absences')
      .select('id, date, type, duree_minutes, justifie, motif, eleve_id, classe_id, classes(nom)')
      .eq('etablissement_id', profil.etablissement_id)
      .order('date', { ascending: false });

    if (filtreClasse) query = query.eq('classe_id', filtreClasse);
    if (filtreJustifie === 'justifie') query = query.eq('justifie', true);
    if (filtreJustifie === 'non_justifie') query = query.eq('justifie', false);

    const { data: absencesData, error } = await query;

    if (error) {
      setErreur(error.message);
      setLoading(false);
      return;
    }

    const idsEleves = Array.from(new Set((absencesData || []).map((a) => a.eleve_id)));
    const { data: profs } = idsEleves.length > 0
      ? await supabase.from('profiles').select('id, nom, prenom').in('id', idsEleves)
      : { data: [] };
    const profsParId = new Map((profs || []).map((p) => [p.id, p]));

    const liste: AbsenceLigne[] = (absencesData || []).map((a: any) => {
      const p = profsParId.get(a.eleve_id);
      return {
        id: a.id,
        date: a.date,
        type: a.type,
        duree_minutes: a.duree_minutes,
        justifie: a.justifie,
        motif: a.motif,
        eleve_id: a.eleve_id,
        eleve_nom: p?.nom || '',
        eleve_prenom: p?.prenom || '',
        classe_nom: a.classes?.nom || '',
      };
    });

    setAbsences(liste);
    setLoading(false);
  }, [supabase, filtreClasse, filtreJustifie]);

  useEffect(() => {
    charger();
  }, [charger]);

  const totalAbsences = absences.filter((a) => a.type === 'absence').length;
  const totalRetards = absences.filter((a) => a.type === 'retard').length;
  const nonJustifiees = absences.filter((a) => !a.justifie).length;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Absences</h1>

      <div className="grid grid-cols-3 gap-2">
        <div className="border rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{totalAbsences}</div>
          <div className="text-xs text-gray-500">Absences</div>
        </div>
        <div className="border rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{totalRetards}</div>
          <div className="text-xs text-gray-500">Retards</div>
        </div>
        <div className="border rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{nonJustifiees}</div>
          <div className="text-xs text-gray-500">Non justifiées</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          value={filtreClasse}
          onChange={(e) => setFiltreClasse(e.target.value)}
          className="border rounded-lg p-2 text-sm"
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>

        <select
          value={filtreJustifie}
          onChange={(e) => setFiltreJustifie(e.target.value as any)}
          className="border rounded-lg p-2 text-sm"
        >
          <option value="tous">Toutes</option>
          <option value="justifie">Justifiées</option>
          <option value="non_justifie">Non justifiées</option>
        </select>
      </div>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Chargement...</p>}

      {!loading && absences.length === 0 && (
        <p className="text-gray-500 text-sm">Aucune absence trouvée.</p>
      )}

      {!loading && absences.length > 0 && (
        <div className="space-y-2">
          {absences.map((a) => (
            <div key={a.id} className="border rounded-lg p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-sm">{a.eleve_nom} {a.eleve_prenom}</div>
                  <div className="text-xs text-gray-500">{a.classe_nom}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${a.justifie ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {a.justifie ? 'Justifiée' : 'Non justifiée'}
                </span>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {new Date(a.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                {' — '}
                {a.type === 'absence' ? 'Absence' : `Retard (${a.duree_minutes ?? '?'} min)`}
                {a.motif ? ` — ${a.motif}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
      }
