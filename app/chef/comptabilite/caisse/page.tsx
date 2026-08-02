'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Caisse = { id: string; nom: string };
type Session = {
  id: string; solde_initial: number; statut: string;
  ouverte_le: string; solde_final_theorique: number | null; solde_final_compte: number | null; ecart: number | null;
};
type Mouvement = { id: string; type: string; montant: number; libelle: string; date_mouvement: string };

export default function CaissePage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [caisses, setCaisses] = useState<Caisse[]>([]);
  const [caisseChoisie, setCaisseChoisie] = useState('');
  const [sessionActuelle, setSessionActuelle] = useState<Session | null>(null);
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [historiqueSessions, setHistoriqueSessions] = useState<Session[]>([]);

  const [nomNouvelleCaisse, setNomNouvelleCaisse] = useState('');
  const [soldeInitial, setSoldeInitial] = useState('0');
  const [soldeCompte, setSoldeCompte] = useState('');

  const [typeMouvement, setTypeMouvement] = useState('entree');
  const [montantMouvement, setMontantMouvement] = useState('');
  const [libelleMouvement, setLibelleMouvement] = useState('');

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

      const { data: caissesData, error: caissesError } = await supabase
        .from('caisses')
        .select('id, nom')
        .eq('etablissement_id', profile.etablissement_id);

      if (caissesError) throw new Error(`Erreur caisses : ${caissesError.message}`);
      setCaisses(caissesData ?? []);

      if ((caissesData ?? []).length > 0 && !caisseChoisie) {
        setCaisseChoisie(caissesData![0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase, caisseChoisie]);

  useEffect(() => {
    charger();
  }, []);

  const chargerSession = useCallback(async (caisseId: string) => {
    if (!caisseId) return;
    setError(null);

    const { data: sessionData, error: sessionError } = await supabase
      .from('caisse_sessions')
      .select('id, solde_initial, statut, ouverte_le, solde_final_theorique, solde_final_compte, ecart')
      .eq('caisse_id', caisseId)
      .eq('statut', 'ouverte')
      .maybeSingle();

    if (sessionError) {
      setError(`Erreur session : ${sessionError.message}`);
      return;
    }
    setSessionActuelle(sessionData);

    if (sessionData) {
      const { data: mvtData, error: mvtError } = await supabase
        .from('caisse_mouvements')
        .select('id, type, montant, libelle, date_mouvement')
        .eq('caisse_session_id', sessionData.id)
        .order('date_mouvement', { ascending: false });

      if (mvtError) {
        setError(`Erreur mouvements : ${mvtError.message}`);
        return;
      }
      setMouvements(mvtData ?? []);
    } else {
      setMouvements([]);
    }

    const { data: histData } = await supabase
      .from('caisse_sessions')
      .select('id, solde_initial, statut, ouverte_le, solde_final_theorique, solde_final_compte, ecart')
      .eq('caisse_id', caisseId)
      .eq('statut', 'fermee')
      .order('fermee_le', { ascending: false })
      .limit(10);
    setHistoriqueSessions(histData ?? []);
  }, [supabase]);

  useEffect(() => {
    if (caisseChoisie) chargerSession(caisseChoisie);
  }, [caisseChoisie, chargerSession]);

  async function creerCaisse() {
    if (!nomNouvelleCaisse.trim() || !etablissementId) return;
    setSaving(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('caisses')
      .insert({ etablissement_id: etablissementId, nom: nomNouvelleCaisse.trim() })
      .select('id')
      .single();

    setSaving(false);
    if (insertError || !data) {
      setError(`Erreur création : ${insertError?.message}`);
      return;
    }
    setNomNouvelleCaisse('');
    charger();
    setCaisseChoisie(data.id);
  }

  async function ouvrirCaisse() {
    if (!caisseChoisie) return;
    setSaving(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('ouvrir_caisse', {
      p_caisse_id: caisseChoisie,
      p_solde_initial: parseFloat(soldeInitial) || 0,
    });

    setSaving(false);
    if (rpcError) {
      setError(`Erreur ouverture : ${rpcError.message}`);
      return;
    }
    setSucces('Caisse ouverte.');
    setSoldeInitial('0');
    chargerSession(caisseChoisie);
  }

  async function ajouterMouvement() {
    if (!sessionActuelle || !montantMouvement || !libelleMouvement.trim()) {
      setError('Montant et libellé sont obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('caisse_mouvements').insert({
      caisse_session_id: sessionActuelle.id,
      type: typeMouvement,
      montant: parseFloat(montantMouvement) || 0,
      libelle: libelleMouvement.trim(),
      cree_par: user?.id,
    });

    setSaving(false);
    if (insertError) {
      setError(`Erreur mouvement : ${insertError.message}`);
      return;
    }
    setMontantMouvement('');
    setLibelleMouvement('');
    chargerSession(caisseChoisie);
  }

  async function fermerCaisse() {
    if (!sessionActuelle || !soldeCompte) {
      setError('Indique le solde compté physiquement.');
      return;
    }
    const confirmation = window.confirm('Confirmer la fermeture de la caisse ?');
    if (!confirmation) return;

    setSaving(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('fermer_caisse', {
      p_session_id: sessionActuelle.id,
      p_solde_compte: parseFloat(soldeCompte) || 0,
    });

    setSaving(false);
    if (rpcError) {
      setError(`Erreur fermeture : ${rpcError.message}`);
      return;
    }

    const resultat = data as { solde_theorique: number; solde_compte: number; ecart: number };
    setSucces(
      `Caisse fermée. Théorique : ${resultat.solde_theorique.toLocaleString('fr-FR')} F · ` +
      `Compté : ${resultat.solde_compte.toLocaleString('fr-FR')} F · ` +
      `Écart : ${resultat.ecart >= 0 ? '+' : ''}${resultat.ecart.toLocaleString('fr-FR')} F`
    );
    setSoldeCompte('');
    chargerSession(caisseChoisie);
  }

  const soldeActuel = sessionActuelle
    ? sessionActuelle.solde_initial
      + mouvements.filter((m) => m.type === 'entree').reduce((s, m) => s + m.montant, 0)
      - mouvements.filter((m) => m.type === 'sortie').reduce((s, m) => s + m.montant, 0)
    : 0;

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Caisse</h1>
      <p className="text-sm text-gray-500 mb-4">Ouverture, mouvements et journal.</p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {caisses.length === 0 ? (
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-500 mb-3">Aucune caisse créée pour le moment.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={nomNouvelleCaisse}
              onChange={(e) => setNomNouvelleCaisse(e.target.value)}
              placeholder="Nom de la caisse (ex: Caisse principale)"
              className="flex-1 border rounded-md px-3 py-2 text-sm"
            />
            <button onClick={creerCaisse} disabled={saving} className="bg-black text-white text-sm px-4 py-2 rounded-md">
              Créer
            </button>
          </div>
        </div>
      ) : (
        <>
          <select
            value={caisseChoisie}
            onChange={(e) => setCaisseChoisie(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm mb-4"
          >
            {caisses.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>

          {!sessionActuelle ? (
            <div className="border rounded-lg p-4 mb-6">
              <p className="font-semibold text-sm mb-3">Ouvrir la caisse</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="1"
                  value={soldeInitial}
                  onChange={(e) => setSoldeInitial(e.target.value)}
                  placeholder="Solde initial (FCFA)"
                  className="flex-1 border rounded-md px-3 py-2 text-sm"
                />
                <button onClick={ouvrirCaisse} disabled={saving} className="bg-black text-white text-sm px-4 py-2 rounded-md">
                  Ouvrir
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="border-2 border-black rounded-lg p-4 mb-4 text-center">
                <p className="text-xs text-gray-500 uppercase">Solde actuel</p>
                <p className="text-2xl font-bold">{soldeActuel.toLocaleString('fr-FR')} F</p>
              </div>

              <div className="border rounded-lg p-4 mb-4">
                <p className="font-semibold text-sm mb-3">Ajouter un mouvement</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <select
                    value={typeMouvement}
                    onChange={(e) => setTypeMouvement(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="entree">Entrée</option>
                    <option value="sortie">Sortie</option>
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
                  placeholder="Libellé (ex: Achat fournitures)"
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

              <div className="border rounded-lg overflow-hidden mb-4">
                <p className="bg-gray-100 px-3 py-2 text-sm font-semibold">Journal de la session</p>
                <table className="w-full text-sm">
                  <tbody>
                    {mouvements.length === 0 ? (
                      <tr><td className="px-3 py-3 text-center text-gray-400">Aucun mouvement.</td></tr>
                    ) : (
                      mouvements.map((m) => (
                        <tr key={m.id} className="border-t">
                          <td className="px-3 py-2">{m.libelle}</td>
                          <td className={`px-3 py-2 text-right font-medium ${m.type === 'entree' ? 'text-green-600' : 'text-red-600'}`}>
                            {m.type === 'entree' ? '+' : '-'}{m.montant.toLocaleString('fr-FR')} F
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border rounded-lg p-4">
                <p className="font-semibold text-sm mb-3">Fermer la caisse</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="1"
                    value={soldeCompte}
                    onChange={(e) => setSoldeCompte(e.target.value)}
                    placeholder="Solde compté physiquement"
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                  />
                  <button onClick={fermerCaisse} disabled={saving} className="bg-red-600 text-white text-sm px-4 py-2 rounded-md">
                    Fermer
                  </button>
                </div>
              </div>
            </>
          )}

          {historiqueSessions.length > 0 && (
            <div className="border rounded-lg overflow-hidden mt-6">
              <p className="bg-gray-100 px-3 py-2 text-sm font-semibold">Historique des sessions</p>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-1.5">Ouverture</th>
                    <th className="text-left px-3 py-1.5">Théorique</th>
                    <th className="text-left px-3 py-1.5">Compté</th>
                    <th className="text-left px-3 py-1.5">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {historiqueSessions.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-1.5">{new Date(s.ouverte_le).toLocaleDateString('fr-FR')}</td>
                      <td className="px-3 py-1.5">{s.solde_final_theorique?.toLocaleString('fr-FR')} F</td>
                      <td className="px-3 py-1.5">{s.solde_final_compte?.toLocaleString('fr-FR')} F</td>
                      <td className={`px-3 py-1.5 ${(s.ecart ?? 0) !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {(s.ecart ?? 0) >= 0 ? '+' : ''}{s.ecart?.toLocaleString('fr-FR')} F
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
  
