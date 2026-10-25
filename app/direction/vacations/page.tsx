'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

type Pointage = {
  id: string;
  enseignant_id: string;
  classe_id: string | null;
  matiere_id: string | null;
  date_cours: string;
  heure_debut: string;
  heure_fin: string;
  duree_heures: number;
  taux_applique: number;
  montant: number;
  statut: 'en_attente' | 'valide' | 'rejete';
  motif_rejet: string | null;
  paiement_id: string | null;
};

type Paiement = {
  id: string;
  enseignant_id: string;
  total_heures: number;
  montant_total: number;
};

type Cahier = {
  enseignant_id: string;
  classe_id: string;
  matiere_id: string;
  date_cours: string;
  contenu: string;
  travail_a_faire: string | null;
};

type Nom = { id: string; nom: string };
type Caisse = { id: string; libelle: string };
type Compte = { id: string; libelle: string };

const jour = (d: string) => d.split('-').reverse().join('/');
const hhmm = (h: string) => h.slice(0, 5);
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

function heuresTexte(h: number): string {
  const total = Math.round(h * 60);
  const heures = Math.floor(total / 60);
  const min = total % 60;
  if (total === 0) return '0 h';
  if (min === 0) return `${heures} h`;
  if (heures === 0) return `${min} min`;
  return `${heures} h ${String(min).padStart(2, '0')}`;
}

function bornesMois(mois: string): { debut: string; fin: string } {
  const [a, m] = mois.split('-').map(Number);
  const debut = `${mois}-01`;
  const suivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  return { debut, fin: suivant };
}

const STATUT = {
  en_attente: { label: 'En attente', classe: 'bg-orange-100 text-orange-700' },
  valide: { label: 'Validé', classe: 'bg-green-100 text-green-700' },
  rejete: { label: 'Rejeté', classe: 'bg-red-100 text-red-700' },
} as const;

