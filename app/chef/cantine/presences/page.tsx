'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  chargerContexteEcole, chargerEleves, nomComplet, aujourdhui, ajouterJours, dateLongue,
  type EleveLite,
} from '@/lib/services-scolaires';

type Ligne = { eleve: EleveLite; allergies: string | null; regime: string | null };

export default function PresencesCantinePage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [date, setDate] = useState(aujourdhui());
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [presents, setPresents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSucces(null);
    try {
      const ctx = await chargerContexteEcole(supabase);
      setEtablissementId(ctx.etablissementId);

      const [eleves, insc, pres] = await Promise.all([
        chargerEleves(supabase, ctx.etablissementId),
        supabase.from('cantine_inscriptions').select('eleve_id, regime, allergies')
          .eq('etablissement_id', ctx.etablissementId).eq('annee_scolaire', ctx.anneeActive).eq('actif', true),
        supabase.from('cantine_presences').select('eleve_id, present')
          .eq('etablissement_id', ctx.etablissementId).eq('date_presence', date),
      ]);
      if (insc.error) throw new Error(`Erreur inscriptions : ${insc.error.message}`);
      if (pres.error) throw new Error(`Erreur présences : ${pres.error.message}`);

      const parEleve = new Map<string, EleveLite>(eleves.map((e): [string, EleveLite] => [e.id, e]));
      const liste: Ligne[] = ((insc.data ?? []) as any[])
        .filter((i) => parEleve.has(i.eleve_id))
        .map((i) => ({ eleve: parEleve.get(i.eleve_id)!, allergies: i.allergies, regime: i.regime }))
        .sort((a, b) => nomComplet(a.eleve).localeCompare(nomComplet(b.eleve), 'fr'));
      setLignes(liste);

      const dejaSaisi = ((pres.data ?? []) as any[]);
      // Sans saisie pour ce jour, tous les inscrits sont présents par défaut
      setPresents(
        dejaSaisi.length > 0
          ? new Set(dejaSaisi.filter((p) => p.present).map((p) => p.eleve_id as string))
          : new Set(liste.map((l) => l.eleve.id))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase, date]);

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
      date_presence: date,
      present: presents.has(l.eleve.id),
    }));
    const { error: e } = await supabase.from('cantine_presences').upsert(rows, { onConflict: 'eleve_id,date_presence' });
    setSaving(false);
    if (e) { setError(`Erreur enregistrement : ${e.message}`); return; }
    setSucces(`Présences enregistrées : ${nbPresents} repas pour le ${dateLongue(date)}.`);
  }

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-3">Cantine : présences</h1>

      <div className="flex gap-2 mb-4 text-sm">
        <Link href="/chef/cantine" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Inscriptions</Link>
        <Link href="/chef/cantine/menus" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Menus</Link>
        <span className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white">Présences</span>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setDate(ajouterJours(date, -1))} className="border rounded-md px-3 py-1.5 text-sm">←</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm" />
        <button onClick={() => setDate(ajouterJours(date, 1))} className="border rounded-md px-3 py-1.5 text-sm">→</button>
        <span className="ml-auto text-sm font-medium">{nbPresents} / {lignes.length} repas</span>
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}
      {succes && <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement...</p>
      ) : lignes.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun élève inscrit à la cantine. Ajoutez-en dans l'onglet Inscriptions.</p>
      ) : (
        <>
          <div className="border rounded-lg divide-y bg-white mb-4">
            {lignes.map((l) => (
              <label key={l.eleve.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={presents.has(l.eleve.id)} onChange={() => basculer(l.eleve.id)}
                  className="w-4 h-4" />
                <span className="flex-1 text-sm">
                  {nomComplet(l.eleve)}
                  <span className="block text-[10px] text-gray-400">{l.eleve.classe_nom}</span>
                </span>
                {(l.allergies || l.regime) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    {[l.regime, l.allergies && `Allergie : ${l.allergies}`].filter(Boolean).join(' · ')}
                  </span>
                )}
              </label>
            ))}
          </div>
          <button onClick={enregistrer} disabled={saving}
            className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-50">
            {saving ? 'Enregistrement...' : 'Enregistrer les présences'}
          </button>
        </>
      )}
    </main>
  );
}
