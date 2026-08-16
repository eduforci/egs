'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Classe = {
  id: string;
  nom: string;
  niveau: string;
  cycle: string | null;
  serie: string | null;
  annee_scolaire: string;
};

const CYCLES = [
  { value: '', label: 'Non précisé' },
  { value: 'maternelle', label: 'Maternelle' },
  { value: 'primaire', label: 'Primaire' },
  { value: 'college', label: 'Collège' },
  { value: 'lycee', label: 'Lycée' },
];

export default function ClassesPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [anneeActive, setAnneeActive] = useState('');
  const [classes, setClasses] = useState<Classe[]>([]);

  const [nom, setNom] = useState('');
  const [niveau, setNiveau] = useState('');
  const [cycle, setCycle] = useState('');
  const [serie, setSerie] = useState('');

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
        .select('annee_scolaire_active')
        .eq('id', profile.etablissement_id)
        .single();

      if (etabError) throw new Error(`Erreur établissement : ${etabError.message}`);
      setAnneeActive(etab.annee_scolaire_active);

      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, nom, niveau, cycle, serie, annee_scolaire')
        .eq('etablissement_id', profile.etablissement_id)
        .eq('annee_scolaire', etab.annee_scolaire_active)
        .order('niveau');

      if (classesError) throw new Error(`Erreur classes : ${classesError.message}`);
      setClasses(classesData ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creerClasse() {
    if (!nom.trim() || !niveau.trim() || !etablissementId) {
      setError('Nom et niveau sont obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);
    setSucces(null);

    const { error: insertError } = await supabase.from('classes').insert({
      etablissement_id: etablissementId,
      nom: nom.trim(),
      niveau: niveau.trim(),
      cycle: cycle || null,
      serie: serie.trim() || null,
      annee_scolaire: anneeActive,
    });

    setSaving(false);
    if (insertError) {
      setError(`Erreur création : ${insertError.message}`);
      return;
    }

    setSucces('Classe créée.');
    setNom('');
    setNiveau('');
    setCycle('');
    setSerie('');
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
      <div className="border rounded-lg overflow-hidden mb-6">
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
            {classes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                  Aucune classe créée.
                </td>
              </tr>
            ) : (
              classes.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {c.nom}
                    {c.serie && <span className="text-gray-400 text-xs ml-1">({c.serie})</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{c.niveau}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">
                    {CYCLES.find((cy) => cy.value === c.cycle)?.label ?? '-'}
                  </td>
                  <td className="px-3 py-2 flex gap-3 justify-end whitespace-nowrap">
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
            placeholder="Nom de la classe (ex: 6ème A)"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={niveau}
              onChange={(e) => setNiveau(e.target.value)}
              placeholder="Niveau (ex: 6ème)"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <select
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {CYCLES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            placeholder="Série (optionnel, ex: A2, C, D)"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />

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
        
