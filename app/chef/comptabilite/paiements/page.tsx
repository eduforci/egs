'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Eleve = { id: string; nom: string; prenom: string; matricule: string; classe_nom: string };
type FraisEleve = { id: string; nom: string; montant_total: number; montant_paye: number; solde: number };
type ModePaiement = { id: string; nom: string };
type Paiement = {
  id: string; numero_recu: string; montant: number; date_paiement: string;
  eleve_nom: string; eleve_prenom: string; frais_nom: string; mode_nom: string;
  reference: string | null; responsable_financier: string | null; annule: boolean;
};

export default function PaiementsPage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [etablissementNom, setEtablissementNom] = useState('');
  const [modes, setModes] = useState<ModePaiement[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);

  const [rechercheEleve, setRechercheEleve] = useState('');
  const [resultatsEleves, setResultatsEleves] = useState<Eleve[]>([]);
  const [eleveChoisi, setEleveChoisi] = useState<Eleve | null>(null);
  const [fraisEleve, setFraisEleve] = useState<FraisEleve[]>([]);

  const [fraisChoisi, setFraisChoisi] = useState('');
  const [montant, setMontant] = useState('');
  const [modeChoisi, setModeChoisi] = useState('');
  const [reference, setReference] = useState('');
  const [responsable, setResponsable] = useState('');
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().slice(0, 10));

  const [recuAffiche, setRecuAffiche] = useState<any>(null);
  const [factureAffichee, setFactureAffichee] = useState<any>(null);

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

      const { data: etab } = await supabase
        .from('etablissements')
        .select('nom')
        .eq('id', profile.etablissement_id)
        .single();
      setEtablissementNom(etab?.nom ?? '');

      const { data: modesData, error: modesError } = await supabase
        .from('modes_paiement')
        .select('id, nom')
        .eq('etablissement_id', profile.etablissement_id)
        .order('ordre');

      if (modesError) throw new Error(`Erreur modes : ${modesError.message}`);
      setModes(modesData ?? []);

      await chargerPaiements(profile.etablissement_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function chargerPaiements(etabId: string) {
    const { data, error: paieError } = await supabase
      .from('paiements')
      .select('id, numero_recu, montant, date_paiement, reference, responsable_financier, annule, eleve_id, frais_id, mode_paiement_id')
      .eq('etablissement_id', etabId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (paieError) {
      setError(`Erreur paiements : ${paieError.message}`);
      return;
    }

    const eleveIds = Array.from(new Set((data ?? []).map((p) => p.eleve_id)));
    const fraisIds = Array.from(new Set((data ?? []).map((p) => p.frais_id)));
    const modeIds = Array.from(new Set((data ?? []).map((p) => p.mode_paiement_id)));

    const [profilesRes, fraisRes, modesRes] = await Promise.all([
      supabase.from('profiles').select('id, nom, prenom').in('id', eleveIds.length > 0 ? eleveIds : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('frais_scolarite').select('id, grille_frais_id').in('id', fraisIds.length > 0 ? fraisIds : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('modes_paiement').select('id, nom').in('id', modeIds.length > 0 ? modeIds : ['00000000-0000-0000-0000-000000000000']),
    ]);

    const grilleIds = Array.from(new Set((fraisRes.data ?? []).map((f) => f.grille_frais_id).filter(Boolean)));
    const { data: grilleData } = await supabase.from('grille_frais').select('id, nom').in('id', grilleIds.length > 0 ? grilleIds : ['00000000-0000-0000-0000-000000000000']);

    const profilesMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    const modesMap = new Map((modesRes.data ?? []).map((m) => [m.id, m.nom]));
    const grilleMap = new Map((grilleData ?? []).map((g) => [g.id, g.nom]));
    const fraisMap = new Map((fraisRes.data ?? []).map((f) => [f.id, f.grille_frais_id ? grilleMap.get(f.grille_frais_id) ?? 'Frais' : 'Frais']));

    const liste: Paiement[] = (data ?? []).map((p) => {
      const profil = profilesMap.get(p.eleve_id);
      return {
        id: p.id,
        numero_recu: p.numero_recu,
        montant: p.montant,
        date_paiement: p.date_paiement,
        eleve_nom: profil?.nom ?? 'Inconnu',
        eleve_prenom: profil?.prenom ?? '',
        frais_nom: fraisMap.get(p.frais_id) ?? 'Frais',
        mode_nom: modesMap.get(p.mode_paiement_id) ?? '-',
        reference: p.reference,
        responsable_financier: p.responsable_financier,
        annule: p.annule,
      };
    });
    setPaiements(liste);
  }

  async function rechercherEleves(texte: string) {
    setRechercheEleve(texte);
    setEleveChoisi(null);
    setFraisEleve([]);
    if (!etablissementId || texte.trim().length < 2) {
      setResultatsEleves([]);
      return;
    }

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, nom, prenom')
      .eq('etablissement_id', etablissementId)
      .eq('role', 'eleve')
      .or(`nom.ilike.%${texte}%,prenom.ilike.%${texte}%`)
      .limit(10);

    if (!profilesData || profilesData.length === 0) {
      setResultatsEleves([]);
      return;
    }

    const ids = profilesData.map((p) => p.id);
    const { data: elevesData } = await supabase
      .from('eleves')
      .select('id, matricule, classes(nom)')
      .in('id', ids);

    const elevesMap = new Map((elevesData ?? []).map((e) => [e.id, e]));

    const resultats: Eleve[] = profilesData.map((p) => {
      const ele = elevesMap.get(p.id);
      const cl = ele?.classes ? (Array.isArray(ele.classes) ? ele.classes[0] : ele.classes) : null;
      return {
        id: p.id, nom: p.nom, prenom: p.prenom,
        matricule: ele?.matricule ?? '-', classe_nom: (cl as any)?.nom ?? '-',
      };
    });
    setResultatsEleves(resultats);
  }

  async function choisirEleve(eleve: Eleve) {
    setEleveChoisi(eleve);
    setRechercheEleve(`${eleve.nom} ${eleve.prenom}`);
    setResultatsEleves([]);
    setFraisChoisi('');

    const { data: fraisData, error: fraisError } = await supabase
      .from('frais_scolarite')
      .select('id, montant_total, montant_paye, grille_frais_id')
      .eq('eleve_id', eleve.id);

    if (fraisError) {
      setError(`Erreur frais : ${fraisError.message}`);
      return;
    }

    const grilleIds = Array.from(new Set((fraisData ?? []).map((f) => f.grille_frais_id).filter(Boolean)));
    const { data: grilleData } = await supabase.from('grille_frais').select('id, nom').in('id', grilleIds.length > 0 ? grilleIds : ['00000000-0000-0000-0000-000000000000']);
    const grilleMap = new Map((grilleData ?? []).map((g) => [g.id, g.nom]));

    const liste: FraisEleve[] = (fraisData ?? []).map((f) => ({
      id: f.id,
      nom: f.grille_frais_id ? grilleMap.get(f.grille_frais_id) ?? 'Frais' : 'Frais',
      montant_total: f.montant_total,
      montant_paye: f.montant_paye,
      solde: f.montant_total - f.montant_paye,
    }));
    setFraisEleve(liste);
  }

  async function enregistrerPaiement() {
    if (!eleveChoisi || !fraisChoisi || !montant || !modeChoisi || !etablissementId) {
      setError('Élève, frais, montant et mode de paiement sont obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);
    setSucces(null);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: nouveauPaiement, error: insertError } = await supabase
      .from('paiements')
      .insert({
        etablissement_id: etablissementId,
        frais_id: fraisChoisi,
        eleve_id: eleveChoisi.id,
        montant: parseFloat(montant) || 0,
        mode_paiement_id: modeChoisi,
        reference: reference.trim() || null,
        responsable_financier: responsable.trim() || null,
        caissier_id: user?.id,
        date_paiement: datePaiement,
      })
      .select('id, numero_recu, montant, date_paiement')
      .single();

    setSaving(false);

    if (insertError || !nouveauPaiement) {
      setError(`Erreur enregistrement : ${insertError?.message}`);
      return;
    }

    const fraisConcerne = fraisEleve.find((f) => f.id === fraisChoisi);

    setRecuAffiche({
      numero_recu: nouveauPaiement.numero_recu,
      montant: nouveauPaiement.montant,
      date_paiement: nouveauPaiement.date_paiement,
      eleve: eleveChoisi,
      frais_nom: fraisConcerne?.nom ?? 'Frais',
      mode_nom: modes.find((m) => m.id === modeChoisi)?.nom ?? '',
      reference,
      responsable,
      etablissement_nom: etablissementNom,
    });

    setSucces('Paiement enregistré. Reçu généré ci-dessous.');
    setMontant('');
    setReference('');
    setResponsable('');
    setFraisChoisi('');
    setEleveChoisi(null);
    setRechercheEleve('');
    setFraisEleve([]);
    chargerPaiements(etablissementId);
  }

  async function annulerPaiement(id: string) {
    const confirmation = window.confirm('Annuler ce paiement ? Le solde du frais sera recrédité.');
    if (!confirmation) return;

    const { error: rpcError } = await supabase.rpc('annuler_paiement', { p_paiement_id: id });
    if (rpcError) {
      setError(`Erreur annulation : ${rpcError.message}`);
      return;
    }
    setSucces('Paiement annulé.');
    if (etablissementId) chargerPaiements(etablissementId);
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-3xl mx-auto pb-16">
      <div className="print:hidden">
        <h1 className="text-xl font-bold mb-1">Paiements</h1>
        <p className="text-sm text-gray-500 mb-4">Enregistrement et reçus automatiques.</p>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
        )}
        {succes && (
          <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
        )}

        {/* Formulaire d'enregistrement */}
        <div className="border rounded-lg p-4 mb-6">
          <p className="font-semibold text-sm mb-3">Enregistrer un paiement</p>

          <div className="mb-2">
            <input
              type="text"
              value={rechercheEleve}
              onChange={(e) => rechercherEleves(e.target.value)}
              placeholder="Rechercher un élève par nom ou prénom..."
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            {resultatsEleves.length > 0 && (
              <div className="border rounded-md mt-1 divide-y">
                {resultatsEleves.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => choisirEleve(e)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {e.nom} {e.prenom} <span className="text-gray-400 text-xs">({e.classe_nom})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {eleveChoisi && (
            <>
              {fraisEleve.length === 0 ? (
                <p className="text-xs text-gray-400 mb-2">Aucun frais généré pour cet élève.</p>
              ) : (
                <select
                  value={fraisChoisi}
                  onChange={(e) => setFraisChoisi(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm mb-2"
                >
                  <option value="">Choisir le frais concerné</option>
                  {fraisEleve.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom} — reste {f.solde.toLocaleString('fr-FR')} F / {f.montant_total.toLocaleString('fr-FR')} F
                    </option>
                  ))}
                </select>
              )}

              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="number"
                  step="1"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder="Montant payé (FCFA)"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
                <select
                  value={modeChoisi}
                  onChange={(e) => setModeChoisi(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Mode de paiement</option>
                  {modes.map((m) => (
                    <option key={m.id} value={m.id}>{m.nom}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="text"
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  placeholder="Responsable financier (payeur)"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Référence (optionnel)"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>

              <input
                type="date"
                value={datePaiement}
                onChange={(e) => setDatePaiement(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm mb-2"
              />

              <button
                onClick={enregistrerPaiement}
                disabled={saving || !fraisChoisi || !montant || !modeChoisi}
                className="w-full bg-black text-white text-sm py-2 rounded-md disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer le paiement'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reçu généré */}
      {recuAffiche && (
        <div className="border-2 rounded-lg p-4 mb-6 bg-white">
          <div className="flex justify-end mb-2 print:hidden">
            <button onClick={() => window.print()} className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-md">
              Imprimer le reçu
            </button>
          </div>
          <div className="text-center border-b pb-2 mb-2">
            <p className="text-xs font-semibold uppercase">{recuAffiche.etablissement_nom}</p>
            <p className="font-bold">REÇU DE PAIEMENT</p>
            <p className="text-xs text-gray-500">N° {recuAffiche.numero_recu}</p>
          </div>
          <div className="text-sm space-y-1">
            <p><span className="text-gray-500">Élève :</span> {recuAffiche.eleve.nom} {recuAffiche.eleve.prenom} ({recuAffiche.eleve.matricule})</p>
            <p><span className="text-gray-500">Classe :</span> {recuAffiche.eleve.classe_nom}</p>
            <p><span className="text-gray-500">Frais :</span> {recuAffiche.frais_nom}</p>
            <p><span className="text-gray-500">Montant :</span> <strong>{recuAffiche.montant.toLocaleString('fr-FR')} F CFA</strong></p>
            <p><span className="text-gray-500">Mode de paiement :</span> {recuAffiche.mode_nom}</p>
            {recuAffiche.responsable && <p><span className="text-gray-500">Payé par :</span> {recuAffiche.responsable}</p>}
            {recuAffiche.reference && <p><span className="text-gray-500">Référence :</span> {recuAffiche.reference}</p>}
            <p><span className="text-gray-500">Date :</span> {recuAffiche.date_paiement}</p>
          </div>
          <div className="flex justify-between mt-6 text-xs">
            <p>Caissier</p>
            <p>Cachet / Signature</p>
          </div>
        </div>
      )}

      {/* Liste des paiements récents */}
      <div className="print:hidden">
        <p className="font-semibold text-sm mb-2">Paiements récents</p>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Reçu</th>
                <th className="text-left px-3 py-2">Élève</th>
                <th className="text-left px-3 py-2">Frais</th>
                <th className="text-left px-3 py-2">Montant</th>
                <th className="text-left px-3 py-2">Mode</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {paiements.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">Aucun paiement.</td></tr>
              ) : (
                paiements.map((p) => (
                  <tr key={p.id} className={`border-t ${p.annule ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{p.numero_recu}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{p.eleve_nom} {p.eleve_prenom}</td>
                    <td className="px-3 py-2 text-gray-500">{p.frais_nom}</td>
                    <td className="px-3 py-2">{p.montant.toLocaleString('fr-FR')} F</td>
                    <td className="px-3 py-2 text-gray-500">{p.mode_nom}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.date_paiement}</td>
                    <td className="px-3 py-2">
                      {p.annule ? (
                        <span className="text-xs text-red-500">Annulé</span>
                      ) : (
                        <button onClick={() => annulerPaiement(p.id)} className="text-red-600 text-xs">
                          Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 15mm; }
        }
      `}</style>
    </main>
  );
}
