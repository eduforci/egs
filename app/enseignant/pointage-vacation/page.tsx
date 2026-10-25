'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { avecDelai } from '@/lib/offline/appel-store';
import {
  cacheGet,
  cacheSet,
  definirUtilisateur,
  fileAjouter,
  fileCompter,
  fileLister,
  synchroniserVacations,
  type VacationEnAttente,
} from '@/lib/offline/vacation-store';
import EnseignantNav from '@/components/enseignant-nav';

type Affectation = {
  cle: string; // "classeId|matiereId"
  classeId: string;
  classeNom: string;
  matiereId: string;
  matiereNom: string;
};

type Contrat = { taux_horaire: number; actif: boolean } | null;

type Ligne = {
  id: string;
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
  enAttenteEnvoi?: boolean;
};

const DELAI = 10000;

const jour = (d: string) => d.split('-').reverse().join('/');
const hhmm = (h: string) => h.slice(0, 5);
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

function nouvelId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // secours si randomUUID n'existe pas
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Minutes entre deux heures "HH:MM"
function minutesEntre(debut: string, fin: string): number {
  if (!debut || !fin) return 0;
  const [h1, m1] = debut.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

function formatDuree(minutes: number): string {
  if (minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} h`;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

function bornesMois(mois: string): { debut: string; fin: string } {
  const [a, m] = mois.split('-').map(Number);
  const debut = `${mois}-01`;
  const suivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  return { debut, fin: suivant };
}

const STATUT: Record<Ligne['statut'], { label: string; classe: string }> = {
  en_attente: { label: 'En attente de validation', classe: 'bg-orange-100 text-orange-700' },
  valide: { label: 'Validé', classe: 'bg-green-100 text-green-700' },
  rejete: { label: 'Rejeté', classe: 'bg-red-100 text-red-700' },
};

export default function PointageVacationPage() {
  const supabase = useMemo(() => createClient(), []);

  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [contrat, setContrat] = useState<Contrat>(null);
  const [contratConnu, setContratConnu] = useState(false);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [pendings, setPendings] = useState<VacationEnAttente[]>([]);
  const [enseignantId, setEnseignantId] = useState<string | null>(null);
  const [pret, setPret] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  const [enAttente, setEnAttente] = useState(0);
  const [erreurSync, setErreurSync] = useState<string | null>(null);
  const [syncManuelle, setSyncManuelle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Mois affiché
  const [mois, setMois] = useState(aujourdhui().slice(0, 7));

  // Formulaire
  const [affCle, setAffCle] = useState('');
  const [dateCours, setDateCours] = useState(aujourdhui());
  const [heureDebut, setHeureDebut] = useState('');
  const [heureFin, setHeureFin] = useState('');

  // ---------- Lecture des pointages du mois ----------

  const lireMois = useCallback(
    async (uid: string, moisLu: string): Promise<boolean> => {
      try {
        const { debut, fin } = bornesMois(moisLu);
        const { data, error } = await avecDelai(
          supabase
            .from('pointages_vacation')
            .select(
              'id, classe_id, matiere_id, date_cours, heure_debut, heure_fin, duree_heures, taux_applique, montant, statut, motif_rejet'
            )
            .eq('enseignant_id', uid)
            .gte('date_cours', debut)
            .lt('date_cours', fin)
            .order('date_cours', { ascending: false })
            .order('heure_debut', { ascending: false }),
          DELAI
        );
        if (error) throw new Error(error.message);
        const liste = (data || []) as Ligne[];
        setLignes(liste);
        await cacheSet(`mois:${moisLu}`, liste);
        return true;
      } catch {
        return false;
      }
    },
    [supabase]
  );

  const majPendings = useCallback(async () => {
    const liste = await fileLister();
    setPendings(liste);
    setEnAttente(liste.length);
  }, []);

  // ---------- Chargement initial (réseau, sinon téléphone) ----------

  useEffect(() => {
    let annule = false;

    const charger = async () => {
      let userId: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        userId = data.session?.user?.id ?? null;
      } catch {
        userId = null;
      }
      if (userId) {
        await cacheSet('userId', userId);
      } else {
        userId = await cacheGet<string>('userId');
      }
      if (!userId) {
        setMessage({
          type: 'error',
          text: 'Session introuvable. Connectez-vous une fois avec Internet.',
        });
        return;
      }
      if (annule) return;

      // Chaque enseignant a son propre espace sur le téléphone
      definirUtilisateur(userId);
      setEnseignantId(userId);
      setPret(true);
      await majPendings();

      try {
        const { data: ct, error: errCt } = await avecDelai(
          supabase
            .from('contrats_vacataires')
            .select('taux_horaire, actif')
            .eq('enseignant_id', userId)
            .maybeSingle(),
          DELAI
        );
        if (errCt) throw new Error(errCt.message);

        const { data, error } = await avecDelai(
          supabase
            .from('affectations_enseignant')
            .select('classe_id, matiere_id, classes(id, nom), matieres(id, nom)')
            .eq('enseignant_id', userId),
          DELAI
        );
        if (error) throw new Error(error.message);

        const liste: Affectation[] = (data || [])
          .filter((r: any) => r.classes && r.matieres)
          .map((r: any) => ({
            cle: `${r.classe_id}|${r.matiere_id}`,
            classeId: r.classe_id,
            classeNom: r.classes.nom,
            matiereId: r.matiere_id,
            matiereNom: r.matieres.nom,
          }))
          .sort((a: Affectation, b: Affectation) =>
            `${a.classeNom} ${a.matiereNom}`.localeCompare(`${b.classeNom} ${b.matiereNom}`)
          );
        if (annule) return;
        setAffectations(liste);
        setContrat((ct as Contrat) ?? null);
        setContratConnu(true);
        setHorsLigne(false);
        await cacheSet('affectations', liste);
        await cacheSet('contrat', ct ?? null);

        const ok = await lireMois(userId, mois);
        if (!ok) {
          const enCache = await cacheGet<Ligne[]>(`mois:${mois}`);
          if (!annule && enCache) setLignes(enCache);
        }
      } catch {
        const aff = await cacheGet<Affectation[]>('affectations');
        const ct = await cacheGet<Contrat>('contrat');
        const rec = await cacheGet<Ligne[]>(`mois:${mois}`);
        if (annule) return;
        if (aff) {
          setAffectations(aff);
          setContrat(ct ?? null);
          setContratConnu(true);
          setLignes(rec ?? []);
          setHorsLigne(true);
        } else {
          setMessage({
            type: 'error',
            text: 'Impossible de charger vos classes. Ouvrez cette page une première fois avec Internet.',
          });
        }
      }
    };

    charger();
    return () => {
      annule = true;
    };
    // le mois est relu par un autre effet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, majPendings]);

  // Changement de mois
  useEffect(() => {
    if (!pret || !enseignantId) return;
    let annule = false;
    (async () => {
      const ok = await lireMois(enseignantId, mois);
      if (!ok) {
        const enCache = await cacheGet<Ligne[]>(`mois:${mois}`);
        if (!annule) setLignes(enCache ?? []);
      }
    })();
    return () => {
      annule = true;
    };
  }, [mois, pret, enseignantId, lireMois]);

  // ---------- Synchronisation automatique ----------

  const essayerSynchro = useCallback(async () => {
    const n = await fileCompter();
    if (n === 0) {
      setEnAttente(0);
      setPendings([]);
      setErreurSync(null);
      return;
    }
    const res = await synchroniserVacations(supabase);
    setErreurSync(res.erreur);
    await majPendings();
    if (res.envoyes > 0) {
      setHorsLigne(false);
      if (enseignantId) await lireMois(enseignantId, mois);
      if (res.restants === 0) {
        setMessage({ type: 'success', text: 'Pointages en attente envoyés au serveur.' });
      }
    }
  }, [supabase, majPendings, lireMois, enseignantId, mois]);

  useEffect(() => {
    if (!pret) return;
    essayerSynchro();
    // On réessaie toutes les 30 s : "en ligne" selon le navigateur ne garantit
    // pas qu'Internet fonctionne vraiment, donc on tente simplement l'envoi.
    const intervalle = setInterval(essayerSynchro, 30000);
    window.addEventListener('online', essayerSynchro);
    return () => {
      clearInterval(intervalle);
      window.removeEventListener('online', essayerSynchro);
    };
  }, [essayerSynchro, pret]);

  const envoyerMaintenant = async () => {
    setSyncManuelle(true);
    await essayerSynchro();
    setSyncManuelle(false);
  };

  // ---------- Enregistrement : d'abord sur le téléphone, puis envoi ----------

  const minutes = minutesEntre(heureDebut, heureFin);

  const pointer = async () => {
    setMessage(null);

    const aff = affectations.find((a) => a.cle === affCle);
    if (!aff) {
      setMessage({ type: 'error', text: 'Choisissez une classe et une matière.' });
      return;
    }
    if (!dateCours) {
      setMessage({ type: 'error', text: 'Indiquez la date du cours.' });
      return;
    }
    if (dateCours > aujourdhui()) {
      setMessage({ type: 'error', text: 'On ne peut pas pointer un cours qui n\'a pas encore eu lieu.' });
      return;
    }
    if (!heureDebut || !heureFin) {
      setMessage({ type: 'error', text: 'Indiquez l\'heure de début et l\'heure de fin.' });
      return;
    }
    if (minutes <= 0) {
      setMessage({ type: 'error', text: 'L\'heure de fin doit être après l\'heure de début.' });
      return;
    }
    if (minutes > 12 * 60) {
      setMessage({ type: 'error', text: 'Un pointage ne peut pas dépasser 12 heures.' });
      return;
    }

    const uid = enseignantId ?? (await cacheGet<string>('userId'));
    if (!uid) {
      setMessage({ type: 'error', text: 'Session introuvable. Connectez-vous avec Internet.' });
      return;
    }

    // Même cours déjà pointé (envoyé ou en attente) : inutile de le refaire
    const doublon =
      lignes.some(
        (l) =>
          l.classe_id === aff.classeId &&
          l.date_cours === dateCours &&
          hhmm(l.heure_debut) === heureDebut
      ) ||
      pendings.some(
        (p) => p.classeId === aff.classeId && p.dateCours === dateCours && p.heureDebut === heureDebut
      );
    if (doublon) {
      setMessage({
        type: 'error',
        text: 'Ce cours a déjà été pointé (même s\'il a été rejeté). Voyez avec l\'administration pour le corriger.',
      });
      return;
    }

    setSaving(true);

    const item: VacationEnAttente = {
      id: nouvelId(),
      enseignantId: uid,
      classeId: aff.classeId,
      matiereId: aff.matiereId,
      dateCours,
      heureDebut,
      heureFin,
      saisieLe: new Date().toISOString(),
    };

    try {
      await fileAjouter(item);
    } catch {
      setMessage({
        type: 'error',
        text: "Impossible d'enregistrer sur le téléphone (stockage plein ou bloqué).",
      });
      setSaving(false);
      return;
    }

    // Le formulaire est vidé, la classe et la date restent pour le pointage suivant
    setHeureDebut('');
    setHeureFin('');

    const res = await synchroniserVacations(supabase);
    setErreurSync(res.erreur);
    await majPendings();

    if (res.restants === 0) {
      setHorsLigne(false);
      await lireMois(uid, mois);
      setMessage({
        type: 'success',
        text: 'Pointage envoyé. Il sera compté une fois validé par l\'administration.',
      });
    } else {
      setMessage({
        type: 'info',
        text: 'Enregistré sur le téléphone. Il sera envoyé automatiquement dès que la connexion revient.',
      });
    }
    setSaving(false);
  };

  // ---------- Affichage ----------

  const nomAff = (classeId: string | null, matiereId: string | null) => {
    const a = affectations.find((x) => x.cle === `${classeId}|${matiereId}`);
    return a ? `${a.classeNom} · ${a.matiereNom}` : 'Classe';
  };

  const taux = contrat?.taux_horaire ?? 0;

  // Pointages en attente d'envoi, affichés avec ceux du mois choisi
  const { debut: debutMois, fin: finMois } = bornesMois(mois);
  const lignesTout: Ligne[] = [
    ...pendings
      .filter((p) => p.dateCours >= debutMois && p.dateCours < finMois)
      .map((p): Ligne => {
        const h = Math.max(0, minutesEntre(p.heureDebut, p.heureFin)) / 60;
        return {
          id: p.id,
          classe_id: p.classeId,
          matiere_id: p.matiereId,
          date_cours: p.dateCours,
          heure_debut: p.heureDebut,
          heure_fin: p.heureFin,
          duree_heures: h,
          taux_applique: taux,
          montant: Math.round(h * taux),
          statut: 'en_attente',
          motif_rejet: null,
          enAttenteEnvoi: true,
        };
      }),
    ...lignes.filter((r) => !pendings.some((p) => p.id === r.id)),
  ].sort(
    (a, b) =>
      b.date_cours.localeCompare(a.date_cours) || b.heure_debut.localeCompare(a.heure_debut)
  );

  const somme = (statut: Ligne['statut']) => {
    const l = lignesTout.filter((x) => x.statut === statut);
    return {
      heures: l.reduce((s, x) => s + Number(x.duree_heures), 0),
      montant: l.reduce((s, x) => s + Number(x.montant), 0),
    };
  };
  const valides = somme('valide');
  const attente = somme('en_attente');

  const heuresTexte = (h: number) => formatDuree(Math.round(h * 60));

  const couleurMessage = (type: 'success' | 'error' | 'info') =>
    type === 'success'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : type === 'info'
      ? 'bg-blue-50 text-blue-700 border border-blue-200'
      : 'bg-red-50 text-red-700 border border-red-200';

  const sansContrat = contratConnu && (!contrat || !contrat.actif);

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Pointage des vacations</h1>

      <EnseignantNav />

      {horsLigne && (
        <div className="p-3 rounded-lg text-sm bg-gray-100 text-gray-700 border border-gray-300">
          Mode hors ligne : vous pouvez pointer vos cours, ils seront envoyés plus tard.
        </div>
      )}

      {enAttente > 0 && (
        <div className="p-3 rounded-lg text-sm bg-orange-50 text-orange-800 border border-orange-200 space-y-2">
          <div>
            {enAttente} pointage(s) en attente d'envoi. Ne désinstallez pas l'application et ne
            videz pas les données du navigateur avant l'envoi.
          </div>
          {erreurSync && <div className="text-xs">Dernier essai : {erreurSync}</div>}
          <button
            type="button"
            onClick={envoyerMaintenant}
            disabled={syncManuelle}
            className="px-3 py-1.5 rounded-md bg-orange-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {syncManuelle ? 'Envoi...' : 'Envoyer maintenant'}
          </button>
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg text-sm ${couleurMessage(message.type)}`}>
          {message.text}
        </div>
      )}

      {sansContrat && (
        <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
          Vous n'avez pas de contrat de vacataire actif. Adressez-vous à l'administration de
          l'école : elle doit d'abord enregistrer votre taux horaire.
        </div>
      )}

      {contrat?.actif && (
        <div className="border rounded-lg p-3 text-sm flex justify-between">
          <span className="text-gray-600">Votre taux horaire</span>
          <span className="font-semibold">{fcfa(taux)}</span>
        </div>
      )}

      {!sansContrat && (
        <div className="border rounded-lg p-3 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Classe et matière</label>
            <select
              value={affCle}
              onChange={(e) => setAffCle(e.target.value)}
              className="w-full border rounded-lg p-2"
            >
              <option value="">-- Sélectionner --</option>
              {affectations.map((a) => (
                <option key={a.cle} value={a.cle}>
                  {a.classeNom} · {a.matiereNom}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date du cours</label>
            <input
              type="date"
              value={dateCours}
              max={aujourdhui()}
              onChange={(e) => setDateCours(e.target.value)}
              className="w-full border rounded-lg p-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Début</label>
              <input
                type="time"
                value={heureDebut}
                onChange={(e) => setHeureDebut(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Fin</label>
              <input
                type="time"
                value={heureFin}
                onChange={(e) => setHeureFin(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
            </div>
          </div>

          {minutes > 0 && (
            <div className="text-sm bg-gray-50 border rounded-lg p-2 flex justify-between">
              <span>Durée : {formatDuree(minutes)}</span>
              {taux > 0 && <span className="font-medium">≈ {fcfa((minutes / 60) * taux)}</span>}
            </div>
          )}

          <button
            onClick={pointer}
            disabled={saving}
            className="w-full bg-gray-800 text-white py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Pointer ce cours'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Mon mois</h2>
          <input
            type="month"
            value={mois}
            max={aujourdhui().slice(0, 7)}
            onChange={(e) => e.target.value && setMois(e.target.value)}
            className="border rounded-lg p-1.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
         <div className="border rounded-lg p-3 bg-green-50">
            <div className="text-xs text-green-700">Validé (à recevoir)</div>
            <div className="text-lg font-bold text-green-800">{fcfa(valides.montant)}</div>
            <div className="text-xs text-green-700">{heuresTexte(valides.heures)}</div>
          </div>
          <div className="border rounded-lg p-3 bg-orange-50">
            <div className="text-xs text-orange-700">En attente de validation</div>
            <div className="text-lg font-bold text-orange-800">{fcfa(attente.montant)}</div>
            <div className="text-xs text-orange-700">{heuresTexte(attente.heures)}</div>
          </div>
        </div>

        {lignesTout.length === 0 && (
          <p className="text-sm text-gray-500">Aucun pointage ce mois-ci.</p>
        )}
        {lignesTout.map((l) => {
          const st = STATUT[l.statut];
          return (
            <div key={l.id} className="border rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{nomAff(l.classe_id, l.matiere_id)}</span>
                <span className="text-gray-500 whitespace-nowrap">{jour(l.date_cours)}</span>
              </div>
              <div className="text-gray-600">
                {hhmm(l.heure_debut)} – {hhmm(l.heure_fin)} ·{' '}
                {heuresTexte(Number(l.duree_heures))} · {fcfa(Number(l.montant))}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`text-xs px-2 py-0.5 rounded-full ${st.classe}`}>{st.label}</span>
                {l.enAttenteEnvoi && (
                  <span className="text-xs text-orange-700">En attente d'envoi</span>
                )}
              </div>
              {l.statut === 'rejete' && l.motif_rejet && (
                <div className="text-xs text-red-700">Motif : {l.motif_rejet}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
