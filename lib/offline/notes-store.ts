import type { SupabaseClient } from '@supabase/supabase-js';
import { avecDelai } from '@/lib/offline/appel-store';

// Une "saisie en attente" = tout ce que l'enseignant a modifié sur UNE page de notes
// (une classe, une matière, un trimestre) et qui n'est pas encore parti vers le serveur.
export type JobNotes = {
  cle: string;
  enseignantId: string;
  classeId: string;
  matiereId: string;
  trimestre: string;
  anneeScolaire: string;
  // Valeurs saisies, pour réafficher la page telle que l'enseignant l'a laissée
  cells: Record<string, string>; // "eleveId|evaluationId" -> note
  bonus: Record<string, string>; // eleveId -> bonus
  appreciations: Record<string, string>; // eleveId -> appréciation
  // Ce qu'il faudra écrire dans la base
  historiques: any[];
  notesAInserer: any[];
  elevesParEval: Record<string, string[]>;
  notifs: any[];
  bonusAUpserter: any[];
  bonusASupprimer: string[];
  obsASupprimer: string[];
  obsAInserer: any[];
  etape: number; // 0 = rien d'envoyé, puis 1, 2, 3, 4, 5 = terminé
  saisieLe: string;
};

const DB_NOM = 'egs-offline-notes';
const DB_VERSION = 1;
const DELAI = 15000;

// ---------- Utilisateur courant : chaque enseignant a son propre espace ----------

let utilisateur = '';

export function definirUtilisateur(uid: string) {
  utilisateur = uid;
}

// 'userId' est le seul repère partagé : il sert à reconnaître l'enseignant sans connexion
function cleCache(cle: string) {
  return cle === 'userId' ? cle : `${utilisateur}:${cle}`;
}

export function cleJob(
  enseignantId: string,
  classeId: string,
  matiereId: string,
  trimestre: string,
  anneeScolaire: string
) {
  return `${enseignantId}|${classeId}|${matiereId}|${trimestre}|${anneeScolaire}`;
}

// ---------- Base locale ----------

function ouvrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Stockage local indisponible'));
      return;
    }
    const req = indexedDB.open(DB_NOM, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      if (!db.objectStoreNames.contains('file')) db.createObjectStore('file');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function executer<T>(
  store: 'cache' | 'file',
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest
): Promise<T> {
  return ouvrirDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = action(t.objectStore(store));
        t.oncomplete = () => {
          db.close();
          resolve(req.result as T);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
        t.onabort = () => {
          db.close();
          reject(t.error);
        };
      })
  );
}

// ---------- Cache (liste des classes de l'enseignant...) ----------

