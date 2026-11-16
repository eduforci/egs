'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  chargerContexteEcole, chargerEleves, nomComplet, aujourdhui, ajouterJours, dateLongue,
  type EleveLite,
} from '@/lib/services-scolaires';

type Circuit = { id: string; nom: string };
type Ligne = { eleve: EleveLite; arret: string; sens: string };

export default function EmbarquementPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [circuitId, setCircuitId] = useState('');
  const [date, setDate] = useState(aujourdhui());
  const [trajet, setTrajet] = useState<'matin' | 'soir'>('matin');

  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [presents, setPresents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  // 1) Liste des circuits (une seule fois)
  useEffect(() => {
    (async () => {
      try {
        const ctx = await chargerContexteEcole(supabase);
        setEtablissementId(ctx.etablissementId);
        const { data, error: e } = await supabase.from('transport_circuits').select('id, nom')
          .eq('etablissement_id', ctx.etablissementId).eq('actif', true).order('nom');
        if (e) throw new Error(`Erreur circuits : ${e.message}`);
        const liste = (data ?? []) as Circuit[];
        setCircuits(liste);
        if (liste.length > 0) setCircuitId(liste[0].id); else setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setLoading(false);
      }
    })();
  }, [supabase]);

  // 2) Élèves du circuit et présences du jour
  const charger = useCallback(async () => {
    if (!circuitId || !etablissementId) return;
    setLoading(true); setError(null); setSucces(null);
    try {
      const ctx = await chargerContexteEcole(supabase);
      const [eleves, insc, arrets, emb] = await Promise.all([
        chargerEleves(supabase, etablissementId),
        supabase.from('transport_inscriptions').select('eleve_id, arret_id, sens')
          .eq('circuit_id', circuitId).eq('annee_scolaire', ctx.anneeActive).eq('actif', true),
        supabase.from('transport_arrets').select('id, nom, ordre').eq('circuit_id', circuitId),
        supabase.from('transport_embarquements').select('eleve_id, present')
          .eq('circuit_id', circuitId).eq('date_trajet', date).eq('trajet', trajet),
      ]);
      if (insc.error) throw new Error(`Erreur inscriptions : ${insc.error.message}`);
      if (arrets.error) throw new Error(`Erreur arrêts : ${arrets.error.message}`);
      if (emb.error) throw new Error(`Erreur embarquements : ${emb.error.message}`);

      const parEleve = new Map<string, EleveLite>(eleves.map((e): [string, EleveLite] => [e.id, e]));
      const ordreArret = new Map(((arrets.data ?? []) as any[]).map((a) => [a.id as string, a]));

      // Le matin, seuls les élèves inscrits à l'aller ; le soir, ceux inscrits au retour
      const concernes = ((insc.data ?? []) as any[]).filter((i) =>
        parEleve.has(i.eleve_id) && (i.sens === 'aller_retour' || i.sens === (trajet === 'matin' ? 'aller' : 'retour'))
      );

      const liste: Ligne[] = concernes
        .map((i) => ({
          eleve: parEleve.get(i.eleve_id)!,
          arret: i.arret_id ? ordreArret.get(i.arret_id)?.nom ?? '' : '',
          sens: i.sens as string,
          ordre: i.arret_id ? ordreArret.get(i.arret_id)?.ordre ?? 999 : 999,
        }))
        .sort((a, b) => a.ordre - b.ordre || nomComplet(a.eleve).localeCompare(nomComplet(b.eleve), 'fr'))
        .map(({ eleve, arret, sens }) => ({ eleve, arret, sens }));
      setLignes(liste);

      const saisis = (emb.data ?? []) as any[];
      setPresents(
        saisis.length > 0
          ? new Set(saisis.filter((p) => p.present).map((p) => p.eleve_id as string))
          : new Set(liste.map((l) => l.eleve.id))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase, circuitId, etablissementId, date, trajet]);

  useEffect(() => { charger(); }, [charger]);

  const nbPresents = useMemo(() => lignes.filter((l) => presents.has(l.eleve.id)).length, [lignes, presents]);

  function basculer(id: string) {
    setPresents((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id); else suivant.add(id);
      return suivant;
    });
  }

  async function enregistrer() {
    setSaving(true); setError(null); setSucces(null);
    const rows = lignes.map((l) => ({
      etablissement_id: etablissementId,
      eleve_id: l.eleve.id,
      circuit_id: circuitId,
      date_trajet: date,
      trajet,
      present: presents.has(l.eleve.id),
    }));
    const { error: e } = await supabase.from('transport_embarquements')
      .upsert(rows, { onConflict: 'eleve_id,circuit_id,date_trajet,trajet' });
    setSaving(false);
    if (e) { setError(`Erreur enregistrement : ${e.message}`); return; }
    setSucces(`Embarquement enregistré : ${nbPresents} élève(s) à bord.`);
  }

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-3">Transport : embarquement</h1>

      <div className="flex gap-2 mb-4 text-sm flex-wrap">
        <Link href="/chef/transport" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Circuits</Link>
        <Link href="/chef/transport/vehicules" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Véhicules</Link>
        <Link href="/chef/transport/inscriptions" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Inscriptions</Link>
        <span className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white">Embarquement</span>
      </div>

      {circuits.length === 0 && !loading ? (
        <p className="text-sm text-gray-400">Aucun circuit actif. Créez-en un dans l'onglet Circuits.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            <select value={circuitId} onChange={(e) => setCircuitId(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
              {circuits.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <button onClick={() => setDate(ajouterJours(date, -1))} className="border rounded-md px-2.5 py-2 text-sm">←</button>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
                className="flex-1 min-w-0 border rounded-md px-2 py-2 text-sm" />
              <button onClick={() => setDate(ajouterJours(date, 1))} className="border rounded-md px-2.5 py-2 text-sm">→</button>
            </div>
            <div className="flex rounded-md border overflow-hidden text-sm">
              {(['matin', 'soir'] as const).map((t) => (
                <button key={t} onClick={() => setTrajet(t)}
                  className={`flex-1 py-2 ${trajet === t ? 'bg-neutral-900 text-white' : 'bg-white'}`}>
                  {t === 'matin' ? 'Matin (aller)' : 'Soir (retour)'}
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm font-medium mb-3 capitalize">
            {dateLongue(date)} · {nbPresents} / {lignes.length} à bord
          </p>

          {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}
          {succes && <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>}

          {loading ? (
            <p className="text-sm text-gray-500">Chargement...</p>
          ) : lignes.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun élève inscrit à ce trajet.</p>
          ) : (
            <>
              <div className="border rounded-lg divide-y bg-white mb-4">
                {lignes.map((l) => (
                  <label key={l.eleve.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                    <input type="checkbox" checked={presents.has(l.eleve.id)} onChange={() => basculer(l.eleve.id)} className="w-4 h-4" />
                    <span className="flex-1 text-sm">
                      {nomComplet(l.eleve)}
                      <span className="block text-[10px] text-gray-400">{l.eleve.classe_nom}</span>
                    </span>
                    {l.arret && <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{l.arret}</span>}
                  </label>
                ))}
              </div>
              <button onClick={enregistrer} disabled={saving}
                className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-50">
                {saving ? 'Enregistrement...' : "Enregistrer l'embarquement"}
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}
