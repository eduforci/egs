'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

type Contrat = {
  id: string;
  enseignant_id: string;
  taux_horaire: number;
  actif: boolean;
  date_debut: string | null;
};

type Enseignant = { id: string; nom: string };

const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

export default function ContratsVacatairesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [etabId, setEtabId] = useState<string | null>(null);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Nouveau contrat
  const [nouvelEns, setNouvelEns] = useState('');
  const [nouveauTaux, setNouveauTaux] = useState('');

  // Modification d'un taux
  const [editId, setEditId] = useState<string | null>(null);
  const [editTaux, setEditTaux] = useState('');

  const nomEns = (id: string) => enseignants.find((e) => e.id === id)?.nom ?? 'Enseignant';

  const charger = useCallback(
    async (etab: string) => {
      const { data: ct } = await supabase
        .from('contrats_vacataires')
        .select('id, enseignant_id, taux_horaire, actif, date_debut')
        .eq('etablissement_id', etab);
      setContrats((ct || []) as Contrat[]);

      // Deux requêtes séparées : enseignants de l'école
      const { data: pr } = await supabase
        .from('profiles')
        .select('id, nom, prenom, actif')
        .eq('etablissement_id', etab)
        .eq('role', 'enseignant');
      setEnseignants(
        (pr || [])
          .filter((p: any) => p.actif !== false)
          .map((p: any) => ({ id: p.id, nom: `${p.nom ?? ''} ${p.prenom ?? ''}`.trim() || 'Enseignant' }))
          .sort((a: Enseignant, b: Enseignant) => a.nom.localeCompare(b.nom))
      );
    },
    [supabase]
  );

  useEffect(() => {
    let annule = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', u.user.id)
        .single();
      if (!profil?.etablissement_id || annule) {
        setLoading(false);
        return;
      }
      setEtabId(profil.etablissement_id);
      await charger(profil.etablissement_id);
      if (!annule) setLoading(false);
    })();
    return () => {
      annule = true;
    };
  }, [supabase, charger]);

  const sansContrat = enseignants.filter((e) => !contrats.some((c) => c.enseignant_id === e.id));

  const creer = async () => {
    setMessage(null);
    const taux = Number(nouveauTaux.replace(/\s/g, '').replace(',', '.'));
    if (!nouvelEns) {
      setMessage({ type: 'error', text: 'Choisissez un enseignant.' });
      return;
    }
    if (!taux || taux <= 0) {
      setMessage({ type: 'error', text: 'Indiquez un taux horaire supérieur à 0.' });
      return;
    }
    if (!etabId) return;
    setSaving(true);
    const { error } = await supabase.from('contrats_vacataires').insert({
      etablissement_id: etabId,
      enseignant_id: nouvelEns,
      taux_horaire: taux,
      actif: true,
    });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: `Contrat créé pour ${nomEns(nouvelEns)}.` });
      setNouvelEns('');
      setNouveauTaux('');
      await charger(etabId);
    }
    setSaving(false);
  };

  const modifierTaux = async (c: Contrat) => {
    setMessage(null);
    const taux = Number(editTaux.replace(/\s/g, '').replace(',', '.'));
    if (!taux || taux <= 0) {
      setMessage({ type: 'error', text: 'Indiquez un taux horaire supérieur à 0.' });
      return;
    }
    if (!etabId) return;
    setSaving(true);
    const { error } = await supabase.from('contrats_vacataires').update({ taux_horaire: taux }).eq('id', c.id);
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({
        type: 'success',
        text: `Taux de ${nomEns(c.enseignant_id)} modifié. Les pointages déjà faits gardent leur ancien taux.`,
      });
      setEditId(null);
      await charger(etabId);
    }
    setSaving(false);
  };

  const basculerActif = async (c: Contrat) => {
    if (!etabId) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from('contrats_vacataires')
      .update({ actif: !c.actif })
      .eq('id', c.id);
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      await charger(etabId);
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Contrats des vacataires</h1>
        <a
          href="/direction/vacations"
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white"
        >
          ← Pointages
        </a>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}

      {!loading && (
        <>
          <div className="border rounded-lg p-3 space-y-3 bg-white">
            <div className="font-semibold text-sm">Nouveau contrat</div>
            <div>
              <label className="block text-sm font-medium mb-1">Enseignant</label>
              <select
                value={nouvelEns}
                onChange={(e) => setNouvelEns(e.target.value)}
                className="w-full border rounded-lg p-2 text-sm"
              >
                <option value="">-- Choisir --</option>
                {sansContrat.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
              {sansContrat.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Tous les enseignants ont déjà un contrat (ou aucun enseignant n'est créé).
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Taux horaire convenu (FCFA par heure)</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={nouveauTaux}
                onChange={(e) => setNouveauTaux(e.target.value)}
                placeholder="Ex. 2500"
                className="w-full border rounded-lg p-2 text-sm"
              />
            </div>
            <button
              onClick={creer}
              disabled={saving}
              className="w-full bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Créer le contrat'}
            </button>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Contrats existants</h2>
            {contrats.length === 0 && <p className="text-sm text-gray-500">Aucun contrat pour le moment.</p>}
            {contrats
              .slice()
              .sort((a, b) => nomEns(a.enseignant_id).localeCompare(nomEns(b.enseignant_id)))
              .map((c) => (
                <div key={c.id} className="border rounded-lg p-3 space-y-2 text-sm bg-white">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{nomEns(c.enseignant_id)}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        c.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {c.actif ? 'Actif' : 'Suspendu'}
                    </span>
                  </div>

                  {editId !== c.id ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-gray-700">Taux : {fcfa(Number(c.taux_horaire))} / heure</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditId(c.id);
                            setEditTaux(String(c.taux_horaire));
                          }}
                          className="px-3 py-1.5 rounded-md border border-gray-300 text-xs"
                        >
                          Modifier le taux
                        </button>
                        <button
                          onClick={() => basculerActif(c)}
                          disabled={saving}
                          className="px-3 py-1.5 rounded-md border border-gray-300 text-xs disabled:opacity-50"
                        >
                          {c.actif ? 'Suspendre' : 'Réactiver'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={editTaux}
                        onChange={(e) => setEditTaux(e.target.value)}
                        className="w-full border rounded-lg p-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => modifierTaux(c)}
                          disabled={saving}
                          className="px-3 py-1.5 rounded-md bg-gray-800 text-white text-xs font-medium disabled:opacity-50"
                        >
                          Enregistrer
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="px-3 py-1.5 rounded-md border border-gray-300 text-xs"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            <p className="text-xs text-gray-500">
              Un changement de taux ne s'applique qu'aux prochains pointages : les cours déjà pointés
              gardent le taux de leur jour.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
