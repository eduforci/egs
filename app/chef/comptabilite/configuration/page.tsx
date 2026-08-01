'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Item = { id: string; nom: string; ordre: number };

export default function ComptabiliteConfigurationPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Item[]>([]);
  const [modes, setModes] = useState<Item[]>([]);

  const [nouvelleCategorie, setNouvelleCategorie] = useState('');
  const [nouveauMode, setNouveauMode] = useState('');

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

      const { data: cats, error: catsError } = await supabase
        .from('categories_frais')
        .select('id, nom, ordre')
        .eq('etablissement_id', profile.etablissement_id)
        .order('ordre');

      if (catsError) throw new Error(`Erreur catégories : ${catsError.message}`);
      setCategories(cats ?? []);

      const { data: modesData, error: modesError } = await supabase
        .from('modes_paiement')
        .select('id, nom, ordre')
        .eq('etablissement_id', profile.etablissement_id)
        .order('ordre');

      if (modesError) throw new Error(`Erreur modes : ${modesError.message}`);
      setModes(modesData ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouterCategorie() {
    if (!nouvelleCategorie.trim() || !etablissementId) return;
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('categories_frais').insert({
      etablissement_id: etablissementId,
      nom: nouvelleCategorie.trim(),
      ordre: categories.length + 1,
    });

    setSaving(false);
    if (insertError) {
      setError(
        insertError.message.includes('duplicate')
          ? 'Cette catégorie existe déjà.'
          : `Erreur : ${insertError.message}`
      );
      return;
    }
    setNouvelleCategorie('');
    setSucces('Catégorie ajoutée.');
    charger();
  }

  async function retirerCategorie(id: string) {
    const confirmation = window.confirm(
      "Retirer cette catégorie ? Les frais déjà créés avec cette catégorie seront affectés."
    );
    if (!confirmation) return;

    const { error: deleteError } = await supabase.from('categories_frais').delete().eq('id', id);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    charger();
  }

  async function ajouterMode() {
    if (!nouveauMode.trim() || !etablissementId) return;
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('modes_paiement').insert({
      etablissement_id: etablissementId,
      nom: nouveauMode.trim(),
      ordre: modes.length + 1,
    });

    setSaving(false);
    if (insertError) {
      setError(
        insertError.message.includes('duplicate')
          ? 'Ce mode de paiement existe déjà.'
          : `Erreur : ${insertError.message}`
      );
      return;
    }
    setNouveauMode('');
    setSucces('Mode de paiement ajouté.');
    charger();
  }

  async function retirerMode(id: string) {
    const { error: deleteError } = await supabase.from('modes_paiement').delete().eq('id', id);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    charger();
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Configuration comptable</h1>
      <p className="text-sm text-gray-500 mb-4">
        Catégories de frais et modes de paiement — modifiables à tout moment.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {/* Catégories de frais */}
      <div className="border rounded-lg p-4 mb-4">
        <p className="font-semibold text-sm mb-3">Catégories de frais</p>
        <div className="space-y-1 mb-3">
          {categories.map((c) => (
            <div key={c.id} className="flex justify-between items-center border-b py-1.5 text-sm">
              <span>{c.nom}</span>
              <button onClick={() => retirerCategorie(c.id)} className="text-red-600 text-xs">
                Retirer
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-gray-400">Aucune catégorie.</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={nouvelleCategorie}
            onChange={(e) => setNouvelleCategorie(e.target.value)}
            placeholder="Nouvelle catégorie (ex: Fournitures)"
            className="flex-1 border rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={ajouterCategorie}
            disabled={saving || !nouvelleCategorie.trim()}
            className="bg-black text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      </div>

      {/* Modes de paiement */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-3">Modes de paiement</p>
        <div className="space-y-1 mb-3">
          {modes.map((m) => (
            <div key={m.id} className="flex justify-between items-center border-b py-1.5 text-sm">
              <span>{m.nom}</span>
              <button onClick={() => retirerMode(m.id)} className="text-red-600 text-xs">
                Retirer
              </button>
            </div>
          ))}
          {modes.length === 0 && (
            <p className="text-sm text-gray-400">Aucun mode de paiement.</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={nouveauMode}
            onChange={(e) => setNouveauMode(e.target.value)}
            placeholder="Nouveau mode (ex: Orange Money)"
            className="flex-1 border rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={ajouterMode}
            disabled={saving || !nouveauMode.trim()}
            className="bg-black text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      </div>
    </main>
  );
         }
         
