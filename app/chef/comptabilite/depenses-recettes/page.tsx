'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Categorie = { id: string; nom: string };
type Depense = {
  id: string; libelle: string; fournisseur: string | null; montant: number; date_depense: string;
  categorie_nom: string; validee: boolean; justificatif: string | null;
};
type Recette = {
  id: string; libelle: string; source: string | null; montant: number; date_recette: string; categorie_nom: string;
};
type CaisseSession = { id: string; caisse_nom: string };
type CompteBancaire = { id: string; nom: string };

export default function DepensesRecettesPage() {
  const supabase = createClient();

  const [onglet, setOnglet] = useState<'depenses' | 'recettes'>('depenses');
  const [etablissementId, setEtablissementId] = useState<string | null>(null);

  const [categoriesDepenses, setCategoriesDepenses] = useState<Categorie[]>([]);
  const [categoriesRecettes, setCategoriesRecettes] = useState<Categorie[]>([]);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [sessionsOuvertes, setSessionsOuvertes] = useState<CaisseSession[]>([]);
  const [comptesBancaires, setComptesBancaires] = useState<CompteBancaire[]>([]);

  // Formulaire commun
  const [categorieId, setCategorieId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [tiers, setTiers] = useState(''); // fournisseur ou source
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [justificatif, setJustificatif] = useState('');
  const [modePaiementLieu, setModePaiementLieu] = useState(''); // '' | caisse_session_id | 'banque:compte_id'

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

      const [catDep, catRec, sessionsRes, comptesRes] = await Promise.all([
        supabase.from('categories_depenses').select('id, nom').eq('etablissement_id', profile.etablissement_id).order('ordre'),
        supabase.from('categories_recettes').select('id, nom').eq('etablissement_id', profile.etablissement_id).order('ordre'),
        supabase.from('caisse_sessions').select('id, caisses(nom)').eq('statut', 'ouverte'),
        supabase.from('comptes_bancaires').select('id, nom').eq('etablissement_id', profile.etablissement_id),
      ]);

      setCategoriesDepenses(catDep.data ?? []);
      setCategoriesRecettes(catRec.data ?? []);
      setComptesBancaires(comptesRes.data ?? []);

      type RowS = { id: string; caisses: { nom: string } | { nom: string }[] | null };
      const sessions: CaisseSession[] = ((sessionsRes.data ?? []) as unknown as RowS[]).map((s) => {
        const c = Array.isArray(s.caisses) ? s.caisses[0] : s.caisses;
        return { id: s.id, caisse_nom: c?.nom ?? 'Caisse' };
      });
      setSessionsOuvertes(sessions);

      await chargerListes(profile.etablissement_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  async function chargerListes(etabId: string) {
    const { data: depData } = await supabase
      .from('depenses')
      .select('id, libelle, fournisseur, montant, date_depense, validee, justificatif, categories_depenses(nom)')
      .eq('etablissement_id', etabId)
      .order('date_depense', { ascending: false })
      .limit(30);

    type RowD = { id: string; libelle: string; fournisseur: string | null; montant: number; date_depense: string; validee: boolean; justificatif: string | null; categories_depenses: { nom: string } | { nom: string }[] | null };
    const listeDep: Depense[] = ((depData ?? []) as unknown as RowD[]).map((d) => {
      const c = Array.isArray(d.categories_depenses) ? d.categories_depenses[0] : d.categories_depenses;
      return { id: d.id, libelle: d.libelle, fournisseur: d.fournisseur, montant: d.montant, date_depense: d.date_depense, categorie_nom: c?.nom ?? '-', validee: d.validee, justificatif: d.justificatif };
    });
    setDepenses(listeDep);

    const { data: recData } = await supabase
      .from('recettes')
      .select('id, libelle, source, montant, date_recette, categories_recettes(nom)')
      .eq('etablissement_id', etabId)
      .order('date_recette', { ascending: false })
      .limit(30);

    type RowR = { id: string; libelle: string; source: string | null; montant: number; date_recette: string; categories_recettes: { nom: string } | { nom: string }[] | null };
    const listeRec: Recette[] = ((recData ?? []) as unknown as RowR[]).map((r) => {
      const c = Array.isArray(r.categories_recettes) ? r.categories_recettes[0] : r.categories_recettes;
      return { id: r.id, libelle: r.libelle, source: r.source, montant: r.montant, date_recette: r.date_recette, categorie_nom: c?.nom ?? '-' };
    });
    setRecettes(listeRec);
  }

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    setCategorieId('');
    setLibelle('');
    setTiers('');
    setMontant('');
    setJustificatif('');
    setModePaiementLieu('');
    setError(null);
  }, [onglet]);

  async function enregistrer() {
    if (!categorieId || !libelle.trim() || !montant || !etablissementId) {
      setError('Catégorie, libellé et montant sont obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);
    setSucces(null);

    const { data: { user } } = await supabase.auth.getUser();

    let caisseSessionId: string | null = null;
    let compteBancaireId: string | null = null;
    if (modePaiementLieu.startsWith('banque:')) {
      compteBancaireId = modePaiementLieu.replace('banque:', '');
    } else if (modePaiementLieu) {
      caisseSessionId = modePaiementLieu;
    }

    if (onglet === 'depenses') {
      const { error: insertError } = await supabase.from('depenses').insert({
        etablissement_id: etablissementId,
        categorie_id: categorieId,
        libelle: libelle.trim(),
        fournisseur: tiers.trim() || null,
        date_depense: date,
        montant: parseFloat(montant) || 0,
        justificatif: justificatif.trim() || null,
        caisse_session_id: caisseSessionId,
        compte_bancaire_id: compteBancaireId,
        cree_par: user?.id,
      });
      setSaving(false);
      if (insertError) {
        setError(`Erreur : ${insertError.message}`);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from('recettes').insert({
        etablissement_id: etablissementId,
        categorie_id: categorieId,
        libelle: libelle.trim(),
        source: tiers.trim() || null,
        date_recette: date,
        montant: parseFloat(montant) || 0,
        caisse_session_id: caisseSessionId,
        compte_bancaire_id: compteBancaireId,
        cree_par: user?.id,
      });
      setSaving(false);
      if (insertError) {
        setError(`Erreur : ${insertError.message}`);
        return;
      }
    }

    setSucces(onglet === 'depenses' ? 'Dépense enregistrée.' : 'Recette enregistrée.');
    setCategorieId('');
    setLibelle('');
    setTiers('');
    setMontant('');
    setJustificatif('');
    setModePaiementLieu('');
    if (etablissementId) chargerListes(etablissementId);
  }

  async function validerDepense(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from('depenses')
      .update({ validee: true, validee_par: user?.id, validee_le: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      setError(`Erreur validation : ${updateError.message}`);
      return;
    }
    if (etablissementId) chargerListes(etablissementId);
  }

  const categoriesActives = onglet === 'depenses' ? categoriesDepenses : categoriesRecettes;
  const totalDepenses = depenses.reduce((s, d) => s + d.montant, 0);
  const totalRecettes = recettes.reduce((s, r) => s + r.montant, 0);

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Dépenses & Recettes</h1>
      <p className="text-sm text-gray-500 mb-4">
        {onglet === 'depenses'
          ? `Total (30 dernières) : ${totalDepenses.toLocaleString('fr-FR')} F`
          : `Total (30 dernières) : ${totalRecettes.toLocaleString('fr-FR')} F`}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setOnglet('depenses')}
          className={`flex-1 py-2 rounded-md text-sm font-medium ${onglet === 'depenses' ? 'bg-black text-white' : 'bg-gray-100'}`}
        >
          Dépenses
        </button>
        <button
          onClick={() => setOnglet('recettes')}
          className={`flex-1 py-2 rounded-md text-sm font-medium ${onglet === 'recettes' ? 'bg-black text-white' : 'bg-gray-100'}`}
        >
          Recettes diverses
        </button>
      </div>

      {/* Formulaire */}
      <div className="border rounded-lg p-4 mb-6">
        <p className="font-semibold text-sm mb-3">
          {onglet === 'depenses' ? 'Enregistrer une dépense' : 'Enregistrer une recette'}
        </p>
        <div className="space-y-2">
          <select
            value={categorieId}
            onChange={(e) => setCategorieId(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Catégorie...</option>
            {categoriesActives.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
          <input
            type="text"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Libellé"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={tiers}
            onChange={(e) => setTiers(e.target.value)}
            placeholder={onglet === 'depenses' ? 'Fournisseur' : 'Source / donateur'}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="1"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Montant"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          {onglet === 'depenses' && (
            <input
              type="text"
              value={justificatif}
              onChange={(e) => setJustificatif(e.target.value)}
              placeholder="Référence du justificatif (n° facture, etc.)"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          )}

          {(sessionsOuvertes.length > 0 || comptesBancaires.length > 0) && (
            <select
              value={modePaiementLieu}
              onChange={(e) => setModePaiementLieu(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Sans mouvement caisse/banque (juste enregistrer)</option>
              {sessionsOuvertes.map((s) => (
                <option key={s.id} value={s.id}>Caisse : {s.caisse_nom}</option>
              ))}
              {comptesBancaires.map((c) => (
                <option key={c.id} value={`banque:${c.id}`}>Banque : {c.nom}</option>
              ))}
            </select>
          )}

          <button
            onClick={enregistrer}
            disabled={saving || !categorieId || !libelle.trim() || !montant}
            className="w-full bg-black text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Libellé</th>
              <th className="text-left px-3 py-2">Montant</th>
              <th className="text-left px-3 py-2">Date</th>
              {onglet === 'depenses' && <th className="w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {onglet === 'depenses' ? (
              depenses.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Aucune dépense.</td></tr>
              ) : (
                depenses.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-3 py-2">
                      {d.libelle}
                      <span className="block text-[10px] text-gray-400">{d.categorie_nom}{d.fournisseur ? ` · ${d.fournisseur}` : ''}</span>
                    </td>
                    <td className="px-3 py-2">{d.montant.toLocaleString('fr-FR')} F</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{d.date_depense}</td>
                    <td className="px-3 py-2">
                      {d.validee ? (
                        <span className="text-green-600 text-xs">Validée</span>
                      ) : (
                        <button onClick={() => validerDepense(d.id)} className="text-blue-600 text-xs">
                          Valider
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )
            ) : (
              recettes.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">Aucune recette.</td></tr>
              ) : (
                recettes.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      {r.libelle}
                      <span className="block text-[10px] text-gray-400">{r.categorie_nom}{r.source ? ` · ${r.source}` : ''}</span>
                    </td>
                    <td className="px-3 py-2">{r.montant.toLocaleString('fr-FR')} F</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.date_recette}</td>
                  </tr>
                ))
              )
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
        }
      