export default function VacationsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [onglet, setOnglet] = useState<'valider' | 'etat'>('valider');
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [etabId, setEtabId] = useState<string | null>(null);

  const [pointages, setPointages] = useState<Pointage[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [profs, setProfs] = useState<Nom[]>([]);
  const [classes, setClasses] = useState<Nom[]>([]);
  const [matieres, setMatieres] = useState<Nom[]>([]);
  const [cahiers, setCahiers] = useState<Cahier[]>([]);
  const [caisses, setCaisses] = useState<Caisse[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);

  const [loading, setLoading] = useState(true);
  const [travail, setTravail] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Onglet « À valider »
  const [filtreProf, setFiltreProf] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<'en_attente' | 'valide' | 'rejete' | 'tous'>('en_attente');
  const [rejetId, setRejetId] = useState<string | null>(null);
  const [motif, setMotif] = useState('');

  // Onglet « État du mois » : paiement
  const [payerProf, setPayerProf] = useState<string | null>(null);
  const [source, setSource] = useState(''); // "caisse:<id>" ou "compte:<id>"

  const nomProf = useCallback(
    (id: string) => profs.find((p) => p.id === id)?.nom ?? 'Enseignant',
    [profs]
  );
  const nomClasse = (id: string | null) => classes.find((c) => c.id === id)?.nom ?? 'Classe';
  const nomMatiere = (id: string | null) => matieres.find((m) => m.id === id)?.nom ?? 'Matière';
  // Entrées du cahier de texte du même enseignant, même classe, même matière, même jour
  const cahierDe = (p: Pointage) =>
    cahiers.filter(
      (c) =>
        c.enseignant_id === p.enseignant_id &&
        c.classe_id === p.classe_id &&
        c.matiere_id === p.matiere_id &&
        c.date_cours === p.date_cours
    );

  // ---------- Chargement ----------

  const charger = useCallback(
    async (etab: string, moisLu: string) => {
      const { debut, fin } = bornesMois(moisLu);

      const { data: pts, error } = await supabase
        .from('pointages_vacation')
        .select(
          'id, enseignant_id, classe_id, matiere_id, date_cours, heure_debut, heure_fin, duree_heures, taux_applique, montant, statut, motif_rejet, paiement_id'
        )
        .eq('etablissement_id', etab)
        .gte('date_cours', debut)
        .lt('date_cours', fin)
        .order('date_cours', { ascending: false })
        .order('heure_debut', { ascending: false });
      if (error) {
        setMessage({ type: 'error', text: error.message });
        return;
      }
      const liste = (pts || []) as Pointage[];
      setPointages(liste);

      const { data: pays } = await supabase
        .from('paiements_vacataires')
        .select('id, enseignant_id, total_heures, montant_total')
        .eq('etablissement_id', etab)
        .eq('mois', debut);
      setPaiements((pays || []) as Paiement[]);

      // Noms : requêtes séparées, jamais de jointure imbriquée avec profiles
      const ids = Array.from(new Set(liste.map((p) => p.enseignant_id)));
      const { data: contrats } = await supabase
        .from('contrats_vacataires')
        .select('enseignant_id')
        .eq('etablissement_id', etab);
      (contrats || []).forEach((c: any) => {
        if (!ids.includes(c.enseignant_id)) ids.push(c.enseignant_id);
      });
      if (ids.length > 0) {
        const { data: pr } = await supabase.from('profiles').select('id, nom, prenom').in('id', ids);
        setProfs(
          (pr || [])
            .map((p: any) => ({ id: p.id, nom: `${p.nom ?? ''} ${p.prenom ?? ''}`.trim() || 'Enseignant' }))
            .sort((a: Nom, b: Nom) => a.nom.localeCompare(b.nom))
        );
      } else {
        setProfs([]);
      }

      // Cahier de texte du mois : permet de voir ce qui a été fait pendant chaque cours pointé
      const { data: cah } = await supabase
        .from('cahier_texte')
        .select('enseignant_id, classe_id, matiere_id, date_cours, contenu, travail_a_faire')
        .eq('etablissement_id', etab)
        .gte('date_cours', debut)
        .lt('date_cours', fin);
      setCahiers((cah || []) as Cahier[]);

      const { data: cl } = await supabase.from('classes').select('id, nom').eq('etablissement_id', etab);
      setClasses((cl || []) as Nom[]);
      const { data: ma } = await supabase.from('matieres').select('id, nom').eq('etablissement_id', etab);
      setMatieres((ma || []) as Nom[]);
    },
    [supabase]
  );

  const chargerSourcesPaiement = useCallback(
    async (etab: string) => {
      const { data: ca } = await supabase.from('caisses').select('id, nom').eq('etablissement_id', etab);
      const { data: ses } = await supabase
        .from('caisse_sessions')
        .select('id, caisse_id, ouverte_le')
        .eq('statut', 'ouverte');
      setCaisses(
        (ses || []).map((s: any) => ({
          id: s.id,
          libelle: `${(ca || []).find((c: any) => c.id === s.caisse_id)?.nom ?? 'Caisse'} (ouverte le ${jour(
            String(s.ouverte_le).slice(0, 10)
          )})`,
        }))
      );
      const { data: cb } = await supabase
        .from('comptes_bancaires')
        .select('id, nom, banque')
        .eq('etablissement_id', etab);
      setComptes(
        (cb || []).map((c: any) => ({ id: c.id, libelle: `${c.nom}${c.banque ? ' · ' + c.banque : ''}` }))
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
      await charger(profil.etablissement_id, mois);
      await chargerSourcesPaiement(profil.etablissement_id);
      if (!annule) setLoading(false);
    })();
    return () => {
      annule = true;
    };
    // le changement de mois est géré plus bas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!etabId) return;
    setLoading(true);
    charger(etabId, mois).then(() => setLoading(false));
  }, [mois, etabId, charger]);

  // ---------- Validation ----------

  const changerStatut = async (ids: string[], statut: 'valide' | 'rejete' | 'en_attente', motifRejet?: string) => {
    if (ids.length === 0 || !etabId) return;
    setTravail(true);
    setMessage(null);
    const { error } = await supabase
      .from('pointages_vacation')
      .update({ statut, motif_rejet: statut === 'rejete' ? motifRejet || null : null })
      .in('id', ids)
      .is('paiement_id', null);
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({
        type: 'success',
        text:
          statut === 'valide'
            ? `${ids.length} pointage(s) validé(s).`
            : statut === 'rejete'
            ? 'Pointage rejeté.'
            : 'Pointage remis en attente.',
      });
      await charger(etabId, mois);
    }
    setRejetId(null);
    setMotif('');
    setTravail(false);
  };

  // ---------- Paiement ----------

  const payer = async () => {
    if (!payerProf || !source || !etabId) return;
    const [type, id] = source.split(':');
    setTravail(true);
    setMessage(null);
    const { error } = await supabase.rpc('payer_vacataire', {
      p_enseignant: payerProf,
      p_mois: `${mois}-01`,
      p_caisse_session: type === 'caisse' ? id : null,
      p_compte: type === 'compte' ? id : null,
    });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: `Paiement enregistré pour ${nomProf(payerProf)} et ajouté aux dépenses.` });
      setPayerProf(null);
      setSource('');
      await charger(etabId, mois);
    }
    setTravail(false);
  };

  // ---------- Calculs ----------

  const liste = pointages.filter(
    (p) =>
      (filtreStatut === 'tous' || p.statut === filtreStatut) &&
      (!filtreProf || p.enseignant_id === filtreProf)
  );
  const aValider = liste.filter((p) => p.statut === 'en_attente');

  const resume = useMemo(() => {
    const ids = Array.from(new Set([...pointages.map((p) => p.enseignant_id)]));
    return ids
      .map((id) => {
        const pts = pointages.filter((p) => p.enseignant_id === id);
        const aPayer = pts.filter((p) => p.statut === 'valide' && !p.paiement_id);
        const dejaPaye = paiements.filter((p) => p.enseignant_id === id);
        return {
          id,
          nom: nomProf(id),
          heuresAPayer: aPayer.reduce((s, p) => s + Number(p.duree_heures), 0),
          montantAPayer: aPayer.reduce((s, p) => s + Number(p.montant), 0),
          enAttenteNb: pts.filter((p) => p.statut === 'en_attente').length,
          rejetesNb: pts.filter((p) => p.statut === 'rejete').length,
          heuresPayees: dejaPaye.reduce((s, p) => s + Number(p.total_heures), 0),
          montantPaye: dejaPaye.reduce((s, p) => s + Number(p.montant_total), 0),
        };
      })
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [pointages, paiements, nomProf]);

  const totalAPayer = resume.reduce((s, r) => s + r.montantAPayer, 0);
  const totalPaye = resume.reduce((s, r) => s + r.montantPaye, 0);
  const profAPayer = resume.find((r) => r.id === payerProf) || null;

  const enseignantsListe = Array.from(new Set(pointages.map((p) => p.enseignant_id)));

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-2xl font-bold">Vacations</h1>
        <a
          href="/direction/vacations/contrats"
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white"
        >
          Contrats et taux horaires
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button
          onClick={() => setOnglet('valider')}
          className={`px-3 py-1.5 rounded-full text-sm ${
            onglet === 'valider' ? 'bg-gray-800 text-white' : 'border border-gray-300 bg-white'
          }`}
        >
          Pointages à valider
        </button>
        <button
          onClick={() => setOnglet('etat')}
          className={`px-3 py-1.5 rounded-full text-sm ${
            onglet === 'etat' ? 'bg-gray-800 text-white' : 'border border-gray-300 bg-white'
          }`}
        >
          État du mois et paiement
        </button>
        <input
          type="month"
          value={mois}
          onChange={(e) => e.target.value && setMois(e.target.value)}
          className="ml-auto border rounded-lg p-1.5 text-sm"
        />
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

      {/* ---------- Onglet : pointages à valider ---------- */}
      {!loading && onglet === 'valider' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select
              value={filtreProf}
              onChange={(e) => setFiltreProf(e.target.value)}
              className="border rounded-lg p-2 text-sm"
            >
              <option value="">Tous les vacataires</option>
              {enseignantsListe.map((id) => (
                <option key={id} value={id}>
                  {nomProf(id)}
                </option>
              ))}
            </select>
            <select
              value={filtreStatut}
              onChange={(e) => setFiltreStatut(e.target.value as any)}
              className="border rounded-lg p-2 text-sm"
            >
              <option value="en_attente">En attente</option>
              <option value="valide">Validés</option>
              <option value="rejete">Rejetés</option>
              <option value="tous">Tous</option>
            </select>
          </div>

          {aValider.length > 0 && (
            <button
              onClick={() => changerStatut(aValider.map((p) => p.id), 'valide')}
              disabled={travail}
              className="w-full bg-green-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Tout valider ({aValider.length} pointage{aValider.length > 1 ? 's' : ''} ·{' '}
              {fcfa(aValider.reduce((s, p) => s + Number(p.montant), 0))})
            </button>
          )}

          {liste.length === 0 && (
            <p className="text-sm text-gray-500">Aucun pointage pour ce filtre.</p>
          )}

          {liste.map((p) => {
            const st = STATUT[p.statut];
            return (
              <div key={p.id} className="border rounded-lg p-3 space-y-2 text-sm bg-white">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{nomProf(p.enseignant_id)}</span>
                  <span className="text-gray-500 whitespace-nowrap">{jour(p.date_cours)}</span>
                </div>
                <div className="text-gray-600">
                  {nomClasse(p.classe_id)} · {nomMatiere(p.matiere_id)}
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-gray-700">
                  <span>
                    {hhmm(p.heure_debut)} – {hhmm(p.heure_fin)} ({heuresTexte(Number(p.duree_heures))})
                  </span>
                  <span className="font-medium">{fcfa(Number(p.montant))}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${st.classe}`}>{st.label}</span>
                  {p.paiement_id && <span className="text-xs text-gray-500">Payé</span>}
                </div>
                {(() => {
                  const cah = cahierDe(p);
                  if (cah.length === 0) {
                    return (
                      <div className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-800 p-2">
                        Cahier de texte non rempli pour ce cours.
                      </div>
                    );
                  }
                  return (
                    <div className="text-xs rounded-md bg-gray-50 border p-2 space-y-1">
                      <div className="font-semibold text-gray-700">Cahier de texte</div>
                      {cah.map((c, i) => (
                        <div key={i} className="space-y-0.5">
                          <div className="text-gray-700 whitespace-pre-line">{c.contenu}</div>
                          {c.travail_a_faire && (
                            <div className="text-gray-600">
                              <span className="font-medium">À faire : </span>
                              {c.travail_a_faire}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {p.statut === 'rejete' && p.motif_rejet && (
                  <div className="text-xs text-red-700">Motif : {p.motif_rejet}</div>
                )}

                {!p.paiement_id && rejetId !== p.id && (
                  <div className="flex flex-wrap gap-2">
                    {p.statut !== 'valide' && (
                      <button
                        onClick={() => changerStatut([p.id], 'valide')}
                        disabled={travail}
                        className="px-3 py-1.5 rounded-md bg-green-700 text-white text-xs font-medium disabled:opacity-50"
                      >
                        Valider
                      </button>
                    )}
                    {p.statut !== 'rejete' && (
                      <button
                        onClick={() => {
                          setRejetId(p.id);
                          setMotif('');
                        }}
                        disabled={travail}
                        className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium disabled:opacity-50"
                      >
                        Rejeter
                      </button>
                    )}
                    {p.statut !== 'en_attente' && (
                      <button
                        onClick={() => changerStatut([p.id], 'en_attente')}
                        disabled={travail}
                        className="px-3 py-1.5 rounded-md border border-gray-300 text-xs disabled:opacity-50"
                      >
                        Remettre en attente
                      </button>
                    )}
                  </div>
                )}

                {rejetId === p.id && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={motif}
                      onChange={(e) => setMotif(e.target.value)}
                      placeholder="Motif du rejet (ex. cours non assuré)"
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => changerStatut([p.id], 'rejete', motif.trim())}
                        disabled={travail}
                        className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium disabled:opacity-50"
                      >
                        Confirmer le rejet
                      </button>
                      <button
                        onClick={() => setRejetId(null)}
                        className="px-3 py-1.5 rounded-md border border-gray-300 text-xs"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Onglet : état du mois et paiement ---------- */}
      {!loading && onglet === 'etat' && (
        <div className="space-y-3">
          <div className="hidden print:block text-lg font-bold">
            État des vacations — {mois.split('-').reverse().join('/')}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-lg p-3 bg-green-50">
              <div className="text-xs text-green-700">Reste à payer</div>
              <div className="text-lg font-bold text-green-800">{fcfa(totalAPayer)}</div>
            </div>
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="text-xs text-gray-600">Déjà payé ce mois</div>
              <div className="text-lg font-bold">{fcfa(totalPaye)}</div>
            </div>
          </div>

          {resume.length === 0 && (
            <p className="text-sm text-gray-500">Aucun pointage ce mois-ci.</p>
          )}

          {resume.length > 0 && (
            <div className="overflow-x-auto border rounded-lg bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="p-2">Vacataire</th>
                    <th className="p-2 text-right">Heures validées</th>
                    <th className="p-2 text-right">À payer</th>
                    <th className="p-2 text-right">Déjà payé</th>
                    <th className="p-2 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {resume.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="p-2">
                        <div className="font-medium">{r.nom}</div>
                        {r.enAttenteNb > 0 && (
                          <div className="text-xs text-orange-700">
                            {r.enAttenteNb} en attente de validation (non compté)
                          </div>
                        )}
                        {r.rejetesNb > 0 && (
                          <div className="text-xs text-red-700">{r.rejetesNb} rejeté(s)</div>
                        )}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">{heuresTexte(r.heuresAPayer)}</td>
                      <td className="p-2 text-right whitespace-nowrap font-medium">{fcfa(r.montantAPayer)}</td>
                      <td className="p-2 text-right whitespace-nowrap text-gray-600">
                        {r.montantPaye > 0 ? `${fcfa(r.montantPaye)} (${heuresTexte(r.heuresPayees)})` : '—'}
                      </td>
                      <td className="p-2 text-right print:hidden">
                        {r.montantAPayer > 0 && (
                          <button
                            onClick={() => {
                              setPayerProf(r.id);
                              setSource('');
                              setMessage(null);
                            }}
                            className="px-3 py-1.5 rounded-md bg-gray-800 text-white text-xs font-medium"
                          >
                            Payer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resume.length > 0 && (
            <button
              onClick={() => window.print()}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm print:hidden"
            >
              Imprimer l'état du mois
            </button>
          )}

          {profAPayer && (
            <div className="border-2 border-gray-800 rounded-lg p-3 space-y-3 bg-white print:hidden">
              <div className="font-semibold">
                Payer {profAPayer.nom} : {fcfa(profAPayer.montantAPayer)} ({heuresTexte(profAPayer.heuresAPayer)})
              </div>
              {profAPayer.enAttenteNb > 0 && (
                <div className="text-xs text-orange-700">
                  Attention : {profAPayer.enAttenteNb} pointage(s) encore en attente ne sont pas inclus dans
                  ce paiement. Validez-les d'abord si vous voulez les payer maintenant.
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Payé depuis</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full border rounded-lg p-2 text-sm"
                >
                  <option value="">-- Choisir --</option>
                  {caisses.length > 0 && (
                    <optgroup label="Caisse ouverte">
                      {caisses.map((c) => (
                        <option key={c.id} value={`caisse:${c.id}`}>
                          {c.libelle}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {comptes.length > 0 && (
                    <optgroup label="Compte bancaire">
                      {comptes.map((c) => (
                        <option key={c.id} value={`compte:${c.id}`}>
                          {c.libelle}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {caisses.length === 0 && comptes.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Aucune caisse ouverte ni compte bancaire. Ouvrez une session de caisse dans la
                    comptabilité, ou ajoutez un compte bancaire.
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Le paiement crée une dépense « Salaires » dans la comptabilité et verrouille ces pointages.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={payer}
                  disabled={!source || travail}
                  className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {travail ? 'Paiement...' : 'Confirmer le paiement'}
                </button>
                <button
                  onClick={() => setPayerProf(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
