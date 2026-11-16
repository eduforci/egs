'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  chargerContexteEcole, formatMontant, heureCourte, PERIODICITES_TRANSPORT,
} from '@/lib/services-scolaires';

type Vehicule = { id: string; immatriculation: string; libelle: string | null; capacite: number };
type Arret = { id: string; circuit_id: string; nom: string; ordre: number; heure_passage: string | null };
type Circuit = {
  id: string; nom: string; description: string | null; vehicule_id: string | null;
  heure_depart_matin: string | null; heure_depart_soir: string | null;
  tarif: number; periodicite: string; actif: boolean;
};

export default function CircuitsPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [arrets, setArrets] = useState<Arret[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [inscrits, setInscrits] = useState<Record<string, number>>({});

  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [vehiculeId, setVehiculeId] = useState('');
  const [heureMatin, setHeureMatin] = useState('');
  const [heureSoir, setHeureSoir] = useState('');
  const [tarif, setTarif] = useState('');
  const [periodicite, setPeriodicite] = useState('mois');

  const [ouvert, setOuvert] = useState<string | null>(null);
  const [aNom, setANom] = useState('');
  const [aHeure, setAHeure] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ctx = await chargerContexteEcole(supabase);
      setEtablissementId(ctx.etablissementId);

      const [c, a, v, i] = await Promise.all([
        supabase.from('transport_circuits')
          .select('id, nom, description, vehicule_id, heure_depart_matin, heure_depart_soir, tarif, periodicite, actif')
          .eq('etablissement_id', ctx.etablissementId).order('nom'),
        supabase.from('transport_arrets').select('id, circuit_id, nom, ordre, heure_passage')
          .eq('etablissement_id', ctx.etablissementId).order('ordre'),
        supabase.from('transport_vehicules').select('id, immatriculation, libelle, capacite')
          .eq('etablissement_id', ctx.etablissementId).eq('actif', true).order('immatriculation'),
        supabase.from('transport_inscriptions').select('circuit_id')
          .eq('etablissement_id', ctx.etablissementId).eq('annee_scolaire', ctx.anneeActive).eq('actif', true),
      ]);
      if (c.error) throw new Error(`Erreur circuits : ${c.error.message}`);
      if (a.error) throw new Error(`Erreur arrêts : ${a.error.message}`);
      if (v.error) throw new Error(`Erreur véhicules : ${v.error.message}`);
      if (i.error) throw new Error(`Erreur inscriptions : ${i.error.message}`);

      setCircuits((c.data ?? []) as Circuit[]);
      setArrets((a.data ?? []) as Arret[]);
      setVehicules((v.data ?? []) as Vehicule[]);

      const compte: Record<string, number> = {};
      for (const ins of (i.data ?? []) as any[]) compte[ins.circuit_id] = (compte[ins.circuit_id] ?? 0) + 1;
      setInscrits(compte);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { charger(); }, [charger]);

  const vehiculeDe = (id: string | null) => vehicules.find((v) => v.id === id);

  async function creerCircuit() {
    if (!nom.trim()) { setError('Le nom du circuit est obligatoire.'); return; }
    setSaving(true); setError(null);
    const { error: e } = await supabase.from('transport_circuits').insert({
      etablissement_id: etablissementId,
      nom: nom.trim(),
      description: description.trim() || null,
      vehicule_id: vehiculeId || null,
      heure_depart_matin: heureMatin || null,
      heure_depart_soir: heureSoir || null,
      tarif: parseFloat(tarif) || 0,
      periodicite,
    });
    setSaving(false);
    if (e) { setError(`Erreur création : ${e.message}`); return; }
    setNom(''); setDescription(''); setVehiculeId(''); setHeureMatin(''); setHeureSoir(''); setTarif('');
    charger();
  }

  async function supprimerCircuit(c: Circuit) {
    const n = inscrits[c.id] ?? 0;
    const message = n > 0
      ? `Ce circuit a ${n} élève(s) inscrit(s). Les supprimer avec le circuit ?`
      : 'Supprimer ce circuit ?';
    if (!window.confirm(message)) return;
    const { error: e } = await supabase.from('transport_circuits').delete().eq('id', c.id);
    if (e) { setError(`Erreur suppression : ${e.message}`); return; }
    charger();
  }

  async function changerVehicule(c: Circuit, id: string) {
    const { error: e } = await supabase.from('transport_circuits').update({ vehicule_id: id || null }).eq('id', c.id);
    if (e) { setError(`Erreur : ${e.message}`); return; }
    charger();
  }

  async function ajouterArret(circuitId: string) {
    if (!aNom.trim()) { setError("Le nom de l'arrêt est obligatoire."); return; }
    const suivant = Math.max(0, ...arrets.filter((a) => a.circuit_id === circuitId).map((a) => a.ordre)) + 1;
    setError(null);
    const { error: e } = await supabase.from('transport_arrets').insert({
      etablissement_id: etablissementId,
      circuit_id: circuitId,
      nom: aNom.trim(),
      ordre: suivant,
      heure_passage: aHeure || null,
    });
    if (e) { setError(`Erreur arrêt : ${e.message}`); return; }
    setANom(''); setAHeure('');
    charger();
  }

  async function supprimerArret(id: string) {
    const { error: e } = await supabase.from('transport_arrets').delete().eq('id', id);
    if (e) { setError(`Erreur suppression : ${e.message}`); return; }
    charger();
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-3">Transport : circuits</h1>

      <div className="flex gap-2 mb-4 text-sm flex-wrap">
        <span className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white">Circuits</span>
        <Link href="/chef/transport/vehicules" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Véhicules</Link>
        <Link href="/chef/transport/inscriptions" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Inscriptions</Link>
        <Link href="/chef/transport/embarquement" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Embarquement</Link>
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}

      <div className="space-y-3 mb-6">
        {circuits.length === 0 && <p className="text-sm text-gray-400">Aucun circuit. Créez le premier ci-dessous.</p>}
        {circuits.map((c) => {
          const v = vehiculeDe(c.vehicule_id);
          const n = inscrits[c.id] ?? 0;
          const arretsCircuit = arrets.filter((a) => a.circuit_id === c.id);
          const surcharge = v ? n > v.capacite : false;
          return (
            <div key={c.id} className="border rounded-lg bg-white">
              <div className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{c.nom}</p>
                  {c.description && <p className="text-xs text-gray-500">{c.description}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {formatMontant(c.tarif)} {PERIODICITES_TRANSPORT[c.periodicite] ?? ''}
                    {c.heure_depart_matin && ` · Matin ${heureCourte(c.heure_depart_matin)}`}
                    {c.heure_depart_soir && ` · Soir ${heureCourte(c.heure_depart_soir)}`}
                  </p>
                  <p className={`text-xs mt-1 ${surcharge ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {n} inscrit(s){v ? ` sur ${v.capacite} places` : ''}{surcharge ? ' : capacité dépassée' : ''}
                  </p>
                </div>
                <button onClick={() => supprimerCircuit(c)} className="text-red-600 text-xs shrink-0">Suppr.</button>
              </div>

              <div className="px-3 pb-3 flex flex-wrap items-center gap-2">
                <select value={c.vehicule_id ?? ''} onChange={(e) => changerVehicule(c, e.target.value)}
                  className="border rounded-md px-2 py-1 text-xs">
                  <option value="">Aucun véhicule</option>
                  {vehicules.map((veh) => (
                    <option key={veh.id} value={veh.id}>{veh.libelle || veh.immatriculation} ({veh.capacite} pl.)</option>
                  ))}
                </select>
                <button onClick={() => setOuvert(ouvert === c.id ? null : c.id)} className="text-xs underline text-gray-600">
                  {ouvert === c.id ? 'Masquer les arrêts' : `Arrêts (${arretsCircuit.length})`}
                </button>
              </div>

              {ouvert === c.id && (
                <div className="border-t p-3 bg-neutral-50">
                  {arretsCircuit.length === 0 ? (
                    <p className="text-xs text-gray-400 mb-2">Aucun arrêt.</p>
                  ) : (
                    <ol className="mb-3 space-y-1">
                      {arretsCircuit.map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-sm">
                          <span>{a.ordre}. {a.nom}{a.heure_passage && <span className="text-gray-400"> · {heureCourte(a.heure_passage)}</span>}</span>
                          <button onClick={() => supprimerArret(a.id)} className="text-red-600 text-xs">Suppr.</button>
                        </li>
                      ))}
                    </ol>
                  )}
                  <div className="flex gap-2">
                    <input value={aNom} onChange={(e) => setANom(e.target.value)} placeholder="Nom de l'arrêt"
                      className="flex-1 border rounded-md px-3 py-1.5 text-sm" />
                    <input type="time" value={aHeure} onChange={(e) => setAHeure(e.target.value)}
                      className="border rounded-md px-2 py-1.5 text-sm" />
                    <button onClick={() => ajouterArret(c.id)} className="bg-black text-white rounded-md px-3 text-sm">+</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border rounded-lg p-4 bg-white">
        <p className="font-semibold text-sm mb-3">Créer un circuit</p>
        <div className="space-y-2">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom (ex : Circuit Cocody - Angré)"
            className="w-full border rounded-md px-3 py-2 text-sm" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optionnel)"
            className="w-full border rounded-md px-3 py-2 text-sm" />
          <select value={vehiculeId} onChange={(e) => setVehiculeId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">Véhicule (optionnel)</option>
            {vehicules.map((v) => <option key={v.id} value={v.id}>{v.libelle || v.immatriculation} ({v.capacite} places)</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-500">Départ matin
              <input type="time" value={heureMatin} onChange={(e) => setHeureMatin(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm mt-1" />
            </label>
            <label className="text-xs text-gray-500">Départ soir
              <input type="time" value={heureSoir} onChange={(e) => setHeureSoir(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm mt-1" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="0" value={tarif} onChange={(e) => setTarif(e.target.value)}
              placeholder="Tarif (FCFA)" className="border rounded-md px-3 py-2 text-sm" />
            <select value={periodicite} onChange={(e) => setPeriodicite(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
              {Object.entries(PERIODICITES_TRANSPORT).map(([val, l]) => <option key={val} value={val}>{l}</option>)}
            </select>
          </div>
          <button onClick={creerCircuit} disabled={saving}
            className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-50">
            {saving ? 'Création...' : 'Créer le circuit'}
          </button>
        </div>
      </div>
    </main>
  );
}
