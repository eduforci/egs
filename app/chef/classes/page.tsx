'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useEspace } from '@/lib/use-espace';
import { ESPACES, FORMULES_SUPERIEUR, CYCLES_LABEL, TYPES_LABEL, espaceDef, inferCycle } from '@/lib/espaces';

type Classe = {
  id: string;
  nom: string;
  niveau: string;
  cycle: string | null;
  serie: string | null;
  annee_scolaire: string;
};

type MatiereOption = {
  id: string;
  nom: string;
  coefficient_defaut: number;
};

type Selection = {
  checked: boolean;
  coefficient: number;
};

const CYCLES_LEGACY = [
  { value: '', label: 'Non précisé' },
  { value: 'maternelle', label: 'Maternelle' },
  { value: 'primaire', label: 'Primaire' },
  { value: 'college', label: 'Collège' },
  { value: 'lycee', label: 'Lycée' },
  { value: 'superieur', label: 'Supérieur' },
];

export default function ClassesPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [anneeActive, setAnneeActive] = useState('');
  const [formuleSup, setFormuleSup] = useState('');
  const [classes, setClasses] = useState<Classe[]>([]);
  const [matieresEtablissement, setMatieresEtablissement] = useState<MatiereOption[]>([]);

  const [nom, setNom] = useState('');
  const [niveau, setNiveau] = useState('');
  const [cycle, setCycle] = useState('');
  const [serie, setSerie] = useState('');
  const [typeEnseignement, setTypeEnseignement] = useState('general');
  const [typeParClasse, setTypeParClasse] = useState<Record<string, string>>({});
  const [espaceForm, setEspaceForm] = useState('');
  const { pret, filtrer, actifs, formule, visibles, espace, classeVisible } = useEspace();
  const [selection, setSelection] = useState<Record<string, Selection>>({});
  const [classeModele, setClasseModele] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', user.id)
        .single();
      if (profileError) throw new Error(`Erreur profil : ${profileError.message}`);

      setEtablissementId(profile.etablissement_id);

      const { data: etab, error: etabError } = await supabase
        .from('etablissements')
        .select('annee_scolaire_active, formule_superieur')
        .eq('id', profile.etablissement_id)
        .single();
      if (etabError) throw new Error(`Erreur établissement : ${etabError.message}`);

      setAnneeActive(etab.annee_scolaire_active);
      setFormuleSup(etab.formule_superieur ?? '');

      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, nom, niveau, cycle, serie, annee_scolaire')
        .eq('etablissement_id', profile.etablissement_id)
        .eq('annee_scolaire', etab.annee_scolaire_active)
        .order('niveau');
      if (classesError) throw new Error(`Erreur classes : ${classesError.message}`);

      setClasses(classesData ?? []);

      // Type d'enseignement des classes (sans jamais bloquer la page si le script SQL n'est pas installé).
      const { data: typesData, error: erreurTypes } = await supabase
        .from('classes')
        .select('id, type_enseignement')
        .eq('etablissement_id', profile.etablissement_id)
        .eq('annee_scolaire', etab.annee_scolaire_active);
      if (!erreurTypes) {
        const table: Record<string, string> = {};
        (typesData ?? []).forEach((c: any) => {
          table[c.id] = c.type_enseignement || 'general';
        });
        setTypeParClasse(table);
      }

      const { data: matieresData, error: matieresError } = await supabase
        .from('matieres')
        .select('id, nom, coefficient_defaut')
        .eq('etablissement_id', profile.etablissement_id)
        .order('nom');
      if (matieresError) throw new Error(`Erreur matières : ${matieresError.message}`);

      setMatieresEtablissement(matieresData ?? []);

      const selectionInitiale: Record<string, Selection> = {};
      (matieresData ?? []).forEach((m) => {
        selectionInitiale[m.id] = { checked: false, coefficient: m.coefficient_defaut ?? 1 };
      });
      setSelection(selectionInitiale);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Espace proposé par défaut dans le formulaire : celui choisi en haut, sinon le premier.
  useEffect(() => {
    if (!pret || !filtrer) return;
    if (!espaceForm || !visibles.includes(espaceForm as any)) {
      setEspaceForm(espace || visibles[0] || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret, filtrer, espace, visibles.join(',')]);

  // Cycle et type cohérents avec l'espace du formulaire
  useEffect(() => {
    if (!filtrer) return;
    const def = espaceDef(espaceForm);
    if (!def) return;
    if (cycle && !(def.cycles as string[]).includes(cycle)) setCycle(def.cycles.length === 1 ? def.cycles[0] : '');
    if (def.cycles.length === 1 && !cycle) setCycle(def.cycles[0]);
    if (!(def.types as string[]).includes(typeEnseignement)) setTypeEnseignement(def.types[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [espaceForm, filtrer, cycle]);

  useEffect(() => {
    if (cycle !== 'college' && cycle !== 'lycee') return;
    const conduite = matieresEtablissement.find((m) => m.nom === 'Conduite');
    if (!conduite) return;
    setSelection((prev) => ({
      ...prev,
      [conduite.id]: { checked: true, coefficient: 1 },
    }));
  }, [cycle, matieresEtablissement]);

  // École technique et professionnelle uniquement : le type par défaut n'est pas « général »
  useEffect(() => {
    if (!formule || formule.types.length === 0) return;
    if (!(formule.types as string[]).includes(typeEnseignement)) setTypeEnseignement(formule.types[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formule, typeEnseignement]);

  // École à un seul espace dont le cycle est unique (ex. maternelle) : le cycle se remplit tout seul.
  useEffect(() => {
    if (filtrer || actifs.length !== 1 || cycle) return;
    const def = espaceDef(actifs[0]);
    if (def && def.cycles.length === 1) setCycle(def.cycles[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrer, actifs.join(','), cycle]);

  function handleNiveauChange(valeur: string) {
    setNiveau(valeur);
    const cycleDeduit = inferCycle(valeur);
    if (cycleDeduit) {
      setCycle(cycleDeduit);
    }
  }

  function toggleMatiere(matiereId: string) {
    setSelection((prev) => ({
      ...prev,
      [matiereId]: { ...prev[matiereId], checked: !prev[matiereId]?.checked },
    }));
  }

  function modifierCoefficientSelection(matiereId: string, coefficient: number) {
    setSelection((prev) => ({
      ...prev,
      [matiereId]: { ...prev[matiereId], coefficient },
    }));
  }

  async function copierDepuisClasse(classeId: string) {
    setClasseModele(classeId);
    if (!classeId) return;

    const { data: matieresClasse, error: err } = await supabase
      .from('classes_matieres')
      .select('matiere_id, coefficient')
      .eq('classe_id', classeId);

    if (err) {
      setError(`Erreur copie des matières : ${err.message}`);
      return;
    }

    setSelection((prev) => {
      const copie = { ...prev };
      Object.keys(copie).forEach((id) => {
        copie[id] = { ...copie[id], checked: false };
      });
      (matieresClasse ?? []).forEach((mc) => {
        if (copie[mc.matiere_id]) {
          copie[mc.matiere_id] = { checked: true, coefficient: mc.coefficient };
        }
      });
      return copie;
    });
  }

  async function creerClasse() {
    if (!nom.trim() || !niveau.trim() || !etablissementId) {
      setError('Nom et niveau sont obligatoires.');
      return;
    }

    setSaving(true);
    setError(null);
    setSucces(null);

    const { data: classeCreee, error: insertError } = await supabase
      .from('classes')
      .insert({
        etablissement_id: etablissementId,
        nom: nom.trim(),
        niveau: niveau.trim(),
        cycle: cycle || null,
        serie: serie.trim() || null,
        annee_scolaire: anneeActive,
        // Envoyé seulement s'il n'est pas « général » : rien ne change tant que le SQL n'est pas installé
        ...((filtrer || formuleActive) && typeEnseignement !== 'general' ? { type_enseignement: typeEnseignement } : {}),
      })
      .select('id')
      .single();

    if (insertError || !classeCreee) {
      setSaving(false);
      setError(`Erreur création : ${insertError?.message}`);
      return;
    }

    const matieresACreer = Object.entries(selection)
      .filter(([, sel]) => sel.checked)
      .map(([matiereId, sel]) => ({
        classe_id: classeCreee.id,
        matiere_id: matiereId,
        coefficient: sel.coefficient,
      }));

    if (matieresACreer.length > 0) {
      const { error: matieresError } = await supabase
        .from('classes_matieres')
        .insert(matieresACreer);

      if (matieresError) {
        setSaving(false);
        setError(`Classe créée, mais erreur lors de l'ajout des matières : ${matieresError.message}`);
        charger();
        return;
      }
    }

    setSaving(false);
    setSucces(
      matieresACreer.length > 0
        ? `Classe créée avec ${matieresACreer.length} matière(s).`
        : 'Classe créée sans matière. Tu pourras en ajouter depuis la page "Matières".'
    );
    setNom('');
    setNiveau('');
    setCycle('');
    setSerie('');
    setTypeEnseignement('general');
    setClasseModele('');
    charger();
  }

  async function supprimerClasse(id: string, nomClasse: string) {
    const confirmation = window.confirm(
      `Supprimer la classe "${nomClasse}" ? Cette action est irréversible.`
    );
    if (!confirmation) return;

    const { error: deleteError } = await supabase.from('classes').delete().eq('id', id);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    charger();
  }

  // École à un seul espace : on ne propose que les cycles de cet espace.
  // École du secondaire avec formule : cycles et types limités à ce qu'elle a choisi.
  const espaceUnique = !filtrer && actifs.length === 1 ? espaceDef(actifs[0]) : undefined;
  const defForm = filtrer ? espaceDef(espaceForm) : espaceUnique;
  const formuleActive = defForm?.code === 'secondaire' ? formule : null;

  // Supérieur : grande école ou université LMD (niveaux et filières adaptés)
  const defSup = defForm?.code === 'superieur' ? FORMULES_SUPERIEUR.find((f) => f.code === formuleSup) : undefined;

  const cyclesPermis = (c: string) =>
    (!defForm || (defForm.cycles as string[]).includes(c)) &&
    (!formuleActive || (formuleActive.cycles as string[]).includes(c));
  const cyclesProposes = defForm
    ? CYCLES_LEGACY.filter((c) => c.value !== '' && cyclesPermis(c.value))
    : CYCLES_LEGACY;
  const typesProposes = formuleActive ? formuleActive.types : defForm?.types ?? [];
  const niveauxPermis = (n: string) => {
    const c = inferCycle(n); // '1ère année', CAP... : cycle non déduit, on les laisse
    return !formuleActive || !c || (formuleActive.cycles as string[]).includes(c);
  };

  const classesAffichees = classes.filter((c) => classeVisible(c.cycle, typeParClasse[c.id], c.niveau));
  const nbSelectionnees = Object.values(selection).filter((s) => s.checked).length;

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Classes</h1>
      <p className="text-sm text-gray-500 mb-4">Année scolaire {anneeActive}</p>

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

      {/* Liste des classes */}
      <div className="border rounded-lg overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Classe</th>
              <th className="text-left px-3 py-2">Niveau</th>
              <th className="text-left px-3 py-2">Cycle</th>
              <th className="px-3 py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {classesAffichees.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                  Aucune classe créée.
                </td>
              </tr>
            ) : (
              classesAffichees.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {c.nom}
                    {c.serie && <span className="text-gray-400 text-xs ml-1">({c.serie})</span>}
                    {typeParClasse[c.id] && typeParClasse[c.id] !== 'general' && (
                      <span className="ml-1 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                        {typeParClasse[c.id] === 'technique' ? 'Technique' : 'Professionnel'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{c.niveau}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">
                    {(c.cycle && CYCLES_LABEL[c.cycle]) || '-'}
                  </td>
                  <td className="px-3 py-2 flex gap-3 justify-end whitespace-nowrap">
                    <Link href={`/chef/bulletins/classe/${c.id}`} className="text-blue-600 text-xs">
                      Bulletins
                    </Link>
                    <Link href={`/chef/classes/${c.id}/eleves`} className="text-blue-600 text-xs">
                      Élèves
                    </Link>
                    <Link href={`/chef/classes/${c.id}/matieres`} className="text-blue-600 text-xs">
                      Matières
                    </Link>
                    <Link href={`/chef/classes/${c.id}/enseignants`} className="text-blue-600 text-xs">
                      Enseignants
                    </Link>
                    <button
                      onClick={() => supprimerClasse(c.id, c.nom)}
                      className="text-red-600 text-xs"
                    >
                      Suppr.
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Créer une classe */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-3">Créer une classe</p>

        <div className="space-y-3">
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder={defSup ? 'Nom de la classe (ex: Génie civil 1ère année, Licence 1 Droit)' : 'Nom de la classe (ex: 6ème A, 6e 2, Tle D5...)'}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />

          {filtrer && (
            <select
              value={espaceForm}
              onChange={(e) => setEspaceForm(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {ESPACES.filter((e) => visibles.includes(e.code)).map((e) => (
                <option key={e.code} value={e.code}>
                  {e.icone} {e.label}
                </option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              list="niveaux-suggestions"
              value={niveau}
              onChange={(e) => handleNiveauChange(e.target.value)}
              placeholder="Niveau (ex: 6ème)"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <datalist id="niveaux-suggestions">
              {(defSup?.niveaux ?? defForm?.niveauxParType?.[typeEnseignement as 'general' | 'technique' | 'professionnel'] ?? defForm?.niveaux ?? []).filter(niveauxPermis).map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            <select
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {cyclesProposes.length > 1 && !cyclesProposes.some((c) => c.value === '') && (
                <option value="">Cycle (selon le niveau)</option>
              )}
              {cyclesProposes.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {typesProposes.length > 1 && (
            <select
              value={typeEnseignement}
              onChange={(e) => setTypeEnseignement(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {typesProposes.map((t) => (
                <option key={t} value={t}>{TYPES_LABEL[t]}</option>
              ))}
            </select>
          )}

          <input
            type="text"
            list="filieres-suggestions"
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            placeholder={(() => {
              const sugg = defSup?.filieres ?? defForm?.seriesParType?.[typeEnseignement as 'general' | 'technique' | 'professionnel'] ?? defForm?.series ?? [];
              if (defSup) return sugg.length ? `Filière (ex: ${sugg.slice(0, 3).join(', ')})` : 'Filière';
              return sugg.length ? `Série ou filière (ex: ${sugg.slice(0, 3).join(', ')})` : 'Série (optionnel, ex: A2, C, D)';
            })()}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <datalist id="filieres-suggestions">
            {(defSup?.filieres ?? defForm?.seriesParType?.[typeEnseignement as 'general' | 'technique' | 'professionnel'] ?? defForm?.series ?? []).map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>

          {/* Sélection des matières */}
          <div className="border-t pt-3">
            <p className="text-xs text-gray-600 mb-2">
              Matières de la classe ({nbSelectionnees} sélectionnée{nbSelectionnees > 1 ? 's' : ''})
            </p>

            {classes.length > 0 && (
              <select
                value={classeModele}
                onChange={(e) => copierDepuisClasse(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm mb-3"
              >
                <option value="">Copier les matières depuis une classe existante...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            )}

            {matieresEtablissement.length === 0 ? (
              <p className="text-xs text-gray-400">
                Aucune matière n'existe encore pour cet établissement. Tu pourras en créer depuis
                la page "Matières" d'une classe.
              </p>
    ) : (
              <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                {matieresEtablissement.map((m) => {
                  const sel = selection[m.id] ?? { checked: false, coefficient: m.coefficient_defaut ?? 1 };
                  return (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={sel.checked}
                        onChange={() => toggleMatiere(m.id)}
                      />
                      <span className="flex-1">{m.nom}</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={sel.coefficient}
                        onChange={(e) =>
                          modifierCoefficientSelection(m.id, parseFloat(e.target.value) || 0)
                        }
                        disabled={!sel.checked}
                        className="w-14 border rounded px-1 py-0.5 text-center text-xs disabled:opacity-40"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={creerClasse}
            disabled={saving || !nom.trim() || !niveau.trim()}
            className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Création...' : 'Créer la classe'}
          </button>
        </div>
      </div>
    </main>
  );
}
