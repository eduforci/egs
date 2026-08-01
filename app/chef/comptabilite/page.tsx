'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type LigneAttendu = {
  frais_id: string;
  frais_nom: string;
  categorie_nom: string;
  montant_unitaire: number;
  nb_eleves_concernes: number;
  montant_total: number;
};

export default function ComptabiliteDashboardPage() {
  const supabase = createClient();

  const [etablissementNom, setEtablissementNom] = useState('');
  const [anneeActive, setAnneeActive] = useState('');
  const [nbCategories, setNbCategories] = useState(0);
  const [nbModes, setNbModes] = useState(0);
  const [nbFrais, setNbFrais] = useState(0);
  const [detailAttendu, setDetailAttendu] = useState<LigneAttendu[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const { data: etab, error: etabError } = await supabase
        .from('etablissements')
        .select('nom, annee_scolaire_active')
        .eq('id', profile.etablissement_id)
        .single();

      if (etabError) throw new Error(`Erreur établissement : ${etabError.message}`);
      setEtablissementNom(etab.nom);
      setAnneeActive(etab.annee_scolaire_active);

      const [catsRes, modesRes, fraisRes, attenduRes] = await Promise.all([
        supabase.from('categories_frais').select('id', { count: 'exact', head: true }).eq('etablissement_id', profile.etablissement_id),
        supabase.from('modes_paiement').select('id', { count: 'exact', head: true }).eq('etablissement_id', profile.etablissement_id),
        supabase.from('grille_frais').select('id', { count: 'exact', head: true }).eq('etablissement_id', profile.etablissement_id).eq('annee_scolaire', etab.annee_scolaire_active),
        supabase.rpc('calculer_montant_attendu', { p_etablissement_id: profile.etablissement_id, p_annee_scolaire: etab.annee_scolaire_active }),
      ]);

      setNbCategories(catsRes.count ?? 0);
      setNbModes(modesRes.count ?? 0);
      setNbFrais(fraisRes.count ?? 0);

      if (attenduRes.error) throw new Error(`Erreur montant attendu : ${attenduRes.error.message}`);
      setDetailAttendu((attenduRes.data as LigneAttendu[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const montantTotalAttendu = detailAttendu.reduce((sum, l) => sum + l.montant_total, 0);

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Comptabilité — {etablissementNom}</h1>
      <p className="text-sm text-gray-500 mb-4">Année scolaire {anneeActive}</p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}

      {/* Liens rapides */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <Link href="/chef/comptabilite/configuration" className="border rounded-lg p-3 text-center text-sm font-medium hover:bg-gray-50">
          Configuration
        </Link>
        <Link href="/chef/comptabilite/frais" className="border rounded-lg p-3 text-center text-sm font-medium hover:bg-gray-50">
          Frais de scolarité
        </Link>
      </div>

      {/* Indicateurs de base */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-lg font-bold">{nbCategories}</p>
          <p className="text-[10px] text-gray-500">Catégories de frais</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-lg font-bold">{nbModes}</p>
          <p className="text-[10px] text-gray-500">Modes de paiement</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-lg font-bold">{nbFrais}</p>
          <p className="text-[10px] text-gray-500">Frais configurés</p>
        </div>
      </div>

      {/* Montant attendu */}
      <div className="border-2 border-black rounded-lg p-4 mb-6 text-center">
        <p className="text-xs text-gray-500 uppercase mb-1">Montant total attendu (année {anneeActive})</p>
        <p className="text-2xl font-bold">{montantTotalAttendu.toLocaleString('fr-FR')} F</p>
        <p className="text-xs text-gray-400 mt-1">
          Calculé à partir des effectifs actuels et des frais configurés
        </p>
      </div>

      {/* Détail par frais */}
      <div className="border rounded-lg overflow-hidden">
        <p className="bg-gray-100 px-3 py-2 text-sm font-semibold">Détail par frais</p>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Frais</th>
              <th className="text-left px-3 py-2">Élèves</th>
              <th className="text-left px-3 py-2">Montant</th>
            </tr>
          </thead>
          <tbody>
            {detailAttendu.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">Aucun frais configuré pour le moment.</td></tr>
            ) : (
              detailAttendu.map((l) => (
                <tr key={l.frais_id} className="border-t">
                  <td className="px-3 py-2">
                    {l.frais_nom}
                    <span className="block text-[10px] text-gray-400">{l.categorie_nom}</span>
                  </td>
                  <td className="px-3 py-2">{l.nb_eleves_concernes}</td>
                  <td className="px-3 py-2">{l.montant_total.toLocaleString('fr-FR')} F</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Les indicateurs de caisse, recettes et paiements seront disponibles avec les prochaines phases
        (Paiements, Caisse, Rapports financiers).
      </p>
    </main>
  );
          }
        
