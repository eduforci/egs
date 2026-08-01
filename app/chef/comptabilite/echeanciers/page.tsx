'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Echeancier = { id: string; nom: string; type: string; nombre_echeances: number };
type GrilleFrais = { id: string; nom: string; montant: number };

const TYPES = [
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'trimestriel', label: 'Trimestriel' },
  { value: 'semestriel', label: 'Semestriel' },
  { value: 'personnalise', label: 'Personnalisé' },
];

export default function EcheanciersPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [echeanciers, setEcheanciers] = useState<Echeancier[]>([]);
  const [grille, setGrille] = useState<GrilleFrais[]>([]);

  const [nom, setNom] = useState('');
  const [type, setType] = useState('mensuel');
  const [nbEcheances, setNbEcheances] = useState('3');

  const [grilleChoisie, setGrilleChoisie] = useState('');
  const [dateEcheance, setDateEcheance] = useState('');

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

      const { data: echData, error: echError } = await supabase
        .from('echeanciers')
        .select('id, nom, type, nombre_echeances')
        .eq('etablissement_id', profile.etablissement_id);

      if (echError) throw new Error(`Erreur échéanciers : ${echError.message}`);
      setEcheanciers(echData ?? []);

      const { data: grilleData, error: grilleError } = await supabase
        .from('grille_frais')
        .select('id, nom, montant')
        .eq('etablissement_id', profile.etablissement_id);

      if (grilleError) throw new Error(`Erreur grille : ${grilleError.message}`);
      setGrille(grilleData ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creerEcheancier() {
    if (!nom.trim() || !etablissementId) return;
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('echeanciers').insert({
      etablissement_id: etablissementId,
      nom: nom.trim(),
      type,
      nombre_echeances: parseInt(nbEcheances) || 1,
    });

    setSaving(false);
    if (insertError) {
      setError(`Erreur : ${insertError.message}`);
      return;
    }
    setSucces('Échéancier créé.');
    setNom('');
    setNbEcheances('3');
    charger();
  }

  async function retirerEcheancier(id: string) {
    const { error: deleteError } = await supabase.from('echeanciers').delete().eq('id', id);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    charger();
  }

  async function genererFrais() {
    if (!grilleChoisie || !dateEcheance) {
      setError('Choisis un frais de la grille et une date d\'échéance.');
      return;
    }
    setSaving(true);
    setError(null);
    setSucces(null);

    const { data, error: rpcError } = await supabase.rpc('generer_frais_depuis_grille', {
      p_grille_frais_id: grilleChoisie,
      p_date_echeance: dateEcheance,
    });

    setSaving(false);
    if (rpcError) {
      setError(`Erreur génération : ${rpcError.message}`);
      return;
    }
    setSucces(`${data} frais généré(s) pour les élèves concernés (les élèves ayant déjà ce frais n'ont pas été dupliqués).`);
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Échéanciers</h1>
      <p className="text-sm text-gray-500 mb-4">
        Modèles de découpage des frais en plusieurs échéances, et génération des frais élèves.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {/* Générer les frais depuis la grille */}
      <div className="border rounded-lg p-4 mb-6">
        <p className="font-semibold text-sm mb-1">Générer les frais pour les élèves</p>
        <p className="text-xs text-gray-500 mb-3">
          Crée automatiquement une ligne de frais pour chaque élève concerné par ce tarif de la grille.
        </p>
        <div className="space-y-2">
          <select
            value={grilleChoisie}
            onChange={(e) => setGrilleChoisie(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Choisir un frais de la grille</option>
            {grille.map((g) => (
              <option key={g.id} value={g.id}>{g.nom} — {g.montant.toLocaleString('fr-FR')} F</option>
            ))}
          </select>
          <input
            type="date"
            value={dateEcheance}
            onChange={(e) => setDateEcheance(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={genererFrais}
            disabled={saving || !grilleChoisie || !dateEcheance}
            className="w-full bg-blue-600 text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            {saving ? 'Génération...' : 'Générer pour les élèves concernés'}
          </button>
        </div>
      </div>

      {/* Liste des échéanciers */}
      <div className="border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Nom</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Échéances</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {echeanciers.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Aucun échéancier.</td></tr>
            ) : (
              echeanciers.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-2">{e.nom}</td>
                  <td className="px-3 py-2 text-gray-500">{TYPES.find((t) => t.value === e.type)?.label}</td>
                  <td className="px-3 py-2">{e.nombre_echeances}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => retirerEcheancier(e.id)} className="text-red-600 text-xs">
                      Suppr.
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Créer un échéancier */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-3">Créer un échéancier</p>
        <div className="space-y-2">
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom (ex: Paiement en 3 fois)"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={nbEcheances}
              onChange={(e) => setNbEcheances(e.target.value)}
              placeholder="Nombre d'échéances"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={creerEcheancier}
            disabled={saving || !nom.trim()}
            className="w-full bg-black text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            Créer
          </button>
        </div>
      </div>
    </main>
  );
        }
          
