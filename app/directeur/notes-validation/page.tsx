'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Combo = {
  classe_id: string;
  classe_nom: string;
  matiere_id: string;
  matiere_nom: string;
  nb_notes: number;
  valide: boolean;
  valide_par_nom: string | null;
  valide_at: string | null;
};

type NoteDetail = {
  id: string;
  eleve_id: string;
  eleve_nom: string;
  eleve_prenom: string;
  type: string;
  valeur: number;
  coefficient: number;
};

const TYPE_LABEL: Record<string, string> = {
  devoir: 'Devoir',
  composition: 'Composition',
  interrogation: 'Interrogation',
};

export default function NotesValidationPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [anneeScolaire, setAnneeScolaire] = useState('');
  const [trimestre, setTrimestre] = useState(1);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [comboOuverte, setComboOuverte] = useState<Combo | null>(null);
  const [notesDetail, setNotesDetail] = useState<NoteDetail[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [validating, setValidating] = useState(false);

  const chargerCombos = useCallback(async (trimestreChoisi: number) => {
    setLoading(true);
    setMessage(null);

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
    setEtablissementId(profil.etablissement_id);

    const { data: etab } = await supabase
      .from('etablissements')
      .select('annee_scolaire_active')
      .eq('id', profil.etablissement_id)
      .single();
    const annee = etab?.annee_scolaire_active || new Date().getFullYear().toString();
    setAnneeScolaire(annee);

    const { data: notesData, error: notesError } = await supabase
      .from('notes')
      .select('classe_id, matiere_id, classes(nom), matieres(nom)')
      .eq('annee_scolaire', annee)
      .eq('trimestre', trimestreChoisi);

    if (notesError) {
      setMessage({ type: 'error', text: 'Erreur chargement notes: ' + notesError.message });
      setLoading(false);
      return;
    }

    const grouped = new Map<string, { classe_id: string; classe_nom: string; matiere_id: string; matiere_nom: string; nb_notes: number }>();
    (notesData || []).forEach((n: any) => {
      const key = `${n.classe_id}__${n.matiere_id}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          classe_id: n.classe_id,
          classe_nom: n.classes?.nom || '',
          matiere_id: n.matiere_id,
          matiere_nom: n.matieres?.nom || '',
          nb_notes: 0,
        });
      }
      grouped.get(key)!.nb_notes++;
    });

    const { data: validations } = await supabase
      .from('validations_notes')
      .select('classe_id, matiere_id, valide, valide_par, valide_at')
      .eq('annee_scolaire', annee)
      .eq('trimestre', trimestreChoisi);

    const validationsParKey = new Map(
      (validations || []).map((v) => [`${v.classe_id}__${v.matiere_id}`, v])
    );

    const idsValideurs = (validations || []).filter((v) => v.valide_par).map((v) => v.valide_par);
    const { data: profilsValideurs } = idsValideurs.length > 0
      ? await supabase.from('profiles').select('id, nom, prenom').in('id', idsValideurs)
      : { data: [] };
    const valideursParId = new Map((profilsValideurs || []).map((p) => [p.id, p]));

    const listeCombos: Combo[] = Array.from(grouped.values()).map((c) => {
      const key = `${c.classe_id}__${c.matiere_id}`;
      const v = validationsParKey.get(key);
      const valideur = v?.valide_par ? valideursParId.get(v.valide_par) : null;
      return {
        ...c,
        valide: v?.valide || false,
        valide_par_nom: valideur ? `${valideur.nom} ${valideur.prenom}` : null,
        valide_at: v?.valide_at || null,
      };
    }).sort((a, b) => a.classe_nom.localeCompare(b.classe_nom) || a.matiere_nom.localeCompare(b.matiere_nom));

    setCombos(listeCombos);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    chargerCombos(trimestre);
  }, [trimestre, chargerCombos]);

  const ouvrirDetail = async (combo: Combo) => {
    setComboOuverte(combo);
    setLoadingDetail(true);
    setMessage(null);

    const { data: notesData, error } = await supabase
      .from('notes')
      .select('id, eleve_id, type, valeur, coefficient')
      .eq('classe_id', combo.classe_id)
      .eq('matiere_id', combo.matiere_id)
      .eq('annee_scolaire', anneeScolaire)
      .eq('trimestre', trimestre)
      .order('eleve_id');

    if (error) {
      setMessage({ type: 'error', text: 'Erreur chargement détail: ' + error.message });
      setLoadingDetail(false);
      return;
    }

    const idsEleves = Array.from(new Set((notesData || []).map((n) => n.eleve_id)));
    const { data: profs } = idsEleves.length > 0
      ? await supabase.from('profiles').select('id, nom, prenom').in('id', idsEleves)
      : { data: [] };
    const profsParId = new Map((profs || []).map((p) => [p.id, p]));

    const detail: NoteDetail[] = (notesData || []).map((n) => {
      const p = profsParId.get(n.eleve_id);
      return {
        id: n.id,
        eleve_id: n.eleve_id,
        eleve_nom: p?.nom || '',
        eleve_prenom: p?.prenom || '',
        type: n.type,
        valeur: Number(n.valeur),
        coefficient: Number(n.coefficient),
      };
    }).sort((a, b) => a.eleve_nom.localeCompare(b.eleve_nom));

    setNotesDetail(detail);
    setLoadingDetail(false);
  };

  const fermerDetail = () => {
    setComboOuverte(null);
    setNotesDetail([]);
  };

  const valider = async () => {
    if (!comboOuverte) return;
    setValidating(true);
    setMessage(null);

    const { data: userData } = await supabase.auth.getUser();

    const { data: existant } = await supabase
      .from('validations_notes')
      .select('id')
      .eq('classe_id', comboOuverte.classe_id)
      .eq('matiere_id', comboOuverte.matiere_id)
      .eq('trimestre', trimestre)
      .eq('annee_scolaire', anneeScolaire)
      .maybeSingle();

    let error;
    if (existant) {
      ({ error } = await supabase
        .from('validations_notes')
        .update({ valide: true, valide_par: userData?.user?.id, valide_at: new Date().toISOString() })
        .eq('id', existant.id));
    } else {
      ({ error } = await supabase.from('validations_notes').insert({
        classe_id: comboOuverte.classe_id,
        matiere_id: comboOuverte.matiere_id,
        trimestre,
        annee_scolaire: anneeScolaire,
        valide: true,
        valide_par: userData?.user?.id,
        valide_at: new Date().toISOString(),
      }));
    }

    if (error) {
      setMessage({ type: 'error', text: 'Erreur validation: ' + error.message });
      setValidating(false);
      return;
    }

    setMessage({ type: 'success', text: 'Notes validées et verrouillées.' });
    setValidating(false);
    fermerDetail();
    chargerCombos(trimestre);
  };

  const deverrouiller = async () => {
    if (!comboOuverte) return;
    setValidating(true);
    setMessage(null);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('validations_notes')
      .update({
        valide: false,
        deverrouille_par: userData?.user?.id,
        deverrouille_at: new Date().toISOString(),
      })
      .eq('classe_id', comboOuverte.classe_id)
      .eq('matiere_id', comboOuverte.matiere_id)
      .eq('trimestre', trimestre)
      .eq('annee_scolaire', anneeScolaire);

    if (error) {
      setMessage({ type: 'error', text: 'Erreur déverrouillage: ' + error.message });
      setValidating(false);
      return;
    }

    setMessage({ type: 'success', text: 'Notes déverrouillées.' });
    setValidating(false);
    fermerDetail();
    chargerCombos(trimestre);
  };

  const moyenneParEleve = (eleveId: string) => {
    const notesEleve = notesDetail.filter((n) => n.eleve_id === eleveId);
    const sommeCoef = notesEleve.reduce((s, n) => s + n.coefficient, 0);
    if (sommeCoef === 0) return 0;
    const sommePonderee = notesEleve.reduce((s, n) => s + n.valeur * n.coefficient, 0);
    return Math.round((sommePonderee / sommeCoef) * 100) / 100;
  };

  const elevesUniques = Array.from(new Set(notesDetail.map((n) => n.eleve_id)))
    .map((id) => notesDetail.find((n) => n.eleve_id === id)!)
    .sort((a, b) => a.eleve_nom.localeCompare(b.eleve_nom));

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Notes à valider</h1>

      {!comboOuverte && (
        <div>
          <label className="block text-sm font-medium mb-1">Trimestre</label>
          <select
            value={trimestre}
            onChange={(e) => setTrimestre(parseInt(e.target.value))}
            className="w-full border rounded-lg p-2"
          >
            <option value={1}>Trimestre 1</option>
            <option value={2}>Trimestre 2</option>
            <option value={3}>Trimestre 3</option>
          </select>
        </div>
      )}

      {anneeScolaire && <p className="text-sm text-gray-500">Année scolaire {anneeScolaire}</p>}

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Chargement...</p>}

      {!loading && !comboOuverte && (
        <div className="space-y-2">
          {combos.length === 0 && (
            <p className="text-gray-500 text-sm">Aucune note saisie pour ce trimestre.</p>
          )}
          {combos.map((c) => (
            <button
              key={`${c.classe_id}__${c.matiere_id}`}
              onClick={() => ouvrirDetail(c)}
              className="w-full border rounded-lg p-3 flex justify-between items-center text-left"
            >
              <div>
                <div className="font-medium">{c.classe_nom} — {c.matiere_nom}</div>
                <div className="text-xs text-gray-500">{c.nb_notes} note(s)</div>
              </div>
              {c.valide ? (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  🔒 Validée
                </span>
              ) : (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
                  À valider
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {comboOuverte && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">{comboOuverte.classe_nom} — {comboOuverte.matiere_nom}</h2>
            <button onClick={fermerDetail} className="text-sm text-gray-500">← Retour</button>
          </div>

          {comboOuverte.valide && (
            <div className="p-3 rounded-lg text-sm bg-green-50 text-green-700 border border-green-200">
              🔒 Validé{comboOuverte.valide_par_nom ? ` par ${comboOuverte.valide_par_nom}` : ''}
              {comboOuverte.valide_at ? ` le ${new Date(comboOuverte.valide_at).toLocaleDateString('fr-FR')}` : ''}
            </div>
          )}

          {loadingDetail && <p className="text-gray-500 text-sm">Chargement du détail...</p>}

          {!loadingDetail && elevesUniques.length === 0 && (
            <p className="text-gray-500 text-sm">Aucune note pour cette combinaison.</p>
          )}

          {!loadingDetail && elevesUniques.map((eleve) => {
            const notesEleve = notesDetail.filter((n) => n.eleve_id === eleve.eleve_id);
            return (
              <div key={eleve.eleve_id} className="border rounded-lg p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm">{eleve.eleve_nom} {eleve.eleve_prenom}</span>
                  <span className="text-sm font-bold">{moyenneParEleve(eleve.eleve_id)}/20</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                  {notesEleve.map((n) => (
                    <span key={n.id} className="bg-gray-100 rounded px-2 py-0.5">
                      {TYPE_LABEL[n.type] || n.type}: {n.valeur}/20 (coef {n.coefficient})
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {!loadingDetail && elevesUniques.length > 0 && (
            <div className="pt-2">
              {comboOuverte.valide ? (
                <button
                  onClick={deverrouiller}
                  disabled={validating}
                  className="w-full bg-orange-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
                >
                  {validating ? 'Déverrouillage...' : '🔓 Déverrouiller'}
                </button>
              ) : (
                <button
                  onClick={valider}
                  disabled={validating}
                  className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
                >
                  {validating ? 'Validation...' : '🔒 Valider et verrouiller'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
                                    }
