'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  chargerContexteEcole, chargerEleves, nomComplet, formatMontant, PERIODICITES_CANTINE,
  type EleveLite,
} from '@/lib/services-scolaires';

type Formule = { id: string; nom: string; periodicite: string; montant: number; actif: boolean };
type Inscription = {
  id: string; eleve_id: string; formule_id: string | null; regime: string | null;
  allergies: string | null; actif: boolean;
};

export default function CantinePage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [annee, setAnnee] = useState('');
  const [eleves, setEleves] = useState<EleveLite[]>([]);
  const [formules, setFormules] = useState<Formule[]>([]);
  const [inscriptions, setInscriptions] = useState<Inscription[]>([]);

  const [fNom, setFNom] = useState('');
  const [fPeriodicite, setFPeriodicite] = useState('mois');
  const [fMontant, setFMontant] = useState('');

  const [eleveId, setEleveId] = useState('');
  const [formuleId, setFormuleId] = useState('');
  const [regime, setRegime] = useState('');
  const [allergies, setAllergies] = useState('');
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

      const [listeEleves, f, i] = await Promise.all([
        chargerEleves(supabase, ctx.etablissementId),
        supabase.from('cantine_formules').select('id, nom, periodicite, montant, actif')
          .eq('etablissement_id', ctx.etablissementId).order('nom'),
        supabase.from('cantine_inscriptions').select('id, eleve_id, formule_id, regime, allergies, actif')
          .eq('etablissement_id', ctx.etablissementId).eq('annee_scolaire', ctx.anneeActive),
      ]);
      if (f.error) throw new Error(`Erreur formules : ${f.error.message}`);
      if (i.error) throw new Error(`Erreur inscriptions : ${i.error.message}`);

      setEleves(listeEleves);
      setFormules((f.data ?? []) as Formule[]);
      setInscriptions((i.data ?? []) as Inscription[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { charger(); }, [charger]);

  const parEleve = useMemo(() => new Map<string, EleveLite>(eleves.map((e): [string, EleveLite] => [e.id, e])), [eleves]);
  const parFormule = useMemo(() => new Map(formules.map((f) => [f.id, f])), [formules]);
  const dejaInscrits = useMemo(() => new Set(inscriptions.map((i) => i.eleve_id)), [inscriptions]);
  const elevesDisponibles = eleves.filter((e) => !dejaInscrits.has(e.id));

  const inscritsFiltres = inscriptions
    .filter((i) => {
      const e = parEleve.get(i.eleve_id);
      const texte = `${nomComplet(e)} ${e?.matricule ?? ''} ${e?.classe_nom ?? ''}`.toLowerCase();
      return texte.includes(recherche.trim().toLowerCase());
    })
    .sort((a, b) => nomComplet(parEleve.get(a.eleve_id)).localeCompare(nomComplet(parEleve.get(b.eleve_id)), 'fr'));

  const montantAttendu = inscriptions
    .filter((i) => i.actif)
    .reduce((somme, i) => somme + (i.formule_id ? parFormule.get(i.formule_id)?.montant ?? 0 : 0), 0);

  async function creerFormule() {
    if (!fNom.trim() || fMontant === '') { setError('Nom et montant sont obligatoires.'); return; }
    setSaving(true); setError(null); setSucces(null);
    const { error: e } = await supabase.from('cantine_formules').insert({
      etablissement_id: etablissementId,
      nom: fNom.trim(),
      periodicite: fPeriodicite,
      montant: parseFloat(fMontant) || 0,
    });
    setSaving(false);
    if (e) { setError(`Erreur création : ${e.message}`); return; }
    setFNom(''); setFMontant('');
    setSucces('Formule créée.');
    charger();
  }

  async function supprimerFormule(id: string) {
    if (!window.confirm('Supprimer cette formule ? Les élèves inscrits resteront sans formule.')) return;
    const { error: e } = await supabase.from('cantine_formules').delete().eq('id', id);
    if (e) { setError(`Erreur suppression : ${e.message}`); return; }
    charger();
  }

  async function inscrire() {
    if (!eleveId) { setError('Choisissez un élève.'); return; }
    setSaving(true); setError(null); setSucces(null);
    const { error: e } = await supabase.from('cantine_inscriptions').insert({
      etablissement_id: etablissementId,
      eleve_id: eleveId,
      formule_id: formuleId || null,
      annee_scolaire: annee,
      regime: regime.trim() || null,
      allergies: allergies.trim() || null,
    });
    setSaving(false);
    if (e) { setError(`Erreur inscription : ${e.message}`); return; }
    setEleveId(''); setFormuleId(''); setRegime(''); setAllergies('');
    setSucces('Élève inscrit à la cantine.');
    charger();
  }

  async function basculerActif(i: Inscription) {
    const { error: e } = await supabase.from('cantine_inscriptions').update({ actif: !i.actif }).eq('id', i.id);
    if (e) { setError(`Erreur : ${e.message}`); return; }
    charger();
  }

  async function changerFormule(i: Inscription, nouvelle: string) {
    const { error: e } = await supabase.from('cantine_inscriptions')
      .update({ formule_id: nouvelle || null }).eq('id', i.id);
    if (e) { setError(`Erreur : ${e.message}`); return; }
    charger();
  }

  async function desinscrire(id: string) {
    if (!window.confirm('Retirer cet élève de la cantine ?')) return;
    const { error: e } = await supabase.from('cantine_inscriptions').delete().eq('id', id);
    if (e) { setError(`Erreur suppression : ${e.message}`); return; }
    charger();
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Cantine</h1>
      <p className="text-sm text-gray-500 mb-3">Année scolaire {annee}</p>

      <div className="flex gap-2 mb-4 text-sm">
        <span className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white">Inscriptions</span>
        <Link href="/chef/cantine/menus" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Menus</Link>
        <Link href="/chef/cantine/presences" className="px-3 py-1.5 rounded-lg border hover:bg-neutral-100">Présences</Link>
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}
      {succes && <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs text-gray-500">Élèves inscrits (actifs)</div>
          <div className="text-xl font-bold">{inscriptions.filter((i) => i.actif).length}</div>
        </div>
        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs text-gray-500">Montant attendu par période</div>
          <div className="text-xl font-bold">{formatMontant(montantAttendu)}</div>
        </div>
      </div>

      {/* Formules et tarifs */}
      <div className="border rounded-lg p-4 mb-6 bg-white">
        <p className="font-semibold text-sm mb-3">Formules et tarifs</p>
        {formules.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">Aucune formule. Créez-en une pour pouvoir inscrire des élèves.</p>
        ) : (
          <ul className="mb-3 divide-y border rounded-md">
            {formules.map((f) => (
              <li key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{f.nom} <span className="text-gray-400">· {PERIODICITES_CANTINE[f.periodicite] ?? f.periodicite}</span></span>
                <span className="flex items-center gap-3">
                  <span>{formatMontant(f.montant)}</span>
                  <button onClick={() => supprimerFormule(f.id)} className="text-red-600 text-xs">Suppr.</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={fNom} onChange={(e) => setFNom(e.target.value)} placeholder="Nom (ex : Cantine mensuelle)"
            className="border rounded-md px-3 py-2 text-sm sm:col-span-3" />
          <select value={fPeriodicite} onChange={(e) => setFPeriodicite(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
            {Object.entries(PERIODICITES_CANTINE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="number" min="0" value={fMontant} onChange={(e) => setFMontant(e.target.value)}
            placeholder="Montant (FCFA)" className="border rounded-md px-3 py-2 text-sm" />
          <button onClick={creerFormule} disabled={saving}
            className="bg-black text-white rounded-md py-2 text-sm disabled:opacity-50">Ajouter</button>
        </div>
      </div>

      {/* Inscrire un élève */}
      <div className="border rounded-lg p-4 mb-6 bg-white">
        <p className="font-semibold text-sm mb-3">Inscrire un élève</p>
        <div className="space-y-2">
          <select value={eleveId} onChange={(e) => setEleveId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">Choisir un élève...</option>
            {elevesDisponibles.map((e) => (
              <option key={e.id} value={e.id}>{nomComplet(e)} — {e.classe_nom}</option>
            ))}
          </select>
          <select value={formuleId} onChange={(e) => setFormuleId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">Formule (optionnel)</option>
            {formules.filter((f) => f.actif).map((f) => (
              <option key={f.id} value={f.id}>{f.nom} — {formatMontant(f.montant)}</option>
            ))}
          </select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={regime} onChange={(e) => setRegime(e.target.value)} placeholder="Régime (ex : sans porc)"
              className="border rounded-md px-3 py-2 text-sm" />
            <input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Allergies (optionnel)"
              className="border rounded-md px-3 py-2 text-sm" />
          </div>
          <button onClick={inscrire} disabled={saving || !eleveId}
            className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-50">
            {saving ? 'Enregistrement...' : 'Inscrire à la cantine'}
          </button>
        </div>
      </div>

      {/* Liste des inscrits */}
      <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un inscrit..."
        className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
      <div className="border rounded-lg overflow-x-auto bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Élève</th>
              <th className="text-left px-3 py-2">Formule</th>
              <th className="text-left px-3 py-2">Régime / allergies</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {inscritsFiltres.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Aucun élève inscrit.</td></tr>
            ) : inscritsFiltres.map((i) => {
              const e = parEleve.get(i.eleve_id);
              return (
                <tr key={i.id} className={`border-t ${i.actif ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2">
                    {nomComplet(e)}
                    <span className="block text-[10px] text-gray-400">{e?.classe_nom}</span>
                  </td>
                  <td className="px-3 py-2">
                    <select value={i.formule_id ?? ''} onChange={(ev) => changerFormule(i, ev.target.value)}
                      className="border rounded-md px-2 py-1 text-xs">
                      <option value="">Aucune</option>
                      {formules.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {[i.regime, i.allergies && `Allergie : ${i.allergies}`].filter(Boolean).join(' · ') || '-'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <button onClick={() => basculerActif(i)} className="text-xs text-gray-600 mr-3">
                      {i.actif ? 'Suspendre' : 'Réactiver'}
                    </button>
                    <button onClick={() => desinscrire(i.id)} className="text-red-600 text-xs">Retirer</button>
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
