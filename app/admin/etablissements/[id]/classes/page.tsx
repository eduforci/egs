'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Classe = { id: string; nom: string; niveau: string; annee_scolaire: string };

const NIVEAUX_COLLEGE = ['6ème', '5ème', '4ème', '3ème'];
const NIVEAUX_LYCEE = ['Seconde', 'Première', 'Terminale'];
const NIVEAUX_PRIMAIRE = ['CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2'];
const NIVEAUX_MATERNELLE = ['Petite Section', 'Moyenne Section', 'Grande Section'];

export default function GererClassesEtablissement() {
  const params = useParams();
  const etablissementId = params?.id as string;

  const [etablissementNom, setEtablissementNom] = useState('');
  const [anneeScolaireActive, setAnneeScolaireActive] = useState('');
  const [classes, setClasses] = useState<Classe[]>([]);

  const [niveau, setNiveau] = useState('');
  const [suffixe, setSuffixe] = useState('A');
  const [creationEnCours, setCreationEnCours] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const supabase = createClient();

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: etabData, error: etabError } = await supabase
        .from('etablissements')
        .select('nom, annee_scolaire_active')
        .eq('id', etablissementId)
        .single();

      if (etabError) throw new Error(`Erreur établissement : ${etabError.message}`);
      setEtablissementNom(etabData.nom);
      setAnneeScolaireActive(etabData.annee_scolaire_active);

      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, nom, niveau, annee_scolaire')
        .eq('etablissement_id', etablissementId)
        .order('niveau', { ascending: true });

      if (classesError) throw new Error(`Erreur classes : ${classesError.message}`);
      setClasses(classesData ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [etablissementId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creerClasse() {
    if (!niveau) {
      setError('Choisis un niveau.');
      return;
    }
    setCreationEnCours(true);
    setError(null);
    setSucces(null);

    const nom = `${niveau} ${suffixe}`.trim();

    const { error: insertError } = await supabase.from('classes').insert({
      etablissement_id: etablissementId,
      nom,
      niveau,
      annee_scolaire: anneeScolaireActive,
    });

    setCreationEnCours(false);

    if (insertError) {
      setError(`Erreur création : ${insertError.message}`);
      return;
    }

    setSucces(`Classe "${nom}" créée.`);
    setNiveau('');
    setSuffixe('A');
    charger();
  }

  async function supprimerClasse(id: string, nom: string) {
    const confirmation = window.confirm(
      `Supprimer la classe "${nom}" ? Cette action est irréversible et supprimera aussi les élèves qui y sont rattachés.`
    );
    if (!confirmation) return;

    const { error: deleteError } = await supabase.from('classes').delete().eq('id', id);

    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    setSucces(`Classe "${nom}" supprimée.`);
    charger();
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  const tousLesNiveaux = [
    { groupe: 'Maternelle', niveaux: NIVEAUX_MATERNELLE },
    { groupe: 'Primaire', niveaux: NIVEAUX_PRIMAIRE },
    { groupe: 'Collège', niveaux: NIVEAUX_COLLEGE },
    { groupe: 'Lycée', niveaux: NIVEAUX_LYCEE },
  ];

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Classes — {etablissementNom}</h1>
      <p className="text-sm text-gray-500 mb-4">
        Année scolaire active : {anneeScolaireActive}
      </p>

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

      {/* Liste des classes existantes */}
      <div className="border rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Classe</th>
              <th className="text-left px-3 py-2">Année</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-gray-400">
                  Aucune classe pour le moment.
                </td>
              </tr>
            ) : (
              classes.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2">{c.nom}</td>
                  <td className="px-3 py-2 text-gray-500">{c.annee_scolaire}</td>
                  <td className="px-3 py-2">
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

      {/* Créer une nouvelle classe */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-3">Créer une classe</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Niveau</label>
            <select
              value={niveau}
              onChange={(e) => setNiveau(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Choisir un niveau</option>
              {tousLesNiveaux.map((groupe) => (
                <optgroup key={groupe.groupe} label={groupe.groupe}>
                  {groupe.niveaux.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Section / Suffixe (ex: A, B, C)</label>
            <input
              type="text"
              value={suffixe}
              onChange={(e) => setSuffixe(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="A"
            />
          </div>

          <button
            onClick={creerClasse}
            disabled={creationEnCours || !niveau}
            className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-50"
          >
            {creationEnCours ? 'Création...' : `Créer "${niveau} ${suffixe}".trim()`}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Une fois une classe créée, va dans sa page de gestion des matières pour lui attacher
        les matières et coefficients.
      </p>
    </main>
  );
}
