'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { chargerContexteEcole } from '@/lib/services-scolaires';

type Vehicule = {
  id: string; immatriculation: string; libelle: string | null; capacite: number;
  chauffeur_nom: string | null; chauffeur_telephone: string | null; actif: boolean;
};

export default function VehiculesPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [immat, setImmat] = useState('');
  const [libelle, setLibelle] = useState('');
  const [capacite, setCapacite] = useState('');
  const [chauffeur, setChauffeur] = useState('');
  const [telephone, setTelephone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ctx = await chargerContexteEcole(supabase);
      setEtablissementId(ctx.etablissementId);
      const { data, error: e } = await supabase
        .from('transport_vehicules')
        .select('id, immatriculation, libelle, capacite, chauffeur_nom, chauffeur_telephone, actif')
        .eq('etablissement_id', ctx.etablissementId)
        .order('immatriculation');
      if (e) throw new Error(`Erreur véhicules : ${e.message}`);
      setVehicules((data ?? []) as Vehicule[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { charger(); }, [charger]);

  async function ajouter() {
    const places = parseInt(capacite, 10);
    if (!immat.trim() || !places || places <= 0) {
      setError("L'immatriculation et une capacité supérieure à 0 sont obligatoires.");
      return;
    }
    setSaving(true); setError(null);
    const { error: e } = await supabase.from('transport_vehicules').insert({
      etablissement_id: etablissementId,
      immatriculation: immat.trim().toUpperCase(),
      libelle: libelle.trim() || null,
      capacite: places,
      chauffeur_nom: chauffeur.trim() || null,
      chauffeur_telephone: telephone.trim() || null,
    });
    setSaving(false);
    if (e) { setError(`Erreur création : ${e.message}`); return; }
    setImmat(''); setLibelle(''); setCapacite(''); setChauffeur(''); setTelephone('');
    charger();
  }

  async function basculer(v: Vehicule) {
    const { error: e } = await supabase.from('transport_vehicules').update({ actif: !v.actif }).eq('id', v.id);
    if (e) { setError(`Erreur : ${e.message}`); return; }
    charger();
  }

  async function supprimer(id: string) {
    if (!window.confirm('Supprimer ce véhicule ? Les circuits qui l\'utilisent resteront sans véhicule.')) return;
    const { error: e } = await supabase.from('transport_vehicules').delete().eq('id', id);
    if (e) { setError(`Erreur suppression : ${e.message}`); return; }
    charger();
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-3">Transport : véhicules</h1>

      <div className="flex gap-2 mb-4 text-sm flex-wrap">
        <Link href="/chef/transport" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Circuits</Link>
        <span className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white">Véhicules</span>
        <Link href="/chef/transport/inscriptions" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Inscriptions</Link>
        <Link href="/chef/transport/embarquement" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Embarquement</Link>
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}

      <div className="border rounded-lg overflow-x-auto bg-white mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Véhicule</th>
              <th className="text-left px-3 py-2">Places</th>
              <th className="text-left px-3 py-2">Chauffeur</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {vehicules.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Aucun véhicule.</td></tr>
            ) : vehicules.map((v) => (
              <tr key={v.id} className={`border-t ${v.actif ? '' : 'opacity-50'}`}>
                <td className="px-3 py-2">
                  {v.immatriculation}
                  {v.libelle && <span className="block text-[10px] text-gray-400">{v.libelle}</span>}
                </td>
                <td className="px-3 py-2">{v.capacite}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {v.chauffeur_nom || '-'}
                  {v.chauffeur_telephone && <span className="block text-gray-400">{v.chauffeur_telephone}</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  <button onClick={() => basculer(v)} className="text-xs text-gray-600 mr-3">{v.actif ? 'Désactiver' : 'Activer'}</button>
                  <button onClick={() => supprimer(v.id)} className="text-red-600 text-xs">Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border rounded-lg p-4 bg-white">
        <p className="font-semibold text-sm mb-3">Ajouter un véhicule</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={immat} onChange={(e) => setImmat(e.target.value)} placeholder="Immatriculation"
            className="border rounded-md px-3 py-2 text-sm" />
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Nom (ex : Bus 1)"
            className="border rounded-md px-3 py-2 text-sm" />
          <input type="number" min="1" value={capacite} onChange={(e) => setCapacite(e.target.value)}
            placeholder="Nombre de places" className="border rounded-md px-3 py-2 text-sm" />
          <input value={chauffeur} onChange={(e) => setChauffeur(e.target.value)} placeholder="Chauffeur (optionnel)"
            className="border rounded-md px-3 py-2 text-sm" />
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone du chauffeur"
            className="border rounded-md px-3 py-2 text-sm sm:col-span-2" />
        </div>
        <button onClick={ajouter} disabled={saving}
          className="w-full mt-3 bg-black text-white rounded-md py-2 text-sm disabled:opacity-50">
          {saving ? 'Ajout...' : 'Ajouter le véhicule'}
        </button>
      </div>
    </main>
  );
}
