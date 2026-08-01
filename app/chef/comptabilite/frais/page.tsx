'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Frais = {
  id: string; nom: string; montant: number; categorie_id: string; categorie_nom: string;
  cycle: string | null; niveau: string | null; serie: string | null; classe_id: string | null; classe_nom: string | null;
};
type Categorie = { id: string; nom: string };
type Classe = { id: string; nom: string; niveau: string; cycle: string | null };

const CYCLES = [
  { value: '', label: 'Tout l\'établissement' },
  { value: 'maternelle', label: 'Maternelle' },
  { value: 'primaire', label: 'Primaire' },
  { value: 'college', label: 'Collège' },
  { value: 'lycee', label: 'Lycée' },
];

export default function FraisScolaritePage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [anneeActive, setAnneeActive] = useState('');
  const [frais, setFrais] = useState<Frais[]>([]);
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [classes, setClasses] = useState<Classe[]>([]);
  const [niveaux, setNiveaux] = useState<string[]>([]);

  const [nom, setNom] = useState('');
  const [montant, setMontant] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [cycle, setCycle] = useState('');
  const [niveau, setNiveau] = useState('');
  const [serie, setSerie] = useState('');
  const [classeId, setClasseId] = useState('');

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

      const { data: cats, error: catsError } = await supabase
        .from('categories_frais')
        .select('id, nom')
        .eq('etablissement_id', profile.etablissement_id)
        .order('ordre');

      if (catsError) throw new Error(`Erreur catégories : ${catsError.message}`);
      setCategories(cats ?? []);

      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, nom, niveau, cycle')
        .eq('etablissement_id', profile.etablissement_id)
        .order('niveau');

      if (classesError) throw new Error(`Erreur classes : ${classesError.message}`);
      setClasses(classesData ?? []);
      setNiveaux(Array.from(new Set((classesData ?? []).map((c) => c.niveau))));

      const { data: fraisData, error: fraisError } = await supabase
        .from('grille_frais')
        .select('id, nom, montant, categorie_id, cycle, niveau, serie, classe_id, categories_frais(nom), classes(nom)')
        .eq('etablissement_id', profile.etablissement_id)
        .eq('annee_scolaire', etab.annee_scolaire_active);

      if (fraisError) throw new Error(`Erreur frais : ${fraisError.message}`);

      type Row = {
        id: string; nom: string; montant: number; categorie_id: string;
        cycle: string | null; niveau: string | null; serie: string | null; classe_id: string | null;
        categories_frais: { nom: string } | { nom: string }[] | null;
        classes: { nom: string } | { nom: string }[] | null;
      };
      const liste: Frais[] = ((fraisData ?? []) as unknown as Row[]).map((r) => {
        const cat = Array.isArray(r.categories_frais) ? r.categories_frais[0] : r.categories_frais;
        const cl = Array.isArray(r.classes) ? r.classes[0] : r.classes;
        return {
          id: r.id, nom: r.nom, montant: r.montant, categorie_id: r.categorie_id,
          categorie_nom: cat?.nom ?? 'Inconnue',
          cycle: r.cycle, niveau: r.niveau, serie: r.serie,
          classe_id: r.classe_id, classe_nom: cl?.nom ?? null,
        };
      });
      setFrais(liste);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creerFrais() {
    if (!nom.trim() || !montant || !categorieId || !etablissementId) {
      setError('Nom, montant et catégorie sont obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('grille_frais').insert({
      etablissement_id: etablissementId,
      categorie_id: categorieId,
      nom: nom.trim(),
      montant: parseFloat(montant) || 0,
      annee_scolaire: anneeActive,
      cycle: cycle || null,
      niveau: niveau || null,
      serie: serie || null,
      classe_id: classeId || null,
    });

    setSaving(false);
    if (insertError) {
      setError(`Erreur création : ${insertError.message}`);
      return;
    }

    setSucces('Frais créé.');
    setNom('');
    setMontant('');
    setCycle('');
    setNiveau('');
    setSerie('');
    setClasseId('');
    charger();
  }

  async function supprimerFrais(id: string) {
    const confirmation = window.confirm('Supprimer ce frais ?');
    if (!confirmation) return;

    const { error: deleteError } = await supabase.from('grille_frais').delete().eq('id', id);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    charger();
  }

  function cibleTexte(f: Frais): string {
    if (f.classe_nom) return f.classe_nom;
    const parts = [];
    if (f.cycle) parts.push(CYCLES.find((c) => c.value === f.cycle)?.label ?? f.cycle);
    if (f.niveau) parts.push(f.niveau);
    if (f.serie) parts.push(`Série ${f.serie}`);
    return parts.length > 0 ? parts.join(' — ') : 'Tout l\'établissement';
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Frais de scolarité</h1>
      <p className="text-sm text-gray-500 mb-4">Année scolaire {anneeActive}</p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {/* Liste des frais existants */}
      <div className="border rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Frais</th>
              <th className="text-left px-3 py-2">Cible</th>
              <th className="text-left px-3 py-2">Montant</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {frais.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Aucun frais configuré.</td></tr>
            ) : (
              frais.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="px-3 py-2">
                    {f.nom}
                    <span className="block text-[10px] text-gray-400">{f.categorie_nom}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{cibleTexte(f)}</td>
                  <td className="px-3 py-2">{f.montant.toLocaleString('fr-FR')} F</td>
                  <td className="px-3 py-2">
                    <button onClick={() => supprimerFrais(f.id)} className="text-red-600 text-xs">
                      Suppr.
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Créer un frais */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-3">Créer un frais</p>
        <div className="space-y-3">
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom du frais (ex: Scolarité Trimestre 1)"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              value={categorieId}
              onChange={(e) => setCategorieId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Catégorie...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
            <input
              type="number"
              step="1"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Montant (FCFA)"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-gray-600 mb-2">
              Cible (laisse tout vide pour appliquer à tout l'établissement)
            </p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select
                value={cycle}
                onChange={(e) => { setCycle(e.target.value); setNiveau(''); setClasseId(''); }}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                {CYCLES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <select
                value={niveau}
                onChange={(e) => { setNiveau(e.target.value); setClasseId(''); }}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Tous niveaux</option>
                {niveaux.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={serie}
                onChange={(e) => setSerie(e.target.value)}
                placeholder="Série (optionnel, ex: A2)"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <select
                value={classeId}
                onChange={(e) => setClasseId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Classe précise (optionnel)</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={creerFrais}
            disabled={saving || !nom.trim() || !montant || !categorieId}
            className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Création...' : 'Créer le frais'}
          </button>
        </div>
      </div>
    </main>
  );
          }
        
