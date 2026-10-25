import type { SupabaseClient } from '@supabase/supabase-js';
import { avecDelai } from '@/lib/offline/appel-store';

export type VacationEnAttente = {
  id: string; // identifiant créé sur le téléphone : un renvoi ne crée jamais de doublon
  enseignantId: string;
  classeId: string;
  matiereId: string;
  dateCours: string; // AAAA-MM-JJ
  heureDebut: string; // HH:MM
  heureFin: string; // HH:MM
  saisieLe: string; // date et heure réelles de la saisie sur le téléphone
};

const DB_NOM = 'egs-offline-vacation';
const DB_VERSION = 1;

// ---------- Utilisateur courant : chaque enseignant a son propre espace ----------

let utilisateur = '';

export function definirUtilisateur(uid: string) {
  utilisateur = uid;
}

// 'userId' est le seul repère partagé : il sert à reconnaître l'enseignant sans connexion
function cleCache(cle: string) {
  return cle === 'userId' ? cle : `${utilisateur}:${cle}`;
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

// ---------- Cache des données (affectations, contrat, derniers pointages) ----------

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

// ---------- File d'attente des pointages à envoyer ----------

export async function fileAjouter(item: VacationEnAttente): Promise<void> {
  await executer('file', 'readwrite', (s) => s.put(item, `${item.enseignantId}|${item.id}`));
}

// Ne renvoie que les pointages de l'enseignant connecté
export async function fileLister(): Promise<VacationEnAttente[]> {
  if (!utilisateur) return [];
  try {
    const tous = await executer<VacationEnAttente[]>('file', 'readonly', (s) => s.getAll());
    return tous
      .filter((i) => i.enseignantId === utilisateur)
      .sort((a, b) => a.saisieLe.localeCompare(b.saisieLe));
  } catch {
    return [];
  }
}

export async function fileSupprimerParId(item: VacationEnAttente): Promise<void> {
  await executer('file', 'readwrite', (s) => s.delete(`${item.enseignantId}|${item.id}`));
}

export async function fileCompter(): Promise<number> {
  return (await fileLister()).length;
}

// ---------- Synchronisation vers Supabase ----------

let syncEnCours = false;

export async function synchroniserVacations(
  supabase: SupabaseClient
): Promise<{ envoyes: number; restants: number; erreur: string | null }> {
  if (syncEnCours) {
    return { envoyes: 0, restants: await fileCompter(), erreur: null };
  }
  syncEnCours = true;
  let envoyes = 0;
  let erreur: string | null = null;

  try {
    const items = await fileLister();

    for (const item of items) {
      // ignoreDuplicates : si le pointage est déjà arrivé (envoi coupé au mauvais moment),
      // le renvoyer ne crée rien et ne modifie jamais un pointage déjà validé.
      // Le taux, le statut et l'enseignant sont imposés par la base, pas par le téléphone.
      const { error } = await avecDelai(
        supabase.from('pointages_vacation').upsert(
          {
            id: item.id,
            classe_id: item.classeId,
            matiere_id: item.matiereId,
            date_cours: item.dateCours,
            heure_debut: item.heureDebut,
            heure_fin: item.heureFin,
            created_at: item.saisieLe,
          },
          { onConflict: 'id', ignoreDuplicates: true }
        ),
        15000
      );
      // 23505 : même cours (classe, date, heure) déjà pointé avec un autre identifiant.
      // Ce n'est pas une panne : on retire l'entrée de la file au lieu de la renvoyer sans fin.
      const dejaPointe = !!error && (error as any).code === '23505';
      if (error && !dejaPointe) {
        erreur = error.message;
        break;
      }
      await fileSupprimerParId(item);
      envoyes++;
    }
  } catch (e: any) {
    erreur = e?.message ?? 'Erreur réseau';
  } finally {
    syncEnCours = false;
  }

  return { envoyes, restants: await fileCompter(), erreur };
}
