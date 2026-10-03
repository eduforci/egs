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
  synchroniserCahier,
  type CahierEnAttente,
} from '@/lib/offline/cahier-store';

type Affectation = {
  cle: string; // "classeId|matiereId"
  classeId: string;
  classeNom: string;
  matiereId: string;
  matiereNom: string;
};

type Entree = {
  id: string;
  classe_id: string;
  matiere_id: string;
  date_cours: string;
  prochain_cours_date: string | null;
  contenu: string;
  travail_a_faire: string | null;
  prochain_devoir_date: string | null;
  prochaine_interro_date: string | null;
  enAttente?: boolean;
};

const DELAI = 10000;

const jour = (d: string) => d.split('-').reverse().join('/');

function nouvelId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // secours si randomUUID n'existe pas
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function CahierTextePage() {
  const supabase = useMemo(() => createClient(), []);

  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [recents, setRecents] = useState<Entree[]>([]);
  const [pendings, setPendings] = useState<CahierEnAttente[]>([]);
  const [enseignantId, setEnseignantId] = useState<string | null>(null);
  const [pret, setPret] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  const [enAttente, setEnAttente] = useState(0);
  const [erreurSync, setErreurSync] = useState<string | null>(null);
  const [syncManuelle, setSyncManuelle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Formulaire
  const [affCle, setAffCle] = useState('');
  const [dateCours, setDateCours] = useState(new Date().toISOString().slice(0, 10));
  const [prochainCours, setProchainCours] = useState('');
  const [contenu, setContenu] = useState('');
  const [travail, setTravail] = useState('');
  const [devoirDate, setDevoirDate] = useState('');
  const [interroDate, setInterroDate] = useState('');
  const [precisions, setPrecisions] = useState('');

  // ---------- Lecture des dernières entrées ----------

  const lireRecents = useCallback(
    async (uid: string): Promise<boolean> => {
      try {
        const { data, error } = await avecDelai(
          supabase
            .from('cahier_texte')
            .select(
              'id, classe_id, matiere_id, date_cours, prochain_cours_date, contenu, travail_a_faire, prochain_devoir_date, prochaine_interro_date'
            )
            .eq('enseignant_id', uid)
            .order('date_cours', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(30),
          DELAI
        );
        if (error) throw new Error(error.message);
        const liste = (data || []) as Entree[];
        setRecents(liste);
        await cacheSet('recents', liste);
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
        setHorsLigne(false);
        await cacheSet('affectations', liste);

        const ok = await lireRecents(userId);
        if (!ok) {
          const enCache = await cacheGet<Entree[]>('recents');
          if (!annule && enCache) setRecents(enCache);
        }
      } catch {
        const aff = await cacheGet<Affectation[]>('affectations');
        const rec = await cacheGet<Entree[]>('recents');
        if (annule) return;
        if (aff) {
          setAffectations(aff);
          setRecents(rec ?? []);
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
  }, [supabase, lireRecents, majPendings]);

  // ---------- Synchronisation automatique ----------

  const essayerSynchro = useCallback(async () => {
    const n = await fileCompter();
    if (n === 0) {
      setEnAttente(0);
      setPendings([]);
      setErreurSync(null);
      return;
    }
    const res = await synchroniserCahier(supabase);
    setErreurSync(res.erreur);
    await majPendings();
    if (res.envoyes > 0) {
      setHorsLigne(false);
      if (enseignantId) await lireRecents(enseignantId);
      if (res.restants === 0) {
        setMessage({ type: 'success', text: 'Entrées en attente envoyées au serveur.' });
      }
    }
  }, [supabase, majPendings, lireRecents, enseignantId]);

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

  const enregistrer = async () => {
    setMessage(null);

    const aff = affectations.find((a) => a.cle === affCle);
    if (!aff) {
      setMessage({ type: 'error', text: 'Choisissez une classe et une matière.' });
      return;
    }
    if (!contenu.trim()) {
      setMessage({ type: 'error', text: 'Indiquez ce qui a été fait pendant le cours.' });
      return;
    }
    if (prochainCours && prochainCours < dateCours) {
      setMessage({ type: 'error', text: 'La date du prochain cours doit être après la date du cours.' });
      return;
    }
    if (devoirDate && devoirDate < dateCours) {
      setMessage({ type: 'error', text: 'La date du devoir doit être après la date du cours.' });
      return;
    }
    if (interroDate && interroDate < dateCours) {
      setMessage({ type: 'error', text: "La date de l'interrogation doit être après la date du cours." });
      return;
    }

    const uid = enseignantId ?? (await cacheGet<string>('userId'));
    if (!uid) {
      setMessage({ type: 'error', text: 'Session introuvable. Connectez-vous avec Internet.' });
      return;
    }

    setSaving(true);

    const item: CahierEnAttente = {
      id: nouvelId(),
      enseignantId: uid,
      classeId: aff.classeId,
      matiereId: aff.matiereId,
      dateCours,
      prochainCoursDate: prochainCours || null,
      contenu: contenu.trim(),
      travailAFaire: travail.trim() || null,
      prochainDevoirDate: devoirDate || null,
      prochaineInteroDate: interroDate || null,
      precisionsEvaluation: precisions.trim() || null,
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

    // Le formulaire est vidé, la classe et la date restent pour l'entrée suivante
    setProchainCours('');
    setContenu('');
    setTravail('');
    setDevoirDate('');
    setInterroDate('');
    setPrecisions('');

    const res = await synchroniserCahier(supabase);
    setErreurSync(res.erreur);
    await majPendings();

    if (res.restants === 0) {
      setHorsLigne(false);
      await lireRecents(uid);
      setMessage({ type: 'success', text: 'Cahier de texte enregistré.' });
    } else {
      setMessage({
        type: 'info',
        text: 'Enregistré sur le téléphone. Il sera envoyé automatiquement dès que la connexion revient.',
      });
    }
    setSaving(false);
  };

  // ---------- Affichage ----------

  const nomAff = (classeId: string, matiereId: string) => {
    const a = affectations.find((x) => x.cle === `${classeId}|${matiereId}`);
    return a ? `${a.classeNom} · ${a.matiereNom}` : 'Classe';
  };

  const entrees: Entree[] = [
    ...pendings.map(
      (p): Entree => ({
        id: p.id,
        classe_id: p.classeId,
        matiere_id: p.matiereId,
        date_cours: p.dateCours,
        prochain_cours_date: p.prochainCoursDate ?? null,
        contenu: p.contenu,
        travail_a_faire: p.travailAFaire,
        prochain_devoir_date: p.prochainDevoirDate,
        prochaine_interro_date: p.prochaineInteroDate,
        enAttente: true,
      })
    ),
    ...recents.filter((r) => !pendings.some((p) => p.id === r.id)),
  ].sort((a, b) => b.date_cours.localeCompare(a.date_cours));

  const couleurMessage = (type: 'success' | 'error' | 'info') =>
    type === 'success'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : type === 'info'
      ? 'bg-blue-50 text-blue-700 border border-blue-200'
      : 'bg-red-50 text-red-700 border border-red-200';

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Cahier de texte</h1>

      <nav className="flex gap-2 text-sm">
        <a
          href="/enseignant/appel"
          className="px-3 py-1.5 rounded-full border border-gray-300 text-gray-700"
        >
          Appel
        </a>
        <span className="px-3 py-1.5 rounded-full bg-gray-800 text-white">Cahier de texte</span>
      </nav>

      {horsLigne && (
        <div className="p-3 rounded-lg text-sm bg-gray-100 text-gray-700 border border-gray-300">
          Mode hors ligne : vous pouvez remplir le cahier de texte, il sera envoyé plus tard.
        </div>
      )}

      {enAttente > 0 && (
        <div className="p-3 rounded-lg text-sm bg-orange-50 text-orange-800 border border-orange-200 space-y-2">
          <div>
            {enAttente} entrée(s) en attente d'envoi. Ne désinstallez pas l'application et ne
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
            onChange={(e) => setDateCours(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Date du prochain cours (optionnel)</label>
          <input
            type="date"
            value={prochainCours}
            min={dateCours}
            onChange={(e) => setProchainCours(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Ce qui a été fait pendant le cours</label>
          <textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            rows={4}
            placeholder="Titre de la leçon, notions vues..."
            className="w-full border rounded-lg p-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Travail à faire (optionnel)</label>
          <textarea
            value={travail}
            onChange={(e) => setTravail(e.target.value)}
            rows={2}
            placeholder="Exercices, leçon à apprendre..."
            className="w-full border rounded-lg p-2 text-sm"
          />
        </div>

        <div className="border-t pt-3 space-y-3">
          <div className="text-sm font-semibold">Prochaines évaluations (le chef est prévenu)</div>

          <div>
            <label className="block text-sm font-medium mb-1">Date du prochain devoir</label>
            <input
              type="date"
              value={devoirDate}
              min={dateCours}
              onChange={(e) => setDevoirDate(e.target.value)}
              className="w-full border rounded-lg p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date de la prochaine interrogation</label>
            <input
              type="date"
              value={interroDate}
              min={dateCours}
              onChange={(e) => setInterroDate(e.target.value)}
              className="w-full border rounded-lg p-2"
            />
          </div>

          {(devoirDate || interroDate) && (
            <div>
              <label className="block text-sm font-medium mb-1">Précisions (optionnel)</label>
              <input
                type="text"
                value={precisions}
                onChange={(e) => setPrecisions(e.target.value)}
                placeholder="Chapitres concernés, durée..."
                className="w-full border rounded-lg p-2 text-sm"
              />
            </div>
          )}
        </div>

        <button
          onClick={enregistrer}
          disabled={saving}
          className="w-full bg-gray-800 text-white py-3 rounded-lg font-medium disabled:opacity-50"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Dernières entrées</h2>
        {entrees.length === 0 && (
          <p className="text-sm text-gray-500">Aucune entrée pour le moment.</p>
        )}
        {entrees.map((e) => (
          <div key={e.id} className="border rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{nomAff(e.classe_id, e.matiere_id)}</span>
              <span className="text-gray-500 whitespace-nowrap">{jour(e.date_cours)}</span>
            </div>
            {e.enAttente && (
              <div className="text-xs text-orange-700">En attente d'envoi</div>
            )}
            <div className="text-gray-700 whitespace-pre-line">{e.contenu}</div>
            {e.travail_a_faire && (
              <div className="text-gray-600">
                <span className="font-medium">À faire : </span>
                {e.travail_a_faire}
              </div>
            )}
            {e.prochain_cours_date && (
              <div className="text-gray-600">Prochain cours le {jour(e.prochain_cours_date)}</div>
            )}
            {e.prochain_devoir_date && (
              <div className="text-blue-700">Devoir le {jour(e.prochain_devoir_date)}</div>
            )}
            {e.prochaine_interro_date && (
              <div className="text-blue-700">Interrogation le {jour(e.prochaine_interro_date)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
