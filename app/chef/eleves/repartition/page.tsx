'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Eleve = {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  classe_id: string;
  classe_nom: string;
};

type Classe = {
  id: string;
  nom: string;
  niveau: string;
};

export default function RepartitionElevesPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [anneeActive, setAnneeActive] = useState('');

  const [niveaux, setNiveaux] = useState<string[]>([]);
  const [niveauChoisi, setNiveauChoisi] = useState('');

  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const [classesDuNiveau, setClassesDuNiveau] = useState<Classe[]>([]);
  const [classeCible, setClasseCible] = useState('');
  const [nouvelleClasseNom, setNouvelleClasseNom] = useState('');
  const [modeNouvelleClasse, setModeNouvelleClasse] = useState(false);

  const [loading, setLoading] = useState(true);
  const [deplacementEnCours, setDeplacementEnCours] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const chargerContexte = useCallback(async () => {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('etablissement_id')
      .eq('id', userData.user.id)
      .single();

    if (!profile?.etablissement_id) {
      setLoading(false);
      return;
    }
    setEtablissementId(profile.etablissement_id);

    const { data: etab } = await supabase
      .from('etablissements')
      .select('annee_scolaire_active')
      .eq('id', profile.etablissement_id)
      .single();
    setAnneeActive(etab?.annee_scolaire_active ?? '');

    const { data: classesData } = await supabase
      .from('classes')
      .select('niveau')
      .eq('etablissement_id', profile.etablissement_id)
      .eq('annee_scolaire', etab?.annee_scolaire_active ?? '');

    const niveauxUniques = Array.from(
      new Set((classesData ?? []).map((c) => c.niveau))
    ).sort();
    setNiveaux(niveauxUniques);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    chargerContexte();
  }, [chargerContexte]);

  const chargerElevesEtClasses = useCallback(async (niveau: string) => {
    if (!niveau || !etablissementId) return;

    setLoading(true);
    setSelection(new Set());
    setMessage(null);
    setModeNouvelleClasse(false);
    setClasseCible('');

    const { data: classesData } = await supabase
      .from('classes')
      .select('id, nom, niveau')
      .eq('etablissement_id', etablissementId)
      .eq('annee_scolaire', anneeActive)
      .eq('niveau', niveau)
      .order('nom');

    setClassesDuNiveau(classesData ?? []);

    const idsClasses = (classesData ?? []).map((c) => c.id);

    const { data: elevesData } = idsClasses.length > 0
      ? await supabase
          .from('eleves')
          .select('id, matricule, classe_id')
          .in('classe_id', idsClasses)
      : { data: [] };

    const idsEleves = (elevesData ?? []).map((e) => e.id);
    const { data: profilsData } = idsEleves.length > 0
      ? await supabase.from('profiles').select('id, nom, prenom').in('id', idsEleves)
      : { data: [] };
    const profilsMap = new Map((profilsData ?? []).map((p) => [p.id, p]));
    const classesMap = new Map((classesData ?? []).map((c) => [c.id, c.nom]));

    const liste: Eleve[] = (elevesData ?? []).map((e) => {
      const p = profilsMap.get(e.id);
      return {
        id: e.id,
        matricule: e.matricule,
        nom: p?.nom ?? '',
        prenom: p?.prenom ?? '',
        classe_id: e.classe_id,
        classe_nom: classesMap.get(e.classe_id) ?? '',
      };
    }).sort((a, b) => a.nom.localeCompare(b.nom));

    setEleves(liste);
    setLoading(false);
  }, [supabase, etablissementId, anneeActive]);

  useEffect(() => {
    if (niveauChoisi) chargerElevesEtClasses(niveauChoisi);
  }, [niveauChoisi, chargerElevesEtClasses]);

  function toggleEleve(id: string) {
    setSelection((prev) => {
      const copie = new Set(prev);
      if (copie.has(id)) copie.delete(id);
      else copie.add(id);
      return copie;
    });
  }

  function toggleTout() {
    if (selection.size === eleves.length) {
      setSelection(new Set());
    } else {
      setSelection(new Set(eleves.map((e) => e.id)));
    }
  }

  async function deplacerSelection() {
    if (selection.size === 0) {
      setMessage({ type: 'error', text: 'Sélectionne au moins un élève.' });
      return;
    }

    setDeplacementEnCours(true);
    setMessage(null);

    try {
      let classeIdFinale = classeCible;

      if (modeNouvelleClasse) {
        if (!nouvelleClasseNom.trim()) {
          setMessage({ type: 'error', text: 'Donne un nom à la nouvelle classe.' });
          setDeplacementEnCours(false);
          return;
        }

        const { data: nouvelleClasse, error: creationError } = await supabase
          .from('classes')
          .insert({
            etablissement_id: etablissementId,
            nom: nouvelleClasseNom.trim(),
            niveau: niveauChoisi,
            annee_scolaire: anneeActive,
          })
          .select('id')
          .single();

        if (creationError || !nouvelleClasse) {
          throw new Error(creationError?.message || 'Erreur lors de la création de la classe.');
        }

        classeIdFinale = nouvelleClasse.id;
      }

      if (!classeIdFinale) {
        setMessage({ type: 'error', text: 'Choisis une classe de destination.' });
        setDeplacementEnCours(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('eleves')
        .update({ classe_id: classeIdFinale })
        .in('id', Array.from(selection));

      if (updateError) throw new Error(updateError.message);

      setMessage({
        type: 'success',
        text: `${selection.size} élève(s) déplacé(s) avec succès.`,
      });
      setNouvelleClasseNom('');
      chargerElevesEtClasses(niveauChoisi);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur inconnue.',
      });
    } finally {
      setDeplacementEnCours(false);
    }
  }

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16 space-y-4">
      <h1 className="text-xl font-bold">Répartir les élèves en classes</h1>
      <p className="text-sm text-gray-500">
        Filtre par niveau, sélectionne les élèves à regrouper, puis choisis ou crée la classe
        de destination.
      </p>

      <div>
        <label className="block text-sm font-medium mb-1">Niveau</label>
        <select
          value={niveauChoisi}
          onChange={(e) => setNiveauChoisi(e.target.value)}
          className="w-full border rounded-lg p-2"
        >
          <option value="">Choisir un niveau...</option>
          {niveaux.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
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

      {loading && niveauChoisi && <p className="text-sm text-gray-500">Chargement...</p>}

      {!loading && niveauChoisi && eleves.length === 0 && (
        <p className="text-sm text-gray-500">Aucun élève trouvé pour ce niveau.</p>
      )}

      {!loading && eleves.length > 0 && (
        <>
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between bg-gray-100 px-3 py-2 text-xs font-medium">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selection.size === eleves.length}
                  onChange={toggleTout}
                />
                Tout sélectionner
              </label>
              <span>{selection.size} sélectionné(s) sur {eleves.length}</span>
            </div>

            <div className="divide-y max-h-96 overflow-y-auto">
              {eleves.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selection.has(e.id)}
                      onChange={() => toggleEleve(e.id)}
                    />
                    <span>
                      {e.nom} {e.prenom}
                      <span className="text-gray-400 font-mono text-xs ml-2">{e.matricule}</span>
                    </span>
                  </span>
                  <span className="text-xs text-gray-400">{e.classe_nom}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-3">
            <p className="font-semibold text-sm">Classe de destination</p>

            {!modeNouvelleClasse ? (
              <>
                <select
                  value={classeCible}
                  onChange={(e) => setClasseCible(e.target.value)}
                  className="w-full border rounded-lg p-2 text-sm"
                >
                  <option value="">Choisir une classe existante...</option>
                  {classesDuNiveau.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
                <button
                  onClick={() => setModeNouvelleClasse(true)}
                  className="text-xs text-blue-600 underline"
                >
                  + Créer une nouvelle classe à la place
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={nouvelleClasseNom}
                  onChange={(e) => setNouvelleClasseNom(e.target.value)}
                  placeholder={`Nom de la classe (ex: ${niveauChoisi} B)`}
                  className="w-full border rounded-lg p-2 text-sm"
                />
                <button
                  onClick={() => setModeNouvelleClasse(false)}
                  className="text-xs text-blue-600 underline"
                >
                  ← Choisir une classe existante à la place
                </button>
              </>
            )}

            <button
              onClick={deplacerSelection}
              disabled={deplacementEnCours || selection.size === 0}
              className="w-full bg-black text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {deplacementEnCours
                ? 'Déplacement...'
                : `Déplacer ${selection.size} élève(s) vers cette classe`}
            </button>
          </div>
        </>
      )}
    </main>
  );
          }
