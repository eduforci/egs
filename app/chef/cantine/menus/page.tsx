'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  chargerContexteEcole, aujourdhui, lundiDeLaSemaine, ajouterJours, dateLongue,
} from '@/lib/services-scolaires';

type Menu = { entree: string; plat: string; dessert: string };
const VIDE: Menu = { entree: '', plat: '', dessert: '' };

export default function MenusCantinePage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [lundi, setLundi] = useState(lundiDeLaSemaine(aujourdhui()));
  const [menus, setMenus] = useState<Record<string, Menu>>({});
  const [loading, setLoading] = useState(true);
  const [enregistrement, setEnregistrement] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  // Du lundi au vendredi
  const jours = [0, 1, 2, 3, 4].map((n) => ajouterJours(lundi, n));

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ctx = await chargerContexteEcole(supabase);
      setEtablissementId(ctx.etablissementId);

      const { data, error: e } = await supabase
        .from('cantine_menus')
        .select('date_menu, entree, plat, dessert')
        .eq('etablissement_id', ctx.etablissementId)
        .gte('date_menu', lundi)
        .lte('date_menu', ajouterJours(lundi, 4));
      if (e) throw new Error(`Erreur menus : ${e.message}`);

      const etat: Record<string, Menu> = {};
      for (const j of [0, 1, 2, 3, 4].map((n) => ajouterJours(lundi, n))) etat[j] = { ...VIDE };
      for (const m of (data ?? []) as any[]) {
        etat[m.date_menu] = { entree: m.entree ?? '', plat: m.plat ?? '', dessert: m.dessert ?? '' };
      }
      setMenus(etat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase, lundi]);

  useEffect(() => { charger(); }, [charger]);

  function modifier(jour: string, champ: keyof Menu, valeur: string) {
    setMenus((prev) => ({ ...prev, [jour]: { ...prev[jour], [champ]: valeur } }));
  }

  async function enregistrer(jour: string) {
    const m = menus[jour];
    setError(null); setSucces(null);
    setEnregistrement(jour);

    // Un plat vide = menu retiré pour ce jour
    if (!m.plat.trim()) {
      const { error: e } = await supabase.from('cantine_menus').delete()
        .eq('etablissement_id', etablissementId).eq('date_menu', jour);
      setEnregistrement(null);
      if (e) { setError(`Erreur : ${e.message}`); return; }
      setSucces(`Menu du ${dateLongue(jour)} retiré.`);
      return;
    }

    const { error: e } = await supabase.from('cantine_menus').upsert({
      etablissement_id: etablissementId,
      date_menu: jour,
      entree: m.entree.trim() || null,
      plat: m.plat.trim(),
      dessert: m.dessert.trim() || null,
    }, { onConflict: 'etablissement_id,date_menu' });
    setEnregistrement(null);
    if (e) { setError(`Erreur : ${e.message}`); return; }
    setSucces(`Menu du ${dateLongue(jour)} enregistré.`);
  }

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-3">Cantine : menus</h1>

      <div className="flex gap-2 mb-4 text-sm">
        <Link href="/chef/cantine" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Inscriptions</Link>
        <span className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white">Menus</span>
        <Link href="/chef/cantine/presences" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Présences</Link>
      </div>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setLundi(ajouterJours(lundi, -7))} className="border rounded-md px-3 py-1.5 text-sm">← Précédente</button>
        <span className="text-sm font-medium">Semaine du {dateLongue(lundi)}</span>
        <button onClick={() => setLundi(ajouterJours(lundi, 7))} className="border rounded-md px-3 py-1.5 text-sm">Suivante →</button>
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}
      {succes && <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement...</p>
      ) : (
        <div className="space-y-3">
          {jours.map((jour) => (
            <div key={jour} className="border rounded-lg p-3 bg-white">
              <p className="font-semibold text-sm mb-2 capitalize">{dateLongue(jour)}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={menus[jour]?.entree ?? ''} onChange={(e) => modifier(jour, 'entree', e.target.value)}
                  placeholder="Entrée" className="border rounded-md px-3 py-2 text-sm" />
                <input value={menus[jour]?.plat ?? ''} onChange={(e) => modifier(jour, 'plat', e.target.value)}
                  placeholder="Plat" className="border rounded-md px-3 py-2 text-sm" />
                <input value={menus[jour]?.dessert ?? ''} onChange={(e) => modifier(jour, 'dessert', e.target.value)}
                  placeholder="Dessert" className="border rounded-md px-3 py-2 text-sm" />
              </div>
              <button onClick={() => enregistrer(jour)} disabled={enregistrement === jour}
                className="mt-2 bg-black text-white rounded-md px-4 py-1.5 text-xs disabled:opacity-50">
                {enregistrement === jour ? 'Enregistrement...' : 'Enregistrer ce jour'}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
