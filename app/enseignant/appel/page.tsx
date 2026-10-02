'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  avecDelai,
  cacheGet,
  cacheSet,
  fileAjouter,
  fileCompter,
  fileObtenir,
  synchroniserFile,
  type AppelEnAttente,
  type LigneAppel,
  type StatutEleve,
} from '@/lib/offline/appel-store';

type Classe = { id: string; nom: string };
type Eleve = { id: string; nom: string; prenoms: string; matricule: string };
type Trimestre = { id: string; date_debut: string; date_fin: string };
type ContexteClasse = { etablissementId: string | null; trimestres: Trimestre[] };
type DonneesClasse = { eleves: Eleve[]; contexte: ContexteClasse };
type AbsenceBrute = {
  eleve_id: string;
  type: string;
  duree_minutes: number | null;
  justifie: boolean | null;
  motif: string | null;
};

const DELAI = 10000;

function construireLignes(
  eleves: Eleve[],
  absences: Map<string, AbsenceBrute>
): Record<string, LigneAppel> {
  const r: Record<string, LigneAppel> = {};
  eleves.forEach((e) => {
    const a = absences.get(e.id);
    r[e.id] = {
      eleve_id: e.id,
      statut: a ? (a.type as StatutEleve) : 'present',
      duree_minutes: a?.duree_minutes ?? null,
      justifie: a?.justifie ?? false,
      motif: a?.motif ?? '',
    };
  });
  return r;
}

