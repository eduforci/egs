'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Candidat = {
  id: string; // id de la ligne examens_candidats
  eleve_id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe_nom: string;
  type: string;
  lv1_matiere_id: string | null;
  lv2_matiere_id: string | null;
  statut_final: string | null;
};

type EleveRecherche = {
  eleve_id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe_nom: string;
};

export default function ExamenCandidatsPage() {
  const params = useParams();
  const examenId = params?.id as string;
  const supabase = createClient();

  const [examenNom, setExamenNom] = useState('');
  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [matieres, setMatieres] = useState<{ id: string; nom: string }[]>([]);
  const [epreuves, setEpreuves] = useState<{ id: string; nom: string; matiere_nom: string }[]>([]);
  const [dispenses, setDispenses] = useState<Record<string, Set<string>>>({}); // candidat_id -> Set<epreuve_id>
  const [candidatOuvert, setCandidatOuvert] = useState<string | null>(null);

  const [recherche, setRecherche] = useState('');
  const [resultatsRecherche, setResultatsRecherche] = useState<EleveRecherche[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: examen, error: examenError } = await supabase
        .from('examens')
        .select('nom, etablissement_id')
        .eq('id', examenId)
        .single();

      if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
      setExamenNom(examen.nom);
      setEtablissementId(examen.etablissement_id);

      const { data: candData, error: candError } = await supabase
        .from('examens_candidats')
        .select('id, eleve_id, type, lv1_matiere_id, lv2_matiere_id, statut_final, eleves(matricule, classe_id, classes(nom))')
        .eq('examen_id', examenId);

      if (candError) throw new Error(`Erreur candidats : ${candError.message}`);

      type RowE = {
        id: string; eleve_id: string; type: string;
        lv1_matiere_id: string | null; lv2_matiere_id: string | null; statut_final: string | null;
        eleves: { matricule: string; classe_id: string; classes: { nom: string } | { nom: string }[] | null }
          | { matricule: string; classe_id: string; classes: { nom: string } | { nom: string }[] | null }[] | null;
      };
      const brut = (candData ?? []) as unknown as RowE[];
      const eleveIds = brut.map((r) => r.eleve_id);

      const { data: matieresData } = await supabase
        .from('matieres')
        .select('id, nom')
        .eq('etablissement_id', examen.etablissement_id)
        .order('nom');
      setMatieres(matieresData ?? []);

      const { data: epreuvesData } = await supabase
        .from('examens_matieres')
        .select('id, nom, matieres(nom)')
        .eq('examen_id', examenId);

      type RowEp = { id: string; nom: string; matieres: { nom: string } | { nom: string }[] | null };
      const listeEpreuves = ((epreuvesData ?? []) as unknown as RowEp[]).map((r) => {
        const m = Array.isArray(r.matieres) ? r.matieres[0] : r.matieres;
        return { id: r.id, nom: r.nom, matiere_nom: m?.nom ?? 'Inconnue' };
      });
      setEpreuves(listeEpreuves);

      const candidatIds = brut.map((r) => r.id);
      const { data: dispensesData } = await supabase
        .from('examens_candidats_dispenses')
        .select('examen_candidat_id, epreuve_id')
        .in('examen_candidat_id', candidatIds.length > 0 ? candidatIds : ['00000000-0000-0000-0000-000000000000']);

      const dispensesMap: Record<string, Set<string>> = {};
      (dispensesData ?? []).forEach((d) => {
        if (!dispensesMap[d.examen_candidat_id]) dispensesMap[d.examen_candidat_id] = new Set();
        dispensesMap[d.examen_candidat_id].add(d.epreuve_id);
      });
      setDispenses(dispensesMap);

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, nom, prenom')
        .in('id', eleveIds.length > 0 ? eleveIds : ['00000000-0000-0000-0000-000000000000']);

      if (profilesError) throw new Error(`Erreur profils : ${profilesError.message}`);
      const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

      const liste: Candidat[] = brut.map((r) => {
        const ele = Array.isArray(r.eleves) ? r.eleves[0] : r.eleves;
        const cl = ele?.classes ? (Array.isArray(ele.classes) ? ele.classes[0] : ele.classes) : null;
        const profil = profilesMap.get(r.eleve_id);
        return {
          id: r.id,
          eleve_id: r.eleve_id,
          nom: profil?.nom ?? 'Inconnu',
          prenom: profil?.prenom ?? '',
          matricule: ele?.matricule ?? '-',
          classe_nom: cl?.nom ?? '-',
          type: r.type,
          lv1_matiere_id: r.lv1_matiere_id,
          lv2_matiere_id: r.lv2_matiere_id,
          statut_final: r.statut_final,
        };
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

  async function synchroniser() {
    setSaving(true);
    setError(null);
    setSucces(null);

    const { data, error: rpcError } = await supabase.rpc('synchroniser_candidats_examen', {
      p_examen_id: examenId,
    });

    setSaving(false);

    if (rpcError) {
      setError(`Erreur synchronisation : ${rpcError.message}`);
      return;
    }

    setSucces(`${data} nouveau(x) candidat(s) ajouté(s) depuis les classes liées.`);
    charger();
  }

  async function toutRetirer() {
    const confirmation = window.confirm('Retirer TOUS les candidats de cet examen ?');
    if (!confirmation) return;

    setSaving(true);
    const { error: deleteError } = await supabase.from('examens_candidats').delete().eq('examen_id', examenId);
    setSaving(false);

    if (deleteError) {
      setError(`Erreur : ${deleteError.message}`);
      return;
    }
    charger();
  }

  async function retirerCandidat(id: string) {
    setSaving(true);
    const { error: deleteError } = await supabase.from('examens_candidats').delete().eq('id', id);
    setSaving(false);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    charger();
  }

  async function modifierLangue(id: string, champ: 'lv1_matiere_id' | 'lv2_matiere_id', matiereId: string) {
    setCandidats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [champ]: matiereId || null } : c))
    );
    const { error: updateError } = await supabase
      .from('examens_candidats')
      .update({ [champ]: matiereId || null })
      .eq('id', id);
    if (updateError) {
      setError(`Erreur mise à jour langue : ${updateError.message}`);
    }
  }

  async function modifierStatutFinal(id: string, statut: string) {
    setCandidats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, statut_final: statut || null } : c))
    );
    const { error: updateError } = await supabase
      .from('examens_candidats')
      .update({ statut_final: statut || null })
      .eq('id', id);
    if (updateError) {
      setError(`Erreur mise à jour statut : ${updateError.message}`);
    }
  }

  async function basculerDispense(candidatId: string, epreuveId: string) {
    const dejaDispense = dispenses[candidatId]?.has(epreuveId) ?? false;

    setDispenses((prev) => {
      const copie = { ...prev };
      const set = new Set(copie[candidatId] ?? []);
      if (dejaDispense) set.delete(epreuveId); else set.add(epreuveId);
      copie[candidatId] = set;
      return copie;
    });

    if (dejaDispense) {
      const { error: deleteError } = await supabase
        .from('examens_candidats_dispenses')
        .delete()
        .eq('examen_candidat_id', candidatId)
        .eq('epreuve_id', epreuveId);
      if (deleteError) setError(`Erreur : ${deleteError.message}`);
    } else {
      const { error: insertError } = await supabase
        .from('examens_candidats_dispenses')
        .insert({ examen_candidat_id: candidatId, epreuve_id: epreuveId });
      if (insertError) setError(`Erreur : ${insertError.message}`);
    }
  }

  async function rechercherEleves(texte: string) {
    setRecherche(texte);
    if (!etablissementId || texte.trim().length < 2) {
      setResultatsRecherche([]);
      return;
    }

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, nom, prenom')
      .eq('etablissement_id', etablissementId)
      .eq('role', 'eleve')
      .or(`nom.ilike.%${texte}%,prenom.ilike.%${texte}%`)
      .limit(10);

    if (!profilesData || profilesData.length === 0) {
      setResultatsRecherche([]);
      return;
    }

    const ids = profilesData.map((p) => p.id);
    const { data: elevesData } = await supabase
      .from('eleves')
      .select('id, matricule, classes(nom)')
      .in('id', ids);

    const elevesMap = new Map((elevesData ?? []).map((e) => [e.id, e]));

    const dejaCandidats = new Set(candidats.map((c) => c.eleve_id));

    const resultats: EleveRecherche[] = profilesData
      .filter((p) => !dejaCandidats.has(p.id))
      .map((p) => {
        const ele = elevesMap.get(p.id);
        const cl = ele?.classes ? (Array.isArray(ele.classes) ? ele.classes[0] : ele.classes) : null;
        return {
          eleve_id: p.id,
          nom: p.nom,
          prenom: p.prenom,
          matricule: ele?.matricule ?? '-',
          classe_nom: (cl as any)?.nom ?? '-',
        };
      });

    setResultatsRecherche(resultats);
  }

  async function ajouterExceptionnel(eleveId: string) {
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('examens_candidats').insert({
      examen_id: examenId,
      eleve_id: eleveId,
      type: 'exceptionnel',
    });

    setSaving(false);

    if (insertError) {
      setError(`Erreur ajout : ${insertError.message}`);
      return;
    }

    setSucces('Candidat exceptionnel ajouté.');
    setRecherche('');
    setResultatsRecherche([]);
    charger();
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-12">
      <h1 className="text-xl font-bold mb-1">Candidats — {examenNom}</h1>
      <p className="text-sm text-gray-500 mb-4">{candidats.length} candidat(s) inscrit(s)</p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {/* Actions en masse */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={synchroniser}
          disabled={saving}
          className="flex-1 bg-blue-600 text-white text-sm px-3 py-2 rounded-md disabled:opacity-50"
        >
          Tout sélectionner (depuis les classes)
        </button>
        <button
          onClick={toutRetirer}
          disabled={saving || candidats.length === 0}
          className="flex-1 border border-red-300 text-red-600 text-sm px-3 py-2 rounded-md disabled:opacity-50"
        >
          Tout désélectionner
        </button>
      </div>

      {/* Ajouter un candidat exceptionnel */}
      <div className="border rounded-lg p-4 mb-4">
        <p className="font-semibold text-sm mb-2">Ajouter un candidat exceptionnel</p>
        <input
          type="text"
          value={recherche}
          onChange={(e) => rechercherEleves(e.target.value)}
          placeholder="Rechercher un élève par nom ou prénom..."
          className="w-full border rounded-md px-3 py-2 text-sm mb-2"
        />
        {resultatsRecherche.length > 0 && (
          <div className="border rounded-md divide-y">
            {resultatsRecherche.map((e) => (
              <div key={e.eleve_id} className="flex justify-between items-center px-3 py-2 text-sm">
                <span>{e.nom} {e.prenom} <span className="text-gray-400 text-xs">({e.classe_nom})</span></span>
                <button
                  onClick={() => ajouterExceptionnel(e.eleve_id)}
                  disabled={saving}
                  className="text-blue-600 text-xs"
                >
                  Ajouter
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Utile pour un candidat libre ou d'un autre niveau/série que celui de l'examen.
        </p>
      </div>

      {/* Liste des candidats */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Candidat</th>
              <th className="text-left px-3 py-2">Classe</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2 w-28">Statut</th>
              <th className="text-left px-3 py-2 w-24">Dispenses</th>
              <th className="text-left px-3 py-2 w-32">LV1</th>
              <th className="text-left px-3 py-2 w-32">LV2</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {candidats.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-gray-400">
                  Aucun candidat. Utilise "Tout sélectionner" pour peupler depuis les classes liées.
                </td>
              </tr>
            ) : (
              candidats.map((c) => (
                <Fragment key={c.id}>
                <tr className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{c.nom} {c.prenom}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.classe_nom}</td>
                  <td className="px-3 py-2">
                    {c.type === 'exceptionnel' ? (
                      <span className="text-amber-600 text-xs">Exceptionnel</span>
                    ) : (
                      <span className="text-gray-400 text-xs">Régulier</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={c.statut_final ?? ''}
                      onChange={(e) => modifierStatutFinal(c.id, e.target.value)}
                      className="w-24 border rounded px-1 py-1 text-xs"
                    >
                      <option value="">Normal</option>
                      <option value="absent">Absent</option>
                      <option value="exclu">Exclu</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => setCandidatOuvert(candidatOuvert === c.id ? null : c.id)}
                      className="text-xs text-blue-600 whitespace-nowrap"
                    >
                      {(dispenses[c.id]?.size ?? 0) > 0 ? `${dispenses[c.id]!.size} dispense(s)` : 'Gérer'}
                    </button>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={c.lv1_matiere_id ?? ''}
                      onChange={(e) => modifierLangue(c.id, 'lv1_matiere_id', e.target.value)}
                      className="w-28 border rounded px-1 py-1 text-xs"
                    >
                      <option value="">-</option>
                      {matieres.map((m) => (
                        <option key={m.id} value={m.id}>{m.nom}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={c.lv2_matiere_id ?? ''}
                      onChange={(e) => modifierLangue(c.id, 'lv2_matiere_id', e.target.value)}
                      className="w-28 border rounded px-1 py-1 text-xs"
                    >
                      <option value="">-</option>
                      {matieres.map((m) => (
                        <option key={m.id} value={m.id}>{m.nom}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => retirerCandidat(c.id)} className="text-red-600 text-xs">
                      Retirer
                    </button>
                  </td>
                </tr>
                {candidatOuvert === c.id && (
                  <tr className="bg-gray-50 border-t">
                    <td colSpan={8} className="px-3 py-3">
                      <p className="text-xs font-medium mb-2">
                        Épreuves dont {c.nom} {c.prenom} est dispensé(e) :
                      </p>
                      {epreuves.length === 0 ? (
                        <p className="text-xs text-gray-400">Aucune épreuve configurée pour cet examen.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-1">
                          {epreuves.map((ep) => (
                            <label key={ep.id} className="flex items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                checked={dispenses[c.id]?.has(ep.id) ?? false}
                                onChange={() => basculerDispense(c.id, ep.id)}
                              />
                              {ep.matiere_nom} — {ep.nom}
                            </label>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        LV1/LV2 ne sont utiles que pour un BAC série A1/A2 — laisse vide pour les autres examens.
        Le choix de chaque candidat détermine automatiquement quelle épreuve de langue compte dans son calcul.
      </p>
    </main>
  );
}
