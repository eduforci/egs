'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type CompteBancaire = { id: string; nom: string; banque: string | null; numero_compte: string | null; solde_initial: number };
type Mouvement = { id: string; type: string; montant: number; libelle: string; date_mouvement: string };

const TYPES_MOUVEMENT = [
  { value: 'depot', label: 'Dépôt' },
  { value: 'retrait', label: 'Retrait' },
  { value: 'virement_entrant', label: 'Virement entrant' },
  { value: 'virement_sortant', label: 'Virement sortant' },
];

export default function BanquesPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [comptes, setComptes] = useState<CompteBancaire[]>([]);
  const [compteChoisi, setCompteChoisi] = useState('');
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);

  const [nomCompte, setNomCompte] = useState('');
  const [banque, setBanque] = useState('');
  const [numeroCompte, setNumeroCompte] = useState('');
  const [soldeInitialCompte, setSoldeInitialCompte] = useState('0');

  const [typeMouvement, setTypeMouvement] = useState('depot');
  const [montantMouvement, setMontantMouvement] = useState('');
  const [libelleMouvement, setLibelleMouvement] = useState('');
  const [dateMouvement, setDateMouvement] = useState(new Date().toISOString().slice(0, 10));

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

      const { data: comptesData, error: comptesError } = await supabase
        .from('comptes_bancaires')
        .select('id, nom, banque, numero_compte, solde_initial')
        .eq('etablissement_id', profile.etablissement_id);

      if (comptesError) throw new Error(`Erreur comptes : ${comptesError.message}`);
      setComptes(comptesData ?? []);
      if ((comptesData ?? []).length > 0) setCompteChoisi(comptesData![0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const chargerMouvements = useCallback(async (compteId: string) => {
    if (!compteId) return;
    const { data, error: mvtError } = await supabase
      .from('mouvements_bancaires')
      .select('id, type, montant, libelle, date_mouvement')
      .eq('compte_bancaire_id', compteId)
      .order('date_mouvement', { ascending: false })
      .limit(50);

    if (mvtError) {
      setError(`Erreur mouvements : ${mvtError.message}`);
      return;
    }
    setMouvements(data ?? []);
  }, [supabase]);

  useEffect(() => {
    if (compteChoisi) chargerMouvements(compteChoisi);
  }, [compteChoisi, chargerMouvements]);

  async function creerCompte() {
    if (!nomCompte.trim() || !etablissementId) return;
    setSaving(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('comptes_bancaires')
      .insert({
        etablissement_id: etablissementId,
        nom: nomCompte.trim(),
        banque: banque.trim() || null,
        numero_compte: numeroCompte.trim() || null,
        solde_initial: parseFloat(soldeInitialCompte) || 0,
      })
      .select('id')
      .single();

    setSaving(false);
    if (insertError || !data) {
      setError(`Erreur création : ${insertError?.message}`);
      return;
    }
    setNomCompte('');
    setBanque('');
    setNumeroCompte('');
    setSoldeInitialCompte('0');
    setSucces('Compte bancaire créé.');
    charger();
    setCompteChoisi(data.id);
  }

  async function ajouterMouvement() {
    if (!compteChoisi || !montantMouvement || !libelleMouvement.trim()) {
      setError('Montant et libellé sont obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('mouvements_bancaires').insert({
      compte_bancaire_id: compteChoisi,
      type: typeMouvement,
      montant: parseFloat(montantMouvement) || 0,
      libelle: libelleMouvement.trim(),
      date_mouvement: dateMouvement,
      cree_par: user?.id,
    });

    setSaving(false);
    if (insertError) {
      setError(`Erreur mouvement : ${insertError.message}`);
      return;
    }
    setMontantMouvement('');
    setLibelleMouvement('');
    chargerMouvements(compteChoisi);
  }

  const compteActuel = comptes.find((c) => c.id === compteChoisi);
  const soldeActuel = compteActuel
    ? compteActuel.solde_initial
      + mouvements.filter((m) => m.type === 'depot' || m.type === 'virement_entrant').reduce((s, m) => s + m.montant, 0)
      - mouvements.filter((m) => m.type === 'retrait' || m.type === 'virement_sortant').reduce((s, m) => s + m.montant, 0)
    : 0;

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Gestion bancaire</h1>
      <p className="text-sm text-gray-500 mb-4">Comptes bancaires, dépôts, retraits et virements.</p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {comptes.length > 0 && (
        <select
          value={compteChoisi}
          onChange={(e) => setCompteChoisi(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm mb-4"
        >
          {comptes.map((c) => (
            <option key={c.id} value={c.id}>{c.nom} {c.banque ? `(${c.banque})` : ''}</option>
          ))}
        </select>
      )}

      {compteActuel && (
        <div className="border-2 border-black rounded-lg p-4 mb-6 text-center">
          <p className="text-xs text-gray-500 uppercase">Solde — {compteActuel.nom}</p>
          <p className="text-2xl font-bold">{soldeActuel.toLocaleString('fr-FR')} F</p>
          {compteActuel.numero_compte && (
            <p className="text-xs text-gray-400 mt-1">N° {compteActuel.numero_compte}</p>
          )}
        </div>
      )}

      {compteActuel && (
        <div className="border rounded-lg p-4 mb-6">
          <p className="font-semibold text-sm mb-3">Ajouter un mouvement</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <select
              value={typeMouvement}
              onChange={(e) => setTypeMouvement(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {TYPES_MOUVEMENT.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="1"
              value={montantMouvement}
              onChange={(e) => setMontantMouvement(e.target.value)}
              placeholder="Montant"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <input
            type="text"
            value={libelleMouvement}
            onChange={(e) => setLibelleMouvement(e.target.value)}
            placeholder="Libellé"
            className="w-full border rounded-md px-3 py-2 text-sm mb-2"
          />
          <input
            type="date"
            value={dateMouvement}
            onChange={(e) => setDateMouvement(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm mb-2"
          />
          <button
            onClick={ajouterMouvement}
            disabled={saving || !montantMouvement || !libelleMouvement.trim()}
            className="w-full bg-blue-600 text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      )}

      {compteActuel && (
        <div className="border rounded-lg overflow-hidden mb-6">
          <p className="bg-gray-100 px-3 py-2 text-sm font-semibold">Historique</p>
          <table className="w-full text-sm">
            <tbody>
              {mouvements.length === 0 ? (
                <tr><td className="px-3 py-3 text-center text-gray-400">Aucun mouvement.</td></tr>
              ) : (
                mouvements.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2">
                      {m.libelle}
                      <span className="block text-[10px] text-gray-400">
                        {TYPES_MOUVEMENT.find((t) => t.value === m.type)?.label} · {m.date_mouvement}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${
                      m.type === 'depot' || m.type === 'virement_entrant' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {m.type === 'depot' || m.type === 'virement_entrant' ? '+' : '-'}{m.montant.toLocaleString('fr-FR')} F
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Créer un compte */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-3">Ajouter un compte bancaire</p>
        <div className="space-y-2">
          <input
            type="text"
            value={nomCompte}
            onChange={(e) => setNomCompte(e.target.value)}
            placeholder="Nom du compte (ex: Compte principal)"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={banque}
              onChange={(e) => setBanque(e.target.value)}
              placeholder="Banque (ex: SGCI)"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={numeroCompte}
              onChange={(e) => setNumeroCompte(e.target.value)}
              placeholder="Numéro de compte"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <input
            type="number"
            step="1"
            value={soldeInitialCompte}
            onChange={(e) => setSoldeInitialCompte(e.target.value)}
            placeholder="Solde initial"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={creerCompte}
            disabled={saving || !nomCompte.trim()}
            className="w-full bg-black text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            Créer le compte
          </button>
        </div>
      </div>
    </main>
  );
  }
      
