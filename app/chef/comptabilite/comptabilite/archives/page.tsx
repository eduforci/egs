'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Archive = {
  id: string;
  annee_scolaire: string;
  verrouillee: boolean;
  archive_le: string;
  donnees: any;
};

export default function ArchivesPage() {
  const supabase = createClient();

  const [role, setRole] = useState<string>('');
  const [anneeActuelle, setAnneeActuelle] = useState('');
  const [anneesDisponibles, setAnneesDisponibles] = useState<string[]>([]);
  const [archives, setArchives] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const peutGerer = ['chef', 'directeur_etudes', 'comptable', 'super_admin'].includes(role);
  const peutDeverrouiller = ['chef', 'directeur_etudes', 'super_admin'].includes(role);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié.');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, etablissement_id')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profil introuvable.');
      setRole(profile.role);

      const { data: etab } = await supabase
        .from('etablissements')
        .select('annee_scolaire_active')
        .eq('id', profile.etablissement_id)
        .single();

      setAnneeActuelle(etab?.annee_scolaire_active || '');

      const { data: annees } = await supabase
        .from('grille_frais')
        .select('annee_scolaire')
        .eq('etablissement_id', profile.etablissement_id);

      const uniques = Array.from(new Set((annees || []).map((a: any) => a.annee_scolaire))).sort().reverse();
      setAnneesDisponibles(uniques);

      const { data: arch, error: archError } = await supabase
        .from('archives_annuelles')
        .select('id, annee_scolaire, verrouillee, archive_le, donnees')
        .eq('type_archive', 'financier')
        .order('annee_scolaire', { ascending: false });

      if (archError) throw archError;
      setArchives(arch || []);
    } catch (e: any) {
      setError(e.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { charger(); }, [charger]);

  function archiveDe(annee: string) {
    return archives.find((a) => a.annee_scolaire === annee);
  }

  async function archiver(annee: string) {
    setBusy(annee);
    setError(null);
    setMessage(null);
    try {
      const { error: rpcError } = await supabase.rpc('archiver_annee_financiere', { p_annee_scolaire: annee });
      if (rpcError) throw rpcError;
      setMessage(`Année ${annee} archivée et verrouillée.`);
      await charger();
    } catch (e: any) {
      setError(e.message || 'Erreur lors de l\'archivage');
    } finally {
      setBusy(null);
    }
  }

  async function deverrouiller(annee: string) {
    setBusy(annee);
    setError(null);
    setMessage(null);
    try {
      const { error: rpcError } = await supabase.rpc('deverrouiller_annee_financiere', { p_annee_scolaire: annee });
      if (rpcError) throw rpcError;
      setMessage(`Année ${annee} déverrouillée temporairement pour correction.`);
      await charger();
    } catch (e: any) {
      setError(e.message || 'Erreur lors du déverrouillage');
    } finally {
      setBusy(null);
    }
  }

  async function reverrouiller(annee: string) {
    setBusy(annee);
    setError(null);
    setMessage(null);
    try {
      const { error: rpcError } = await supabase.rpc('reverrouiller_annee_financiere', { p_annee_scolaire: annee });
      if (rpcError) throw rpcError;
      setMessage(`Année ${annee} reverrouillée.`);
      await charger();
    } catch (e: any) {
      setError(e.message || 'Erreur lors du reverrouillage');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Archives annuelles</h1>
      <p className="text-sm text-gray-500 mb-4">Année scolaire active : {anneeActuelle}</p>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}
      {message && <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{message}</div>}

      {!peutGerer && (
        <div className="bg-gray-50 border text-gray-500 text-sm rounded-md p-3 mb-4">
          Vous consultez les archives en lecture seule.
        </div>
      )}

      <div className="space-y-3">
        {anneesDisponibles.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune année scolaire configurée pour le moment.</p>
        ) : (
          anneesDisponibles.map((annee) => {
            const arch = archiveDe(annee);
            const estActive = annee === anneeActuelle;
            return (
              <div key={annee} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold">{annee}{estActive && <span className="text-xs text-blue-600 ml-2">(en cours)</span>}</p>
                    {arch ? (
                      <p className="text-xs text-gray-500 mt-1">
                        Archivée le {new Date(arch.archive_le).toLocaleDateString('fr-FR')} —{' '}
                        {arch.verrouillee ? (
                          <span className="text-red-600 font-medium">Verrouillée</span>
                        ) : (
                          <span className="text-orange-600 font-medium">Déverrouillée temporairement</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">Non archivée</p>
                    )}
                  </div>
                </div>

                {arch && (
                  <div className="text-xs text-gray-600 grid grid-cols-2 gap-1 mb-3 bg-gray-50 rounded p-2">
                    <span>Total dû : {Number(arch.donnees?.dashboard?.total_du ?? 0).toLocaleString('fr-FR')} F</span>
                    <span>Total payé : {Number(arch.donnees?.dashboard?.total_paye ?? 0).toLocaleString('fr-FR')} F</span>
                    <span>Solde restant : {Number(arch.donnees?.dashboard?.solde_restant ?? 0).toLocaleString('fr-FR')} F</span>
                    <span>Taux recouvrement : {arch.donnees?.dashboard?.taux_recouvrement ?? 0} %</span>
                  </div>
                )}

                {peutGerer && (
                  <div className="flex gap-2">
                    <button
                      disabled={busy === annee}
                      onClick={() => archiver(annee)}
                      className="flex-1 bg-slate-900 text-white text-sm rounded-lg p-2 font-medium disabled:opacity-50"
                    >
                      {busy === annee ? '...' : arch ? 'Réarchiver (rafraîchir)' : 'Archiver'}
                    </button>
                    {arch && arch.verrouillee && peutDeverrouiller && (
                      <button
                        disabled={busy === annee}
                        onClick={() => deverrouiller(annee)}
                        className="flex-1 bg-orange-500 text-white text-sm rounded-lg p-2 font-medium disabled:opacity-50"
                      >
                        Déverrouiller
                      </button>
                    )}
                    {arch && !arch.verrouillee && (
                      <button
                        disabled={busy === annee}
                        onClick={() => reverrouiller(annee)}
                        className="flex-1 bg-slate-600 text-white text-sm rounded-lg p-2 font-medium disabled:opacity-50"
                      >
                        Reverrouiller
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
                              }
