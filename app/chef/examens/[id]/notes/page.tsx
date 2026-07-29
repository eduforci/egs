'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type EpreuveCol = {
  id: string;
  nom: string;
  bareme: number;
  role_langue: string | null;
  matiere_id: string;
};

type Candidat = {
  eleve_id: string;
  nom: string;
  prenom: string;
  lv1_matiere_id: string | null;
  lv2_matiere_id: string | null;
};

type MatiereOption = { id: string; nom: string };

type Historique = {
  id: string;
  eleve_nom: string;
  epreuve_nom: string;
  ancienne_valeur: number | null;
  nouvelle_valeur: number;
  modifie_par_nom: string;
  modifie_at: string;
};

type EtatCellule = 'idle' | 'saving' | 'saved' | 'error';

export default function ExamenNotesPage() {
  const params = useParams();
  const examenId = params?.id as string;
  const supabase = createClient();

  const [matieres, setMatieres] = useState<MatiereOption[]>([]);
  const [matiereActuelle, setMatiereActuelle] = useState<string>('');
  const [epreuves, setEpreuves] = useState<EpreuveCol[]>([]);
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({}); // clé = `${eleve_id}_${epreuve_id}`
  const [etatsCellules, setEtatsCellules] = useState<Record<string, EtatCellule>>({});
  const [verrouille, setVerrouille] = useState(false);

  const [historique, setHistorique] = useState<Historique[]>([]);
  const [afficherHistorique, setAfficherHistorique] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Charge la liste des matières ayant au moins une épreuve dans cet examen
  const chargerMatieres = useCallback(async () => {
    const { data: emData, error: emError } = await supabase
      .from('examens_matieres')
      .select('matiere_id, matieres(nom)')
      .eq('examen_id', examenId);

    if (emError) {
      setError(`Erreur matières : ${emError.message}`);
      return [];
    }

    type Row = { matiere_id: string; matieres: { nom: string } | { nom: string }[] | null };
    const uniques = new Map<string, string>();
    ((emData ?? []) as unknown as Row[]).forEach((r) => {
      const m = Array.isArray(r.matieres) ? r.matieres[0] : r.matieres;
      uniques.set(r.matiere_id, m?.nom ?? 'Inconnue');
    });

    const liste = Array.from(uniques.entries())
      .map(([id, nom]) => ({ id, nom }))
      .sort((a, b) => a.nom.localeCompare(b.nom));

    setMatieres(liste);
    return liste;
  }, [examenId, supabase]);

  // Charge épreuves + candidats + notes existantes + statut de verrouillage pour la matière active
  const chargerMatiereActuelle = useCallback(async (matiereId: string) => {
    if (!matiereId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: emData, error: emError } = await supabase
        .from('examens_matieres')
        .select('id, nom, bareme, role_langue, matiere_id')
        .eq('examen_id', examenId)
        .eq('matiere_id', matiereId);

      if (emError) throw new Error(`Erreur épreuves : ${emError.message}`);
      const epreuvesTriees = (emData ?? []).sort((a, b) => a.nom.localeCompare(b.nom));
      setEpreuves(epreuvesTriees);

      const { data: candData, error: candError } = await supabase
        .from('examens_candidats')
        .select('eleve_id, lv1_matiere_id, lv2_matiere_id')
        .eq('examen_id', examenId);

      if (candError) throw new Error(`Erreur candidats : ${candError.message}`);

      const eleveIds = (candData ?? []).map((c) => c.eleve_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, nom, prenom')
        .in('id', eleveIds.length > 0 ? eleveIds : ['00000000-0000-0000-0000-000000000000']);

      if (profilesError) throw new Error(`Erreur profils : ${profilesError.message}`);
      const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

      const listeCandidats: Candidat[] = (candData ?? []).map((c) => {
        const profil = profilesMap.get(c.eleve_id);
        return {
          eleve_id: c.eleve_id,
          nom: profil?.nom ?? 'Inconnu',
          prenom: profil?.prenom ?? '',
          lv1_matiere_id: c.lv1_matiere_id,
          lv2_matiere_id: c.lv2_matiere_id,
        };
      });
      listeCandidats.sort((a, b) => a.nom.localeCompare(b.nom));
      setCandidats(listeCandidats);

      const epreuveIds = epreuvesTriees.map((e) => e.id);
      const { data: notesData, error: notesError } = await supabase
        .from('notes_examen')
        .select('eleve_id, epreuve_id, valeur')
        .eq('examen_id', examenId)
        .in('epreuve_id', epreuveIds.length > 0 ? epreuveIds : ['00000000-0000-0000-0000-000000000000']);

      if (notesError) throw new Error(`Erreur notes : ${notesError.message}`);

      const notesMap: Record<string, string> = {};
      (notesData ?? []).forEach((n) => {
        notesMap[`${n.eleve_id}_${n.epreuve_id}`] = String(n.valeur);
      });
      setNotes(notesMap);
      setEtatsCellules({});

      const { data: verrouData } = await supabase
        .from('examens_verrouillages')
        .select('verrouille')
        .eq('examen_id', examenId)
        .eq('matiere_id', matiereId)
        .maybeSingle();

      setVerrouille(verrouData?.verrouille ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [examenId, supabase]);

  useEffect(() => {
    async function init() {
      const liste = await chargerMatieres();
      if (liste.length > 0) {
        setMatiereActuelle(liste[0].id);
      } else {
        setLoading(false);
      }
    }
    init();
  }, [chargerMatieres]);

  useEffect(() => {
    if (matiereActuelle) {
      chargerMatiereActuelle(matiereActuelle);
      setAfficherHistorique(false);
    }
  }, [matiereActuelle, chargerMatiereActuelle]);

  function epreuveApplicable(epreuve: EpreuveCol, candidat: Candidat): boolean {
    if (!epreuve.role_langue) return true;
    if (epreuve.role_langue === 'LV1') return epreuve.matiere_id === candidat.lv1_matiere_id;
    if (epreuve.role_langue === 'LV2') return epreuve.matiere_id === candidat.lv2_matiere_id;
    return true;
  }

  function saisirNote(eleveId: string, epreuveId: string, valeur: string) {
    const cle = `${eleveId}_${epreuveId}`;
    setNotes((prev) => ({ ...prev, [cle]: valeur }));
    setEtatsCellules((prev) => ({ ...prev, [cle]: 'idle' }));

    if (debounceRefs.current[cle]) clearTimeout(debounceRefs.current[cle]);
    debounceRefs.current[cle] = setTimeout(() => enregistrerNote(eleveId, epreuveId, valeur), 700);
  }

  async function enregistrerNote(eleveId: string, epreuveId: string, valeur: string) {
    const cle = `${eleveId}_${epreuveId}`;
    if (valeur.trim() === '') return;

    const num = parseFloat(valeur.replace(',', '.'));
    if (isNaN(num) || num < 0 || num > 20) {
      setEtatsCellules((prev) => ({ ...prev, [cle]: 'error' }));
      return;
    }

    setEtatsCellules((prev) => ({ ...prev, [cle]: 'saving' }));

    const { error: upsertError } = await supabase
      .from('notes_examen')
      .upsert(
        { examen_id: examenId, eleve_id: eleveId, epreuve_id: epreuveId, valeur: num },
        { onConflict: 'examen_id,eleve_id,epreuve_id' }
      );

    if (upsertError) {
      setEtatsCellules((prev) => ({ ...prev, [cle]: 'error' }));
      setError(upsertError.message);
      return;
    }

    setEtatsCellules((prev) => ({ ...prev, [cle]: 'saved' }));
  }

  async function validerMatiere() {
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();

    const { error: verrouError } = await supabase.from('examens_verrouillages').upsert(
      {
        examen_id: examenId,
        matiere_id: matiereActuelle,
        verrouille: true,
        verrouille_par: user?.id,
        verrouille_at: new Date().toISOString(),
      },
      { onConflict: 'examen_id,matiere_id' }
    );

    if (verrouError) {
      setError(`Erreur validation : ${verrouError.message}`);
      return;
    }

    setSucces('Matière validée et verrouillée.');
    setVerrouille(true);

    // Passage automatique à la matière suivante
    const indexActuel = matieres.findIndex((m) => m.id === matiereActuelle);
    if (indexActuel >= 0 && indexActuel < matieres.length - 1) {
      setTimeout(() => setMatiereActuelle(matieres[indexActuel + 1].id), 600);
    }
  }

  async function deverrouillerMatiere() {
    const { error: verrouError } = await supabase
      .from('examens_verrouillages')
      .update({ verrouille: false })
      .eq('examen_id', examenId)
      .eq('matiere_id', matiereActuelle);

    if (verrouError) {
      setError(`Erreur déverrouillage : ${verrouError.message}`);
      return;
    }

    setVerrouille(false);
    setSucces('Matière déverrouillée — modification possible.');
  }

  async function chargerHistorique() {
    const epreuveIds = epreuves.map((e) => e.id);
    const { data, error: histError } = await supabase
      .from('notes_examen_historique')
      .select('id, eleve_id, epreuve_id, ancienne_valeur, nouvelle_valeur, modifie_par, modifie_at')
      .eq('examen_id', examenId)
      .in('epreuve_id', epreuveIds.length > 0 ? epreuveIds : ['00000000-0000-0000-0000-000000000000'])
      .order('modifie_at', { ascending: false })
      .limit(50);

    if (histError) {
      setError(`Erreur historique : ${histError.message}`);
      return;
    }

    const eleveIds = Array.from(new Set((data ?? []).map((h) => h.eleve_id)));
    const modifPar = Array.from(new Set((data ?? []).map((h) => h.modifie_par).filter(Boolean)));
    const tousIds = Array.from(new Set([...eleveIds, ...modifPar]));

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, nom, prenom')
      .in('id', tousIds.length > 0 ? tousIds : ['00000000-0000-0000-0000-000000000000']);

    const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, `${p.nom} ${p.prenom}`]));
    const epreuvesMap = new Map(epreuves.map((e) => [e.id, e.nom]));

    const liste: Historique[] = (data ?? []).map((h) => ({
      id: h.id,
      eleve_nom: profilesMap.get(h.eleve_id) ?? 'Inconnu',
      epreuve_nom: epreuvesMap.get(h.epreuve_id) ?? 'Inconnue',
      ancienne_valeur: h.ancienne_valeur,
      nouvelle_valeur: h.nouvelle_valeur,
      modifie_par_nom: h.modifie_par ? (profilesMap.get(h.modifie_par) ?? 'Inconnu') : 'Inconnu',
      modifie_at: h.modifie_at,
    }));

    setHistorique(liste);
    setAfficherHistorique(true);
  }

  function iconeEtat(etat: EtatCellule | undefined) {
    if (etat === 'saving') return <span className="text-gray-400 text-xs">...</span>;
    if (etat === 'saved') return <span className="text-green-600 text-xs">✓</span>;
    if (etat === 'error') return <span className="text-red-600 text-xs">!</span>;
    return null;
  }

  if (loading && matieres.length === 0) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  if (matieres.length === 0) {
    return (
      <main className="p-4 md:p-6 max-w-2xl mx-auto">
        <p className="text-sm text-gray-500">
          Aucune épreuve configurée. Retourne sur la page Épreuves pour en ajouter avant de saisir des notes.
        </p>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-6 max-w-4xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Saisie des notes</h1>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {/* Sélecteur de matière */}
      <div className="mb-4">
        <label className="block text-xs text-gray-600 mb-1">Matière</label>
        <select
          value={matiereActuelle}
          onChange={(e) => setMatiereActuelle(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
        >
          {matieres.map((m) => (
            <option key={m.id} value={m.id}>{m.nom}</option>
          ))}
        </select>
      </div>

      {verrouille && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded-md p-3 mb-4 flex justify-between items-center">
          <span>Cette matière est verrouillée — lecture seule.</span>
          <button onClick={deverrouillerMatiere} className="underline font-medium">
            Déverrouiller
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement de la matière...</p>
      ) : candidats.length === 0 ? (
        <p className="text-sm text-gray-400">
          Aucun candidat. Va sur la page Candidats pour en ajouter.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto border rounded-lg mb-4">
            <table className="text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 sticky left-0 bg-gray-100">Candidat</th>
                  {epreuves.map((e) => (
                    <th key={e.id} className="px-2 py-2 w-24">
                      {e.nom}
                      {e.role_langue && (
                        <span className="block text-[9px] text-amber-600">{e.role_langue}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidats.map((c) => (
                  <tr key={c.eleve_id} className="border-t">
                    <td className="px-3 py-1.5 sticky left-0 bg-white whitespace-nowrap">
                      {c.nom} {c.prenom}
                    </td>
                    {epreuves.map((e) => {
                      const applicable = epreuveApplicable(e, c);
                      const cle = `${c.eleve_id}_${e.id}`;
                      return (
                        <td key={e.id} className="px-2 py-1.5">
                          {applicable ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={notes[cle] ?? ''}
                                onChange={(ev) => saisirNote(c.eleve_id, e.id, ev.target.value)}
                                disabled={verrouille}
                                className="w-14 border rounded px-1 py-1 text-center disabled:bg-gray-100"
                                placeholder="-"
                              />
                              {iconeEtat(etatsCellules[cle])}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">N/A</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 flex-wrap">
            {!verrouille && (
              <button
                onClick={validerMatiere}
                className="bg-black text-white text-sm px-4 py-2 rounded-md"
              >
                Valider cette matière et passer à la suivante
              </button>
            )}
            <button
              onClick={chargerHistorique}
              className="border text-sm px-4 py-2 rounded-md"
            >
              Voir l'historique des modifications
            </button>
          </div>

          {afficherHistorique && (
            <div className="border rounded-lg mt-4 overflow-hidden">
              <p className="bg-gray-100 px-3 py-2 text-sm font-semibold">
                Historique ({historique.length} dernière(s) modification(s))
              </p>
              {historique.length === 0 ? (
                <p className="px-3 py-3 text-sm text-gray-400">Aucune modification enregistrée.</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {historique.map((h) => (
                      <tr key={h.id} className="border-t">
                        <td className="px-3 py-2">{h.eleve_nom}</td>
                        <td className="px-2 py-2 text-gray-500">{h.epreuve_nom}</td>
                        <td className="px-2 py-2">
                          {h.ancienne_valeur ?? '—'} → <strong>{h.nouvelle_valeur}</strong>
                        </td>
                        <td className="px-2 py-2 text-gray-500">{h.modifie_par_nom}</td>
                        <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                          {new Date(h.modifie_at).toLocaleString('fr-FR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
    }
