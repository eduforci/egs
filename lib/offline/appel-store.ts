import type { SupabaseClient } from '@supabase/supabase-js';

export type StatutEleve = 'present' | 'absence' | 'retard';

export type LigneAppel = {
  eleve_id: string;
  statut: StatutEleve;
  duree_minutes: number | null;
  justifie: boolean;
  motif: string;
};

export type AppelEnAttente = {
  cle: string; // "classeId|date" : un seul appel en attente par classe et par date
  classeId: string;
  date: string;
  etablissementId: string;
  trimestreId: string | null;
  enseignantId: string;
  lignes: Record<string, LigneAppel>;
  saisieLe: string; // date et heure réelles de la saisie sur le téléphone
};

const DB_NOM = 'egs-offline';
const DB_VERSION = 1;

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

// ---------- Cache des données (classes, élèves, trimestres...) ----------

export async function cacheGet<T>(cle: string): Promise<T | null> {
  try {
    const v = await executer<T | undefined>('cache', 'readonly', (s) => s.get(cle));
    return v ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet(cle: string, valeur: unknown): Promise<void> {
  try {
    await executer('cache', 'readwrite', (s) => s.put(valeur, cle));
  } catch {
    // le cache est facultatif : on ignore l'erreur
  }
}

// ---------- File d'attente des appels à envoyer ----------

export async function fileAjouter(item: AppelEnAttente): Promise<void> {
  await executer('file', 'readwrite', (s) => s.put(item, item.cle));
}

export async function fileObtenir(cle: string): Promise<AppelEnAttente | null> {
  try {
    const v = await executer<AppelEnAttente | undefined>('file', 'readonly', (s) => s.get(cle));
    return v ?? null;
  } catch {
    return null;
  }
}

export async function fileLister(): Promise<AppelEnAttente[]> {
  try {
    return await executer<AppelEnAttente[]>('file', 'readonly', (s) => s.getAll());
  } catch {
    return [];
  }
}

export async function fileSupprimer(cle: string): Promise<void> {
  await executer('file', 'readwrite', (s) => s.delete(cle));
}

export async function fileCompter(): Promise<number> {
  try {
    return await executer<number>('file', 'readonly', (s) => s.count());
  } catch {
    return 0;
  }
}

// ---------- Utilitaire : abandonner une requête trop lente ----------

export function avecDelai<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Délai dépassé')), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// ---------- Synchronisation vers Supabase ----------

let syncEnCours = false;

export async function synchroniserFile(
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
      // 1. Supprimer l'ancien appel journée complète de cette classe/date
      const { error: delErr } = await avecDelai(
        supabase
          .from('absences')
          .delete()
          .eq('classe_id', item.classeId)
          .eq('date', item.date)
          .is('matiere_id', null),
        15000
      );
      if (delErr) {
        erreur = delErr.message;
        break;
      }

      // 2. Réinsérer uniquement les absents et les retards
      const aInserer = Object.values(item.lignes)
        .filter((l) => l.statut !== 'present')
        .map((l) => ({
          eleve_id: l.eleve_id,
          classe_id: item.classeId,
          etablissement_id: item.etablissementId,
          trimestre_id: item.trimestreId,
          matiere_id: null,
          date: item.date,
          type: l.statut,
          duree_minutes: l.statut === 'retard' ? l.duree_minutes : null,
          justifie: l.justifie,
          motif: l.motif || null,
          enseignant_id: item.enseignantId,
          created_at: item.saisieLe,
        }));

      if (aInserer.length > 0) {
        const { error: insErr } = await avecDelai(
          supabase.from('absences').insert(aInserer),
          15000
        );
        if (insErr) {
          erreur = insErr.message;
          break;
        }
      }

      // 3. Tout est passé : on retire l'appel de la file
      await fileSupprimer(item.cle);
      envoyes++;
    }
  } catch (e: any) {
    erreur = e?.message ?? 'Erreur réseau';
  } finally {
    syncEnCours = false;
  }

  return { envoyes, restants: await fileCompter(), erreur };
}
