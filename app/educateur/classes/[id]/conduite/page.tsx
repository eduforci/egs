'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type EleveLigne = {
  eleve_id: string;
  nom: string;
  prenom: string;
  matricule: string;
  valeur: string;
  valeurInitiale: string;
  note_id: string | null;
};

export default function SaisieConduitePage() {
  const params = useParams();
  const classeId = params?.id as string;

  const [trimestre, setTrimestre] = useState(1);
  const [classeNom, setClasseNom] = useState('');
  const [matiereConduiteId, setMatiereConduiteId] = useState<string | null>(null);
  const [anneeScolaire, setAnneeScolaire] = useState('');
  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [eleves, setEleves] = useState<EleveLigne[]>([]);
  const [deverrouillees, setDeverrouillees] = useState<Set<string>>(new Set());
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
    setDeverrouillees(new Set());

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
      setEtablissementId(classeData.etablissement_id);

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
        .select('id, matricule')
        .eq('classe_id', classeId);

      if (elevesError) throw new Error(`Erreur élèves : ${elevesError.message}`);

      const eleveIds = (elevesData ?? []).map((e) => e.id);

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, nom, prenom')
        .in('id', eleveIds);

      if (profilesError) throw new Error(`Erreur profils : ${profilesError.message}`);

      const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

      const { data: notesExistantes, error: notesError } = await supabase
        .from('notes')
        .select('id, eleve_id, valeur')
        .eq('classe_id', classeId)
        .eq('matiere_id', matiereData.id)
        .eq('trimestre', trimestre)
        .eq('annee_scolaire', etabData.annee_scolaire_active);

      if (notesError) throw new Error(`Erreur notes existantes : ${notesError.message}`);

      const notesMap = new Map((notesExistantes ?? []).map((n) => [n.eleve_id, n]));

      const lignes: EleveLigne[] = (elevesData ?? []).map((e) => {
        const profil = profilesMap.get(e.id);
        const noteExistante = notesMap.get(e.id);
        const valeur = noteExistante ? String(noteExistante.valeur) : '';
        return {
          eleve_id: e.id,
          nom: profil?.nom ?? 'Inconnu',
          prenom: profil?.prenom ?? '',
          matricule: e.matricule,
          valeur,
          valeurInitiale: valeur,
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

  function deverrouillerLigne(eleveId: string) {
    setDeverrouillees((prev) => {
      const copie = new Set(prev);
      copie.add(eleveId);
      return copie;
    });
  }

  function estModifiable(ligne: EleveLigne) {
    // Éditable si : pas encore de note existante, ou explicitement déverrouillée
    return ligne.note_id === null || deverrouillees.has(ligne.eleve_id);
  }

  async function notifierDirection(nom: string, prenom: string, avant: string, apres: string) {
    if (!etablissementId) return;
    const contenu = `Note de conduite modifiée pour ${prenom} ${nom} : ${avant || '—'}/20 → ${apres}/20`;

    for (const role of ['chef', 'directeur_etudes'] as const) {
      await supabase.from('notifications').insert({
        etablissement_id: etablissementId,
        destinataire_role: role,
        titre: 'Modification de note',
        contenu,
      });
    }
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
        if (!estModifiable(eleve)) continue;
        if (eleve.valeur === eleve.valeurInitiale) continue;
        if (eleve.valeur.trim() === '') continue;

        const valeurNum = parseFloat(eleve.valeur.replace(',', '.'));
        if (isNaN(valeurNum) || valeurNum < 0 || valeurNum > 20) {
          throw new Error(`Note invalide pour ${eleve.nom} ${eleve.prenom} : doit être entre 0 et 20.`);
        }

        const estUneModification = eleve.note_id !== null;

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
            bareme_max: 20,
            trimestre,
            annee_scolaire: anneeScolaire,
          });
          if (insertError) throw new Error(`Erreur enregistrement ${eleve.nom} : ${insertError.message}`);
        }

        await supabase.from('notes_historique').insert({
          eleve_id: eleve.eleve_id,
          matiere_id: matiereConduiteId,
          classe_id: classeId,
          trimestre,
          annee_scolaire: anneeScolaire,
          type: 'devoir',
          ancienne_valeur: eleve.valeurInitiale === '' ? null : parseFloat(eleve.valeurInitiale),
          nouvelle_valeur: valeurNum,
          modifie_par: user.id,
        });

        if (estUneModification) {
          await notifierDirection(eleve.nom, eleve.prenom, eleve.valeurInitiale, eleve.valeur);
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
                  <th className="text-left px-3 py-2 w-28">Note /20</th>
                </tr>
              </thead>
              <tbody>
                {eleves.map((e) => {
                  const modifiable = estModifiable(e);
                  return (
                    <tr key={e.eleve_id} className="border-t">
                      <td className="px-3 py-2">{e.nom} {e.prenom}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={e.valeur}
                            disabled={!modifiable}
                            onChange={(ev) => modifierValeur(e.eleve_id, ev.target.value)}
                            className={`w-16 border rounded px-2 py-1 text-center ${
                              !modifiable ? 'bg-gray-100 text-gray-400' : ''
                            }`}
                            placeholder="-"
                          />
                          {!modifiable && (
                            <button
                              type="button"
                              onClick={() => deverrouillerLigne(e.eleve_id)}
                              title="Modifier cette note"
                              className="text-gray-400 hover:text-gray-700"
                            >
                              ✏️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
