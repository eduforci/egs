'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Colonne = { matiere_id: string; composante: string; label: string };
type Candidat = {
  eleve_id: string;
  nom: string;
  prenom: string;
  notes: Record<string, string>; // clé = `${matiere_id}_${composante}`
};

const COMPOSANTE_LABEL: Record<string, string> = {
  unique: '',
  oral: 'Oral',
  ecrit: 'Écrit',
};

export default function SaisieNotesExamenPage() {
  const params = useParams();
  const examenId = params?.id as string;

  const [examenNom, setExamenNom] = useState('');
  const [colonnes, setColonnes] = useState<Colonne[]>([]);
  const [candidats, setCandidats] = useState<Candidat[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const supabase = createClient();

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: examen, error: examenError } = await supabase
        .from('examens')
        .select('nom')
        .eq('id', examenId)
        .single();

      if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
      setExamenNom(examen.nom);

      const { data: emData, error: emError } = await supabase
        .from('examens_matieres')
        .select('matiere_id, composante, matieres(nom)')
        .eq('examen_id', examenId);

      if (emError) throw new Error(`Erreur matières : ${emError.message}`);

      type Row = { matiere_id: string; composante: string; matieres: { nom: string } | { nom: string }[] | null };
      const cols: Colonne[] = ((emData ?? []) as unknown as Row[]).map((r) => {
        const m = Array.isArray(r.matieres) ? r.matieres[0] : r.matieres;
        const nomMat = m?.nom ?? 'Inconnue';
        const suffixe = COMPOSANTE_LABEL[r.composante];
        return {
          matiere_id: r.matiere_id,
          composante: r.composante,
          label: suffixe ? `${nomMat} (${suffixe})` : nomMat,
        };
      });
      cols.sort((a, b) => a.label.localeCompare(b.label));
      setColonnes(cols);

      const { data: classesExamen, error: classesError } = await supabase
        .from('examens_classes')
        .select('classe_id')
        .eq('examen_id', examenId);

      if (classesError) throw new Error(`Erreur classes : ${classesError.message}`);
      const classeIds = (classesExamen ?? []).map((c) => c.classe_id);

      const { data: elevesData, error: elevesError } = await supabase
        .from('eleves')
        .select('id')
        .in('classe_id', classeIds.length > 0 ? classeIds : ['00000000-0000-0000-0000-000000000000']);

      if (elevesError) throw new Error(`Erreur élèves : ${elevesError.message}`);

      const eleveIds = (elevesData ?? []).map((e) => e.id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, nom, prenom')
        .in('id', eleveIds.length > 0 ? eleveIds : ['00000000-0000-0000-0000-000000000000']);

      if (profilesError) throw new Error(`Erreur profils : ${profilesError.message}`);
      const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

      const { data: notesExistantes, error: notesError } = await supabase
        .from('notes_examen')
        .select('eleve_id, matiere_id, composante, valeur')
        .eq('examen_id', examenId);

      if (notesError) throw new Error(`Erreur notes : ${notesError.message}`);

      const notesMap = new Map<string, string>();
      (notesExistantes ?? []).forEach((n) => {
        notesMap.set(`${n.eleve_id}_${n.matiere_id}_${n.composante}`, String(n.valeur));
      });

      const liste: Candidat[] = eleveIds.map((id) => {
        const profil = profilesMap.get(id);
        const notes: Record<string, string> = {};
        cols.forEach((c) => {
          const cle = `${c.matiere_id}_${c.composante}`;
          notes[cle] = notesMap.get(`${id}_${c.matiere_id}_${c.composante}`) ?? '';
        });
        return { eleve_id: id, nom: profil?.nom ?? 'Inconnu', prenom: profil?.prenom ?? '', notes };
      });
      liste.sort((a, b) => a.nom.localeCompare(b.nom));
      setCandidats(liste);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [examenId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  function modifierNote(eleveId: string, cle: string, valeur: string) {
    setCandidats((prev) =>
      prev.map((c) => (c.eleve_id === eleveId ? { ...c, notes: { ...c.notes, [cle]: valeur } } : c))
    );
  }

  async function enregistrerTout() {
    setSaving(true);
    setError(null);
    setSucces(null);

    try {
      const lignes: { examen_id: string; eleve_id: string; matiere_id: string; composante: string; valeur: number }[] = [];

      for (const candidat of candidats) {
        for (const col of colonnes) {
          const cle = `${col.matiere_id}_${col.composante}`;
          const val = candidat.notes[cle];
          if (val === undefined || val.trim() === '') continue;
          const num = parseFloat(val.replace(',', '.'));
          if (isNaN(num) || num < 0 || num > 20) {
            throw new Error(`Note invalide pour ${candidat.nom} ${candidat.prenom} en ${col.label} : doit être entre 0 et 20.`);
          }
          lignes.push({
            examen_id: examenId,
            eleve_id: candidat.eleve_id,
            matiere_id: col.matiere_id,
            composante: col.composante,
            valeur: num,
          });
        }
      }

      if (lignes.length === 0) {
        setSaving(false);
        setError('Aucune note à enregistrer.');
        return;
      }

      const { error: upsertError } = await supabase
        .from('notes_examen')
        .upsert(lignes, { onConflict: 'examen_id,eleve_id,matiere_id,composante' });

      if (upsertError) throw new Error(`Erreur enregistrement : ${upsertError.message}`);

      setSucces(`${lignes.length} note(s) enregistrée(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  if (colonnes.length === 0) {
    return (
      <main className="p-4 md:p-6 max-w-2xl mx-auto">
        <p className="text-sm text-gray-500">
          Aucune matière n'a encore été ajoutée à cet examen. Retourne sur la fiche de l'examen.
        </p>
      </main>
    );
  }

  if (candidats.length === 0) {
    return (
      <main className="p-4 md:p-6 max-w-2xl mx-auto">
        <p className="text-sm text-gray-500">
          Aucun candidat — ajoute des classes participantes sur la fiche de l'examen.
        </p>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Notes — {examenNom}</h1>
      <p className="text-sm text-gray-500 mb-4">{candidats.length} candidat(s)</p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          {error}
        </div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">
          {succes}
        </div>
      )}

      <div className="overflow-x-auto border rounded-lg mb-4">
        <table className="text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2 sticky left-0 bg-gray-100">Candidat</th>
              {colonnes.map((c) => (
                <th key={`${c.matiere_id}_${c.composante}`} className="px-2 py-2 w-24">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidats.map((c) => (
              <tr key={c.eleve_id} className="border-t">
                <td className="px-3 py-1.5 sticky left-0 bg-white whitespace-nowrap">
                  {c.nom} {c.prenom}
                </td>
                {colonnes.map((col) => {
                  const cle = `${col.matiere_id}_${col.composante}`;
                  return (
                    <td key={cle} className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={c.notes[cle] ?? ''}
                        onChange={(e) => modifierNote(c.eleve_id, cle, e.target.value)}
                        className="w-14 border rounded px-1 py-1 text-center"
                        placeholder="-"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={enregistrerTout}
        disabled={saving}
        className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
      >
        {saving ? 'Enregistrement...' : 'Enregistrer toutes les notes'}
      </button>
    </main>
  );
                                }
      
