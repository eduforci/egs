'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type EleveListe = {
  eleve_id: string; nom: string; prenom: string; matricule: string; classe_nom: string;
  total_du: number; total_paye: number; solde: number;
};

type Echeance = { numero: number; montant: number; date_echeance: string; montant_paye: number };
type Remise = { id: string; libelle: string | null; mode: string; valeur: number; type_nom: string };
type LigneFrais = {
  id: string; nom: string; categorie_nom: string | null; annee_scolaire: string;
  montant_total: number; montant_remise: number; montant_net: number; montant_paye: number; solde: number;
  date_echeance: string; echeances: Echeance[] | null; remises: Remise[] | null;
};
type CompteDetail = { total_du: number; total_paye: number; total_remises: number; solde_restant: number; frais: LigneFrais[] };
type EcheancierOption = { id: string; nom: string };
type TypeRemise = { id: string; nom: string };

export default function ComptesElevesPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [eleves, setEleves] = useState<EleveListe[]>([]);
  const [recherche, setRecherche] = useState('');
  const [echeanciersOptions, setEcheanciersOptions] = useState<EcheancierOption[]>([]);
  const [typesRemisesOptions, setTypesRemisesOptions] = useState<TypeRemise[]>([]);

  const [fraisPourRemise, setFraisPourRemise] = useState('');
  const [typeRemiseChoisi, setTypeRemiseChoisi] = useState('');
  const [modeRemise, setModeRemise] = useState('montant_fixe');
  const [valeurRemise, setValeurRemise] = useState('');
  const [libelleRemise, setLibelleRemise] = useState('');

  const [eleveOuvert, setEleveOuvert] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompteDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [fraisChoisi, setFraisChoisi] = useState('');
  const [echeancierChoisi, setEcheancierChoisi] = useState('');
  const [datePremiere, setDatePremiere] = useState('');

  const [loading, setLoading] = useState(true);
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

      const { data: echOptions } = await supabase
        .from('echeanciers')
        .select('id, nom')
        .eq('etablissement_id', profile.etablissement_id);
      setEcheanciersOptions(echOptions ?? []);

      const { data: typesRemisesData } = await supabase
        .from('types_remises')
        .select('id, nom')
        .eq('etablissement_id', profile.etablissement_id)
        .order('ordre');
      setTypesRemisesOptions(typesRemisesData ?? []);

      const { data: elevesData, error: elevesError } = await supabase
        .from('eleves')
        .select('id, matricule, classe_id, classes(nom)')
        .eq('etablissement_id', profile.etablissement_id);

      if (elevesError) throw new Error(`Erreur élèves : ${elevesError.message}`);

      const eleveIds = (elevesData ?? []).map((e) => e.id);
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, nom, prenom')
        .in('id', eleveIds.length > 0 ? eleveIds : ['00000000-0000-0000-0000-000000000000']);
      const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

      const { data: fraisData, error: fraisError } = await supabase
        .from('frais_scolarite')
        .select('id, eleve_id, montant_total, montant_paye')
        .in('eleve_id', eleveIds.length > 0 ? eleveIds : ['00000000-0000-0000-0000-000000000000']);

      if (fraisError) throw new Error(`Erreur frais : ${fraisError.message}`);

      const fraisIds = (fraisData ?? []).map((f) => f.id);
      const { data: remisesData } = await supabase
        .from('remises')
        .select('frais_id, mode, valeur')
        .in('frais_id', fraisIds.length > 0 ? fraisIds : ['00000000-0000-0000-0000-000000000000']);

      const remiseParFrais = new Map<string, number>();
      (fraisData ?? []).forEach((f) => {
        const remisesDuFrais = (remisesData ?? []).filter((r) => r.frais_id === f.id);
        const totalRemise = remisesDuFrais.reduce((sum, r) => {
          const montant = r.mode === 'montant_fixe' ? Number(r.valeur) : (Number(f.montant_total) * Number(r.valeur)) / 100;
          return sum + montant;
        }, 0);
        remiseParFrais.set(f.id, Math.min(totalRemise, Number(f.montant_total) || 0));
      });

      const totauxParEleve = new Map<string, { du: number; paye: number }>();
      (fraisData ?? []).forEach((f) => {
        const existant = totauxParEleve.get(f.eleve_id) ?? { du: 0, paye: 0 };
        const remise = remiseParFrais.get(f.id) ?? 0;
        existant.du += (Number(f.montant_total) || 0) - remise;
        existant.paye += Number(f.montant_paye) || 0;
        totauxParEleve.set(f.eleve_id, existant);
      });

      type RowE = { id: string; matricule: string; classe_id: string; classes: { nom: string } | { nom: string }[] | null };
      const liste: EleveListe[] = ((elevesData ?? []) as unknown as RowE[]).map((e) => {
        const cl = Array.isArray(e.classes) ? e.classes[0] : e.classes;
        const profil = profilesMap.get(e.id);
        const totaux = totauxParEleve.get(e.id) ?? { du: 0, paye: 0 };
        return {
          eleve_id: e.id,
          nom: profil?.nom ?? 'Inconnu',
          prenom: profil?.prenom ?? '',
          matricule: e.matricule,
          classe_nom: cl?.nom ?? '-',
          total_du: totaux.du,
          total_paye: totaux.paye,
          solde: totaux.du - totaux.paye,
        };
      });
      liste.sort((a, b) => a.nom.localeCompare(b.nom));
      setEleves(liste);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ouvrirDetail(eleveId: string) {
    if (eleveOuvert === eleveId) {
      setEleveOuvert(null);
      setDetail(null);
      return;
    }
    setEleveOuvert(eleveId);
    setLoadingDetail(true);
    setDetail(null);

    const { data, error: rpcError } = await supabase.rpc('compte_financier_eleve', { p_eleve_id: eleveId });

    setLoadingDetail(false);
    if (rpcError) {
      setError(`Erreur détail : ${rpcError.message}`);
      return;
    }
    setDetail(data as CompteDetail);
  }

  async function ajouterRemise(eleveId: string) {
    if (!fraisPourRemise || !typeRemiseChoisi || !valeurRemise) {
      setError('Choisis un frais, un type de remise et une valeur.');
      return;
    }
    setError(null);
    setSucces(null);

    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('remises').insert({
      frais_id: fraisPourRemise,
      type_remise_id: typeRemiseChoisi,
      mode: modeRemise,
      valeur: parseFloat(valeurRemise) || 0,
      libelle: libelleRemise.trim() || null,
      cree_par: user?.id,
    });

    if (insertError) {
      setError(`Erreur : ${insertError.message}`);
      return;
    }

    setSucces('Remise appliquée.');
    setFraisPourRemise('');
    setTypeRemiseChoisi('');
    setValeurRemise('');
    setLibelleRemise('');
    ouvrirDetail(eleveId);
    setTimeout(() => ouvrirDetail(eleveId), 100);
    charger();
  }

  async function retirerRemise(id: string, eleveId: string) {
    const { error: deleteError } = await supabase.from('remises').delete().eq('id', id);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    ouvrirDetail(eleveId);
    setTimeout(() => ouvrirDetail(eleveId), 100);
    charger();
  }

  async function appliquerEcheancierAuFrais(eleveId: string) {
    if (!fraisChoisi || !echeancierChoisi || !datePremiere) {
      setError('Choisis un frais, un échéancier et une date.');
      return;
    }
    setError(null);
    setSucces(null);

    const { data, error: rpcError } = await supabase.rpc('appliquer_echeancier', {
      p_frais_id: fraisChoisi,
      p_echeancier_id: echeancierChoisi,
      p_date_premiere_echeance: datePremiere,
    });

    if (rpcError) {
      setError(`Erreur : ${rpcError.message}`);
      return;
    }

    setSucces(`${data} échéance(s) créée(s).`);
    setFraisChoisi('');
    setEcheancierChoisi('');
    setDatePremiere('');
    ouvrirDetail(eleveId);
    setTimeout(() => ouvrirDetail(eleveId), 100);
  }

  const elevesFiltres = eleves.filter((e) =>
    `${e.nom} ${e.prenom} ${e.matricule}`.toLowerCase().includes(recherche.toLowerCase())
  );

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Comptes financiers des élèves</h1>
      <p className="text-sm text-gray-500 mb-4">{eleves.length} élève(s)</p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      <input
        type="text"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un élève..."
        className="w-full border rounded-md px-3 py-2 text-sm mb-4"
      />

      <div className="space-y-2">
        {elevesFiltres.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Aucun élève trouvé.</p>
        )}
        {elevesFiltres.map((e) => (
          <div key={e.eleve_id} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => ouvrirDetail(e.eleve_id)}
              className="w-full flex justify-between items-center p-3 text-sm hover:bg-gray-50"
            >
              <div className="text-left">
                <p className="font-medium">{e.nom} {e.prenom}</p>
                <p className="text-xs text-gray-400">{e.matricule} · {e.classe_nom}</p>
              </div>
              <div className="text-right">
                <p className={`font-semibold ${e.solde > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {e.solde.toLocaleString('fr-FR')} F
                </p>
                <p className="text-[10px] text-gray-400">solde restant</p>
              </div>
            </button>

            {eleveOuvert === e.eleve_id && (
              <div className="border-t bg-gray-50 p-3 text-sm">
                {loadingDetail ? (
                  <p className="text-gray-400">Chargement...</p>
                ) : detail ? (
                  <>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <div className="bg-white border rounded p-2 text-center">
                        <p className="font-semibold">{detail.total_du.toLocaleString('fr-FR')} F</p>
                        <p className="text-[9px] text-gray-500">Total dû (net)</p>
                      </div>
                      <div className="bg-white border rounded p-2 text-center">
                        <p className="font-semibold text-amber-600">{detail.total_remises.toLocaleString('fr-FR')} F</p>
                        <p className="text-[9px] text-gray-500">Remises</p>
                      </div>
                      <div className="bg-white border rounded p-2 text-center">
                        <p className="font-semibold">{detail.total_paye.toLocaleString('fr-FR')} F</p>
                        <p className="text-[9px] text-gray-500">Total payé</p>
                      </div>
                      <div className="bg-white border rounded p-2 text-center">
                        <p className="font-semibold">{detail.solde_restant.toLocaleString('fr-FR')} F</p>
                        <p className="text-[9px] text-gray-500">Solde</p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-3">
                      {(detail.frais ?? []).map((f) => (
                        <div key={f.id} className="bg-white border rounded p-2">
                          <div className="flex justify-between">
                            <span className="font-medium">{f.nom}</span>
                            <span>{f.montant_paye.toLocaleString('fr-FR')} / {f.montant_net.toLocaleString('fr-FR')} F</span>
                          </div>
                          {f.montant_remise > 0 && (
                            <p className="text-[10px] text-amber-600">
                              Prix plein {f.montant_total.toLocaleString('fr-FR')} F − remise {f.montant_remise.toLocaleString('fr-FR')} F
                            </p>
                          )}
                          <p className="text-[10px] text-gray-400">Échéance : {f.date_echeance}</p>
                          {f.echeances && f.echeances.length > 0 && (
                            <div className="mt-1 pl-2 border-l-2 space-y-0.5">
                              {f.echeances.map((ec) => (
                                <p key={ec.numero} className="text-[10px] text-gray-500">
                                  Éch. {ec.numero} : {ec.montant.toLocaleString('fr-FR')} F au {ec.date_echeance}
                                  {ec.montant_paye > 0 ? ` (payé : ${ec.montant_paye.toLocaleString('fr-FR')} F)` : ''}
                                </p>
                              ))}
                            </div>
                          )}
                          {f.remises && f.remises.length > 0 && (
                            <div className="mt-1 pl-2 border-l-2 border-amber-300 space-y-0.5">
                              {f.remises.map((r) => (
                                <div key={r.id} className="flex justify-between items-center">
                                  <p className="text-[10px] text-amber-700">
                                    {r.type_nom}{r.libelle ? ` — ${r.libelle}` : ''} : {r.mode === 'montant_fixe' ? `${r.valeur.toLocaleString('fr-FR')} F` : `${r.valeur}%`}
                                  </p>
                                  <button onClick={() => retirerRemise(r.id, e.eleve_id)} className="text-red-600 text-[10px]">
                                    Retirer
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {(detail.frais ?? []).length === 0 && (
                        <p className="text-gray-400 text-xs">Aucun frais généré pour cet élève.</p>
                      )}
                    </div>

                    {/* Appliquer un échéancier à un frais */}
                    {(detail.frais ?? []).length > 0 && echeanciersOptions.length > 0 && (
                      <div className="bg-white border rounded p-2">
                        <p className="text-xs font-medium mb-2">Appliquer un échéancier à un frais</p>
                        <div className="space-y-1.5">
                          <select
                            value={fraisChoisi}
                            onChange={(ev) => setFraisChoisi(ev.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-xs"
                          >
                            <option value="">Choisir un frais</option>
                            {(detail.frais ?? []).map((f) => (
                              <option key={f.id} value={f.id}>{f.nom} — {f.montant_total.toLocaleString('fr-FR')} F</option>
                            ))}
                          </select>
                          <select
                            value={echeancierChoisi}
                            onChange={(ev) => setEcheancierChoisi(ev.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-xs"
                          >
                            <option value="">Choisir un échéancier</option>
                            {echeanciersOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.nom}</option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={datePremiere}
                            onChange={(ev) => setDatePremiere(ev.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-xs"
                          />
                          <button
                            onClick={() => appliquerEcheancierAuFrais(e.eleve_id)}
                            className="w-full bg-blue-600 text-white text-xs py-1.5 rounded"
                          >
                            Appliquer
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Appliquer une remise à un frais */}
                    {(detail.frais ?? []).length > 0 && typesRemisesOptions.length > 0 && (
                      <div className="bg-white border rounded p-2 mt-2">
                        <p className="text-xs font-medium mb-2">Appliquer une remise / bourse</p>
                        <div className="space-y-1.5">
                          <select
                            value={fraisPourRemise}
                            onChange={(ev) => setFraisPourRemise(ev.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-xs"
                          >
                            <option value="">Choisir un frais</option>
                            {(detail.frais ?? []).map((f) => (
                              <option key={f.id} value={f.id}>{f.nom} — {f.montant_total.toLocaleString('fr-FR')} F</option>
                            ))}
                          </select>
                          <select
                            value={typeRemiseChoisi}
                            onChange={(ev) => setTypeRemiseChoisi(ev.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-xs"
                          >
                            <option value="">Type de remise</option>
                            {typesRemisesOptions.map((t) => (
                              <option key={t.id} value={t.id}>{t.nom}</option>
                            ))}
                          </select>
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              value={modeRemise}
                              onChange={(ev) => setModeRemise(ev.target.value)}
                              className="w-full border rounded px-2 py-1.5 text-xs"
                            >
                              <option value="montant_fixe">Montant fixe (F)</option>
                              <option value="pourcentage">Pourcentage (%)</option>
                            </select>
                            <input
                              type="number"
                              step="0.5"
                              value={valeurRemise}
                              onChange={(ev) => setValeurRemise(ev.target.value)}
                              placeholder="Valeur"
                              className="w-full border rounded px-2 py-1.5 text-xs"
                            />
                          </div>
                          <input
                            type="text"
                            value={libelleRemise}
                            onChange={(ev) => setLibelleRemise(ev.target.value)}
                            placeholder="Détail (optionnel)"
                            className="w-full border rounded px-2 py-1.5 text-xs"
                          />
                          <button
                            onClick={() => ajouterRemise(e.eleve_id)}
                            className="w-full bg-amber-600 text-white text-xs py-1.5 rounded"
                          >
                            Appliquer la remise
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-400">Aucune donnée.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

                              
