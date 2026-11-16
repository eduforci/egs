'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  chargerContexteEcole, chargerEleves, nomComplet, formatMontant, SENS_TRANSPORT,
  type EleveLite,
} from '@/lib/services-scolaires';

type Circuit = { id: string; nom: string; tarif: number; vehicule_id: string | null };
type Arret = { id: string; circuit_id: string; nom: string; ordre: number };
type Inscription = { id: string; eleve_id: string; circuit_id: string; arret_id: string | null; sens: string; actif: boolean };

export default function InscriptionsTransportPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [annee, setAnnee] = useState('');
  const [eleves, setEleves] = useState<EleveLite[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [arrets, setArrets] = useState<Arret[]>([]);
  const [inscriptions, setInscriptions] = useState<Inscription[]>([]);

  const [eleveId, setEleveId] = useState('');
  const [circuitId, setCircuitId] = useState('');
  const [arretId, setArretId] = useState('');
  const [sens, setSens] = useState('aller_retour');
  const [recherche, setRecherche] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ctx = await chargerContexteEcole(supabase);
      setEtablissementId(ctx.etablissementId);
      setAnnee(ctx.anneeActive);

      const [listeEleves, c, a, i] = await Promise.all([
        chargerEleves(supabase, ctx.etablissementId),
        supabase.from('transport_circuits').select('id, nom, tarif, vehicule_id')
          .eq('etablissement_id', ctx.etablissementId).eq('actif', true).order('nom'),
        supabase.from('transport_arrets').select('id, circuit_id, nom, ordre')
          .eq('etablissement_id', ctx.etablissementId).order('ordre'),
        supabase.from('transport_inscriptions').select('id, eleve_id, circuit_id, arret_id, sens, actif')
          .eq('etablissement_id', ctx.etablissementId).eq('annee_scolaire', ctx.anneeActive),
      ]);
      if (c.error) throw new Error(`Erreur circuits : ${c.error.message}`);
      if (a.error) throw new Error(`Erreur arrêts : ${a.error.message}`);
      if (i.error) throw new Error(`Erreur inscriptions : ${i.error.message}`);

      setEleves(listeEleves);
      setCircuits((c.data ?? []) as Circuit[]);
      setArrets((a.data ?? []) as Arret[]);
      setInscriptions((i.data ?? []) as Inscription[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { charger(); }, [charger]);

  const parEleve = useMemo(() => new Map<string, EleveLite>(eleves.map((e): [string, EleveLite] => [e.id, e])), [eleves]);
  const parCircuit = useMemo(() => new Map(circuits.map((c) => [c.id, c])), [circuits]);
  const parArret = useMemo(() => new Map(arrets.map((a) => [a.id, a])), [arrets]);
  const dejaInscrits = useMemo(() => new Set(inscriptions.map((i) => i.eleve_id)), [inscriptions]);
  const elevesDisponibles = eleves.filter((e) => !dejaInscrits.has(e.id));
  const arretsDuCircuit = arrets.filter((a) => a.circuit_id === circuitId);

  const liste = inscriptions
    .filter((i) => {
      const e = parEleve.get(i.eleve_id);
      const texte = `${nomComplet(e)} ${e?.classe_nom ?? ''} ${parCircuit.get(i.circuit_id)?.nom ?? ''}`.toLowerCase();
      return texte.includes(recherche.trim().toLowerCase());
    })
    .sort((a, b) => nomComplet(parEleve.get(a.eleve_id)).localeCompare(nomComplet(parEleve.get(b.eleve_id)), 'fr'));

  async function inscrire() {
    if (!eleveId || !circuitId) { setError('Choisissez un élève et un circuit.'); return; }
    setSaving(true); setError(null); setSucces(null);
    const { error: e } = await supabase.from('transport_inscriptions').insert({
      etablissement_id: etablissementId,
      eleve_id: eleveId,
      circuit_id: circuitId,
      arret_id: arretId || null,
      annee_scolaire: annee,
      sens,
    });
    setSaving(false);
    if (e) { setError(`Erreur inscription : ${e.message}`); return; }
    setEleveId(''); setArretId('');
    setSucces('Élève inscrit au transport.');
    charger();
  }

  async function basculer(i: Inscription) {
    const { error: e } = await supabase.from('transport_inscriptions').update({ actif: !i.actif }).eq('id', i.id);
    if (e) { setError(`Erreur : ${e.message}`); return; }
    charger();
  }

  async function retirer(id: string) {
    if (!window.confirm('Retirer cet élève du transport ?')) return;
    const { error: e } = await supabase.from('transport_inscriptions').delete().eq('id', id);
    if (e) { setError(`Erreur suppression : ${e.message}`); return; }
    charger();
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Transport : inscriptions</h1>
      <p className="text-sm text-gray-500 mb-3">Année scolaire {annee}</p>

      <div className="flex gap-2 mb-4 text-sm flex-wrap">
        <Link href="/chef/transport" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Circuits</Link>
        <Link href="/chef/transport/vehicules" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Véhicules</Link>
        <span className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white">Inscriptions</span>
        <Link href="/chef/transport/embarquement" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Embarquement</Link>
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}
      {succes && <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>}

      <div className="border rounded-lg p-4 mb-6 bg-white">
        <p className="font-semibold text-sm mb-3">Inscrire un élève</p>
        {circuits.length === 0 ? (
          <p className="text-sm text-gray-400">Créez d'abord un circuit dans l'onglet Circuits.</p>
        ) : (
          <div className="space-y-2">
            <select value={eleveId} onChange={(e) => setEleveId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Choisir un élève...</option>
              {elevesDisponibles.map((e) => <option key={e.id} value={e.id}>{nomComplet(e)} — {e.classe_nom}</option>)}
            </select>
            <select value={circuitId} onChange={(e) => { setCircuitId(e.target.value); setArretId(''); }}
              className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Choisir un circuit...</option>
              {circuits.map((c) => <option key={c.id} value={c.id}>{c.nom} — {formatMontant(c.tarif)}</option>)}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select value={arretId} onChange={(e) => setArretId(e.target.value)} disabled={!circuitId}
                className="border rounded-md px-3 py-2 text-sm disabled:opacity-50">
                <option value="">Arrêt (optionnel)</option>
                {arretsDuCircuit.map((a) => <option key={a.id} value={a.id}>{a.ordre}. {a.nom}</option>)}
              </select>
              <select value={sens} onChange={(e) => setSens(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
                {Object.entries(SENS_TRANSPORT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button onClick={inscrire} disabled={saving || !eleveId || !circuitId}
              className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-50">
              {saving ? 'Enregistrement...' : 'Inscrire au transport'}
            </button>
          </div>
        )}
      </div>

      <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (élève, classe, circuit)..."
        className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
      <div className="border rounded-lg overflow-x-auto bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Élève</th>
              <th className="text-left px-3 py-2">Circuit</th>
              <th className="text-left px-3 py-2">Arrêt</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {liste.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Aucune inscription.</td></tr>
            ) : liste.map((i) => {
              const e = parEleve.get(i.eleve_id);
              return (
                <tr key={i.id} className={`border-t ${i.actif ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2">
                    {nomComplet(e)}
                    <span className="block text-[10px] text-gray-400">{e?.classe_nom}</span>
                  </td>
                  <td className="px-3 py-2">
                    {parCircuit.get(i.circuit_id)?.nom ?? '-'}
                    <span className="block text-[10px] text-gray-400">{SENS_TRANSPORT[i.sens]}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{i.arret_id ? parArret.get(i.arret_id)?.nom ?? '-' : '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <button onClick={() => basculer(i)} className="text-xs text-gray-600 mr-3">{i.actif ? 'Suspendre' : 'Réactiver'}</button>
                    <button onClick={() => retirer(i.id)} className="text-red-600 text-xs">Retirer</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