export default function CahierAppelPage() {
  const supabase = useMemo(() => createClient(), []);

  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeId, setClasseId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [lignes, setLignes] = useState<Record<string, LigneAppel>>({});
  const [contexte, setContexte] = useState<ContexteClasse | null>(null);
  const [enseignantId, setEnseignantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  const [enAttente, setEnAttente] = useState(0);
  const [enAttenteCourant, setEnAttenteCourant] = useState(false);
  const [erreurSync, setErreurSync] = useState<string | null>(null);
  const [syncManuelle, setSyncManuelle] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // ---------- Lecture réseau (avec délai maximum) ----------

  const lireClasseReseau = useCallback(
    async (id: string): Promise<DonneesClasse> => {
      const { data: elevesData, error: elevesError } = await avecDelai(
        supabase.from('eleves').select('id, matricule').eq('classe_id', id),
        DELAI
      );
      if (elevesError) throw new Error(elevesError.message);

      let elevesComplets: Eleve[] = [];
      if (elevesData && elevesData.length > 0) {
        const ids = elevesData.map((e: any) => e.id);
        const { data: profilsData, error: profilsError } = await avecDelai(
          supabase.from('profiles').select('id, nom, prenom').in('id', ids),
          DELAI
        );
        if (profilsError) throw new Error(profilsError.message);

        const profilsParId = new Map((profilsData || []).map((p: any) => [p.id, p]));
        elevesComplets = elevesData
          .map((e: any) => {
            const p: any = profilsParId.get(e.id);
            return {
              id: e.id,
              matricule: e.matricule,
              nom: p?.nom ?? '',
              prenoms: p?.prenom ?? '',
            };
          })
          .sort((a: Eleve, b: Eleve) => a.nom.localeCompare(b.nom));
      }

      const { data: classeInfo, error: classeError } = await avecDelai(
        supabase.from('classes').select('etablissement_id').eq('id', id).single(),
        DELAI
      );
      if (classeError) throw new Error(classeError.message);
      const etablissementId: string | null = classeInfo?.etablissement_id ?? null;

      let trimestres: Trimestre[] = [];
      if (etablissementId) {
        const { data: trimData, error: trimError } = await avecDelai(
          supabase
            .from('trimestres')
            .select('id, date_debut, date_fin')
            .eq('etablissement_id', etablissementId),
          DELAI
        );
        if (trimError) throw new Error(trimError.message);
        trimestres = (trimData || []) as Trimestre[];
      }

      return { eleves: elevesComplets, contexte: { etablissementId, trimestres } };
    },
    [supabase]
  );

  const lireAbsencesReseau = useCallback(
    async (id: string, jour: string): Promise<Map<string, AbsenceBrute>> => {
      const { data, error } = await avecDelai(
        supabase
          .from('absences')
          .select('eleve_id, type, duree_minutes, justifie, motif')
          .eq('classe_id', id)
          .eq('date', jour)
          .is('matiere_id', null),
        DELAI
      );
      if (error) throw new Error(error.message);
      return new Map((data || []).map((a: any) => [a.eleve_id, a as AbsenceBrute]));
    },
    [supabase]
  );

  // ---------- Chargement des classes (+ préchargement pour le hors ligne) ----------

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
      setEnseignantId(userId);

      try {
        const { data, error } = await avecDelai(
          supabase
            .from('affectations_enseignant')
            .select('classe_id, classes(id, nom)')
            .eq('enseignant_id', userId),
          DELAI
        );
        if (error) throw new Error(error.message);

        const classesUniques = new Map<string, Classe>();
        (data || []).forEach((row: any) => {
          if (row.classes) classesUniques.set(row.classes.id, row.classes);
        });
        const liste = Array.from(classesUniques.values());
        if (annule) return;
        setClasses(liste);
        setHorsLigne(false);
        await cacheSet('classes', liste);

        // Préchargement en arrière-plan : toutes les classes de l'enseignant
        // sont stockées sur le téléphone pour l'appel sans connexion.
        for (const c of liste) {
          try {
            const d = await lireClasseReseau(c.id);
            await cacheSet(`classe:${c.id}`, d);
          } catch {
            break;
          }
        }
      } catch {
        const enCache = await cacheGet<Classe[]>('classes');
        if (annule) return;
        if (enCache) {
          setClasses(enCache);
          setHorsLigne(true);
        } else {
          setMessage({
            type: 'error',
            text: "Impossible de charger les classes. Ouvrez cette page une première fois avec Internet.",
          });
        }
      }
    };

    charger();
    return () => {
      annule = true;
    };
  }, [supabase, lireClasseReseau]);

  // ---------- Chargement des élèves et de l'appel ----------

  const chargerEleves = useCallback(async () => {
    if (!classeId || !date) return;
    setLoading(true);
    setMessage(null);

    let donnees: DonneesClasse | null = null;
    let absencesMap: Map<string, AbsenceBrute> = new Map();
    let reseau = true;

    try {
      donnees = await lireClasseReseau(classeId);
      await cacheSet(`classe:${classeId}`, donnees);
      absencesMap = await lireAbsencesReseau(classeId, date);
      await cacheSet(`absences:${classeId}:${date}`, Array.from(absencesMap.entries()));
    } catch {
      reseau = false;
      if (!donnees) donnees = await cacheGet<DonneesClasse>(`classe:${classeId}`);
      const enCache = await cacheGet<[string, AbsenceBrute][]>(`absences:${classeId}:${date}`);
      absencesMap = new Map(enCache ?? []);
    }

    setHorsLigne(!reseau);

    if (!donnees) {
      setEleves([]);
      setLignes({});
      setContexte(null);
      setMessage({
        type: 'error',
        text: "Cette classe n'est pas encore enregistrée sur ce téléphone. Ouvrez-la une fois avec Internet.",
      });
      setLoading(false);
      return;
    }

    let nouvellesLignes = construireLignes(donnees.eleves, absencesMap);

    // Un appel saisi hors ligne et pas encore envoyé reste prioritaire à l'écran
    const enAttenteLocal = await fileObtenir(`${classeId}|${date}`);
    if (enAttenteLocal) {
      nouvellesLignes = { ...nouvellesLignes, ...enAttenteLocal.lignes };
    }

    setEleves(donnees.eleves);
    setLignes(nouvellesLignes);
    setContexte(donnees.contexte);
    setLoading(false);
  }, [classeId, date, lireClasseReseau, lireAbsencesReseau]);

  useEffect(() => {
    chargerEleves();
  }, [chargerEleves]);

  // ---------- Synchronisation automatique ----------

  const essayerSynchro = useCallback(async () => {
    const n = await fileCompter();
    if (n === 0) {
      setEnAttente(0);
      setErreurSync(null);
      return;
    }
    const res = await synchroniserFile(supabase);
    setEnAttente(res.restants);
    setErreurSync(res.erreur);
    if (res.envoyes > 0) setHorsLigne(false);
    if (res.envoyes > 0 && res.restants === 0) {
      setMessage({ type: 'success', text: 'Appels en attente envoyés au serveur.' });
    }
  }, [supabase]);

  useEffect(() => {
    essayerSynchro();
    // On réessaie toutes les 30 s : "en ligne" selon le navigateur ne garantit
    // pas qu'Internet fonctionne vraiment, donc on tente simplement l'envoi.
    const intervalle = setInterval(essayerSynchro, 30000);
    window.addEventListener('online', essayerSynchro);
    return () => {
      clearInterval(intervalle);
      window.removeEventListener('online', essayerSynchro);
    };
  }, [essayerSynchro]);

  // Indique si l'appel affiché attend encore d'être envoyé
  useEffect(() => {
    let annule = false;
    const verifier = async () => {
      if (!classeId || !date) {
        setEnAttenteCourant(false);
        return;
      }
      const item = await fileObtenir(`${classeId}|${date}`);
      if (!annule) setEnAttenteCourant(!!item);
    };
    verifier();
    return () => {
      annule = true;
    };
  }, [classeId, date, enAttente]);

  const envoyerMaintenant = async () => {
    setSyncManuelle(true);
    await essayerSynchro();
    setSyncManuelle(false);
  };

  const majLigne = (eleveId: string, patch: Partial<LigneAppel>) => {
    setLignes((prev) => ({
      ...prev,
      [eleveId]: { ...prev[eleveId], ...patch },
    }));
  };

  // ---------- Enregistrement : d'abord sur le téléphone, puis envoi ----------

  const enregistrer = async () => {
    setSaving(true);
    setMessage(null);

    const uid = enseignantId ?? (await cacheGet<string>('userId'));
    if (!uid || !contexte?.etablissementId) {
      setMessage({
        type: 'error',
        text: "Données de la classe incomplètes. Ouvrez la page une fois avec Internet puis réessayez.",
      });
      setSaving(false);
      return;
    }

    const trimestre = contexte.trimestres.find(
      (t) => t.date_debut <= date && date <= t.date_fin
    );

    const item: AppelEnAttente = {
      cle: `${classeId}|${date}`,
      classeId,
      date,
      etablissementId: contexte.etablissementId,
      trimestreId: trimestre?.id ?? null,
      enseignantId: uid,
      lignes,
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

    const nbAbsences = Object.values(lignes).filter((l) => l.statut !== 'present').length;
    const res = await synchroniserFile(supabase);
    setEnAttente(res.restants);
    setErreurSync(res.erreur);

    if (res.restants === 0) {
      setMessage({
        type: 'success',
        text: `Appel enregistré (${nbAbsences} absence(s)/retard(s)).`,
      });
    } else {
      setMessage({
        type: 'info',
        text: `Appel enregistré sur le téléphone (${nbAbsences} absence(s)/retard(s)). Il sera envoyé automatiquement dès que la connexion revient.`,
      });
    }
    setSaving(false);
  };

  const couleurMessage = (type: 'success' | 'error' | 'info') =>
    type === 'success'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : type === 'info'
      ? 'bg-blue-50 text-blue-700 border border-blue-200'
      : 'bg-red-50 text-red-700 border border-red-200';

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Cahier d'appel</h1>

      {horsLigne && (
        <div className="p-3 rounded-lg text-sm bg-gray-100 text-gray-700 border border-gray-300">
          Mode hors ligne : vous pouvez faire l'appel, il sera envoyé plus tard.
        </div>
      )}

      {enAttente > 0 && (
        <div className="p-3 rounded-lg text-sm bg-orange-50 text-orange-800 border border-orange-200 space-y-2">
          <div>
            {enAttente} appel(s) en attente d'envoi. Ne désinstallez pas l'application et ne
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

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Classe</label>
          <select
            value={classeId}
            onChange={(e) => setClasseId(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="">-- Sélectionner une classe --</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${couleurMessage(message.type)}`}>
          {message.text}
        </div>
      )}

      {loading && <p className="text-gray-500">Chargement...</p>}

      {!loading && classeId && eleves.length === 0 && !message && (
        <p className="text-gray-500">Aucun élève dans cette classe.</p>
      )}

      {!loading && eleves.length > 0 && (
        <div className="space-y-3">
          {enAttenteCourant && (
            <div className="text-xs text-orange-700">
              Cet appel est enregistré sur le téléphone et attend d'être envoyé.
            </div>
          )}

          {eleves.map((eleve) => {
            const ligne = lignes[eleve.id];
            if (!ligne) return null;
            return (
              <div key={eleve.id} className="border rounded-lg p-3 space-y-2">
                <div className="font-medium">{eleve.nom} {eleve.prenoms}</div>
                <div className="text-xs text-gray-500">{eleve.matricule}</div>

                <div className="flex gap-2">
                  {(['present', 'absence', 'retard'] as StatutEleve[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => majLigne(eleve.id, { statut: s })}
                      className={`flex-1 py-1.5 rounded-md text-sm font-medium border ${
                        ligne.statut === s
                          ? s === 'present'
                            ? 'bg-green-600 text-white border-green-600'
                            : s === 'absence'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white text-gray-600 border-gray-300'
                      }`}
                    >
                      {s === 'present' ? 'Présent' : s === 'absence' ? 'Absent' : 'Retard'}
                    </button>
                  ))}
                </div>

                {ligne.statut === 'retard' && (
                  <input
                    type="number"
                    placeholder="Durée du retard (minutes)"
                    value={ligne.duree_minutes ?? ''}
                    onChange={(e) =>
                      majLigne(eleve.id, {
                        duree_minutes: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    className="w-full border rounded-md p-1.5 text-sm"
                  />
                )}

                {ligne.statut !== 'present' && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ligne.justifie}
                        onChange={(e) => majLigne(eleve.id, { justifie: e.target.checked })}
                      />
                      Justifié
                    </label>
                    <input
                      type="text"
                      placeholder="Motif (optionnel)"
                      value={ligne.motif}
                      onChange={(e) => majLigne(eleve.id, { motif: e.target.value })}
                      className="w-full border rounded-md p-1.5 text-sm"
                    />
                  </>
                )}
              </div>
            );
          })}

          <button
            onClick={enregistrer}
            disabled={saving}
            className="w-full bg-gray-800 text-white py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : "Enregistrer l'appel"}
          </button>
        </div>
      )}
    </div>
  );
}