export async function cacheGet<T>(cle: string): Promise<T | null> {
  try {
    const v = await executer<T | undefined>('cache', 'readonly', (s) => s.get(cleCache(cle)));
    return v ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet(cle: string, valeur: unknown): Promise<void> {
  try {
    await executer('cache', 'readwrite', (s) => s.put(valeur, cleCache(cle)));
  } catch {
    // le cache est facultatif : on ignore l'erreur
  }
}

// Efface le cache. Les saisies pas encore envoyées ne sont PAS effacées.
export async function viderCacheNotes(): Promise<void> {
  try {
    await executer('cache', 'readwrite', (s) => s.clear());
  } catch {
    // rien à faire
  }
}

// ---------- File d'attente ----------

export async function jobSauver(job: JobNotes): Promise<void> {
  await executer('file', 'readwrite', (s) => s.put(job, job.cle));
}

export async function jobObtenir(cle: string): Promise<JobNotes | null> {
  try {
    const v = await executer<JobNotes | undefined>('file', 'readonly', (s) => s.get(cle));
    return v ?? null;
  } catch {
    return null;
  }
}

export async function jobSupprimer(cle: string): Promise<void> {
  await executer('file', 'readwrite', (s) => s.delete(cle));
}

// Ne renvoie que les saisies de l'enseignant connecté
export async function jobLister(): Promise<JobNotes[]> {
  if (!utilisateur) return [];
  try {
    const tous = await executer<JobNotes[]>('file', 'readonly', (s) => s.getAll());
    return tous
      .filter((j) => j.enseignantId === utilisateur)
      .sort((a, b) => a.saisieLe.localeCompare(b.saisieLe));
  } catch {
    return [];
  }
}

export async function jobCompter(): Promise<number> {
  return (await jobLister()).length;
}

// Reconnaît une erreur due à l'absence de connexion (et non un refus du serveur)
export function estErreurReseau(msg?: string | null) {
  return /fetch|network|délai|timeout|load failed|internet/i.test(msg ?? '');
}

// ---------- Envoi vers Supabase ----------

let syncEnCours = false;

class Remplace extends Error {}

async function memeVersion(job: JobNotes) {
  const stocke = await jobObtenir(job.cle);
  return !!stocke && stocke.saisieLe === job.saisieLe;
}

// Exécute une saisie étape par étape. Chaque étape terminée est mémorisée :
// si la connexion se coupe au milieu, on reprend là où on s'était arrêté.
async function executerJob(supabase: SupabaseClient, job: JobNotes): Promise<string | null> {
  const passer = async (n: number) => {
    // Si l'enseignant a enregistré une version plus récente entre-temps, on s'arrête
    if (!(await memeVersion(job))) throw new Remplace();
    job.etape = n;
    await jobSauver(job);
  };

  // 1. Historique des modifications (comme avant : une erreur ici ne bloque pas les notes)
  if (job.etape < 1) {
    if (job.historiques.length > 0) {
      const { error } = await avecDelai(
        supabase.from('notes_historique').insert(job.historiques),
        DELAI
      );
      // Comme avant, un refus du serveur sur l'historique ne bloque pas les notes.
      // Mais une coupure réseau doit faire réessayer, sinon l'historique serait perdu.
      if (error && estErreurReseau(error.message)) return error.message;
    }
    await passer(1);
  }

  // 2. Notes : suppression par évaluation, puis insertion
  if (job.etape < 2) {
    const suppressions = await avecDelai(
      Promise.all(
        Object.entries(job.elevesParEval).map(([evId, ids]) =>
          supabase.from('notes').delete().eq('evaluation_id', evId).in('eleve_id', ids)
        )
      ),
      DELAI
    );
    const echec = suppressions.find((r) => r.error);
    if (echec?.error) return echec.error.message;

    if (job.notesAInserer.length > 0) {
      const { error } = await avecDelai(
        supabase.from('notes').insert(job.notesAInserer),
        DELAI
      );
      if (error) return error.message;
    }
    await passer(2);
  }

  // 3. Notifications au chef et au directeur des études
  if (job.etape < 3) {
    if (job.notifs.length > 0) {
      const { error } = await avecDelai(
        supabase.from('notifications').insert(job.notifs),
        DELAI
      );
      if (error) return error.message;
    }
    await passer(3);
  }

  // 4. Bonus
  if (job.etape < 4) {
    if (job.bonusAUpserter.length > 0) {
      const { error } = await avecDelai(
        supabase.from('bonus_moyenne').upsert(job.bonusAUpserter, {
          onConflict: 'eleve_id,matiere_id,trimestre,annee_scolaire',
        }),
        DELAI
      );
      if (error) return error.message;
    }
    if (job.bonusASupprimer.length > 0) {
      const { error } = await avecDelai(
        supabase
          .from('bonus_moyenne')
          .delete()
          .in('eleve_id', job.bonusASupprimer)
          .eq('matiere_id', job.matiereId)
          .eq('trimestre', Number(job.trimestre))
          .eq('annee_scolaire', job.anneeScolaire),
        DELAI
      );
      if (error) return error.message;
    }
    await passer(4);
  }

  // 5. Appréciations
  if (job.etape < 5) {
    if (job.obsASupprimer.length > 0) {
      const { error } = await avecDelai(
        supabase
          .from('observations')
          .delete()
          .in('eleve_id', job.obsASupprimer)
          .eq('matiere_id', job.matiereId)
          .eq('trimestre', job.trimestre)
          .eq('enseignant_id', job.enseignantId),
        DELAI
      );
      if (error) return error.message;
      if (job.obsAInserer.length > 0) {
        const { error: errIns } = await avecDelai(
          supabase.from('observations').insert(job.obsAInserer),
          DELAI
        );
        if (errIns) return errIns.message;
      }
    }
    await passer(5);
  }

  return null;
}

export async function synchroniserNotes(
  supabase: SupabaseClient
): Promise<{ envoyes: number; restants: number; erreur: string | null }> {
  if (syncEnCours) {
    return { envoyes: 0, restants: await jobCompter(), erreur: null };
  }
  syncEnCours = true;
  let envoyes = 0;
  let erreur: string | null = null;

  try {
    const jobs = await jobLister();

    for (const job of jobs) {
      try {
        const err = await executerJob(supabase, job);
        if (err) {
          erreur = err;
          break;
        }
        // On ne retire la saisie que si elle n'a pas été remplacée entre-temps
        if (await memeVersion(job)) {
          await jobSupprimer(job.cle);
          envoyes++;
        }
      } catch (e) {
        if (e instanceof Remplace) continue;
        throw e;
      }
    }
  } catch (e: any) {
    erreur = e?.message ?? 'Erreur réseau';
  } finally {
    syncEnCours = false;
  }

  return { envoyes, restants: await jobCompter(), erreur };
}
