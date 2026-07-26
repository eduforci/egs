'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type EleveLigne = {
  eleve_id: string;
  nom: string;
  prenom: string;
  matricule: string;
  valeur: string; // texte pour permettre un champ vide pendant la saisie
  note_id: string | null; // id de la note existante, pour update au lieu d'insert
};

export default function SaisieConduitePage() {
  const params = useParams();
  const classeId = params?.id as string;

  const [trimestre, setTrimestre] = useState(1);
  const [classeNom, setClasseNom] = useState('');
  const [matiereConduiteId, setMatiereConduiteId] = useState<string | null>(null);
  const [anneeScolaire, setAnneeScolaire] = useState('');
  const [eleves, setEleves] = useState<EleveLigne[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const supabase = createClient();

  const charger = useCallback(async () => {
    if (!classeId) return;
    setLoading(true);
    setError(null);
    setSucces(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié.');

      const { data: classeData, error: classeError } = await supabase
        .from('classes')
        .select('nom, etablissement_id')
        .eq('id', classeId)
        .single();

      if (classeError) throw new Error(`Erreur classe : ${classeError.message}`);
      setClasseNom(classeData.nom);

      const { data: etabData, error: etabError } = await supabase
        .from('etablissements')
        .select('annee_scolaire_active')
        .eq('id', classeData.etablissement_id)
        .single();

      if (etabError) throw new Error(`Erreur établissement : ${etabError.message}`);
      setAnneeScolaire(etabData.annee_scolaire_active);

      const { data: matiereData, error: matiereError } = await supabase
        .from('matieres')
        .select('id')
        .eq('etablissement_id', classeData.etablissement_id)
        .eq('nom', 'Conduite')
        .single();

      if (matiereError) throw new Error(`Matière "Conduite" introuvable pour cet établissement.`);
      setMatiereConduiteId(matiereData.id);

      const { data: elevesData, error: elevesError } = await supabase
        .from('eleves')
        .select('id, matricule, profiles!inner(nom, prenom)')
        .eq('classe_id', classeId);

      if (elevesError) throw new Error(`Erreur élèves : ${elevesError.message}`);

      const { data: notesExistantes, error: notesError } = await supabase
        .from('notes')
        .select('id, eleve_id, valeur')
        .eq('classe_id', classeId)
        .eq('matiere_id', matiereData.id)
        .eq('trimestre', trimestre)
        .eq('annee_scolaire', etabData.annee_scolaire_active);

      if (notesError) throw new Error(`Erreur notes existantes : ${notesError.message}`);

      const notesMap = new Map((notesExistantes ?? []).map((n) => [n.eleve_id, n]));

      type EleveRow = { id: string; matricule: string; profiles: { nom: string; prenom: string } | { nom: string; prenom: string }[] };
      const lignes: EleveLigne[] = ((elevesData ?? []) as unknown as EleveRow[]).map((e) => {
        const profil = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
        const noteExistante = notesMap.get(e.id);
        return {
          eleve_id: e.id,
          nom: profil?.nom ?? '',
          prenom: profil?.prenom ?? '',
          matricule: e.matricule,
          valeur: noteExistante ? String(noteExistante.valeur) : '',
          note_id: noteExistante ? noteExistante.id : null,
        };
      });

      lignes.sort((a, b) => a.nom.localeCompare(b.nom));
      setEleves(lignes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [classeId, trimestre, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  function modifierValeur(eleveId: string, valeur: string) {
    setEleves((prev) =>
      prev.map((e) => (e.eleve_id === eleveId ? { ...e, valeur } : e))
    );
  }

  async function enregistrerTout() {
    if (!matiereConduiteId) return;
    setSaving(true);
    setError(null);
    setSucces(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié.');

      for (const eleve of eleves) {
        if (eleve.valeur.trim() === '') continue;

        const valeurNum = parseFloat(eleve.valeur.replace(',', '.'));
        if (isNaN(valeurNum) || valeurNum < 0 || valeurNum > 20) {
          throw new Error(`Note invalide pour ${eleve.nom} ${eleve.prenom} : doit être entre 0 et 20.`);
        }

        if (eleve.note_id) {
          const { error: updateError } = await supabase
            .from('notes')
            .update({ valeur: valeurNum })
            .eq('id', eleve.note_id);
          if (updateError) throw new Error(`Erreur mise à jour ${eleve.nom} : ${updateError.message}`);
        } else {
          const { error: insertError } = await supabase.from('notes').insert({
            eleve_id: eleve.eleve_id,
            matiere_id: matiereConduiteId,
            classe_id: classeId,
            enseignant_id: user.id,
            type: 'devoir',
            valeur: valeurNum,
            coefficient: 1,
            trimestre,
            annee_scolaire: anneeScolaire,
          });
          if (insertError) throw new Error(`Erreur enregistrement ${eleve.nom} : ${insertError.message}`);
        }
      }

      setSucces('Notes de conduite enregistrées avec succès.');
      charger();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Conduite — {classeNom}</h1>
      <p className="text-sm text-gray-500 mb-4">Trimestre {trimestre} · {anneeScolaire}</p>

      <div className="mb-4">
        <label className="block text-xs text-gray-600 mb-1">Trimestre</label>
        <select
          value={trimestre}
          onChange={(e) => setTrimestre(Number(e.target.value))}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value={1}>Trimestre 1</option>
          <option value={2}>Trimestre 2</option>
          <option value={3}>Trimestre 3</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">
          {succes}
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}

      {!loading && eleves.length === 0 && !error && (
        <p className="text-sm text-gray-500">Aucun élève dans cette classe.</p>
      )}

      {!loading && eleves.length > 0 && (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">Élève</th>
                  <th className="text-left px-3 py-2 w-24">Note /20</th>
                </tr>
              </thead>
              <tbody>
                {eleves.map((e) => (
                  <tr key={e.eleve_id} className="border-t">
                    <td className="px-3 py-2">{e.nom} {e.prenom}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={e.valeur}
                        onChange={(ev) => modifierValeur(e.eleve_id, ev.target.value)}
                        className="w-16 border rounded px-2 py-1 text-center"
                        placeholder="-"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={enregistrerTout}
            disabled={saving}
            className="mt-4 bg-blue-600 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer toutes les notes'}
          </button>
        </>
      )}
    </main>
  );
    }
            
