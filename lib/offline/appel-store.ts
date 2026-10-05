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
  cle: string; // "classeId|date" : un seul appel en attente par enseignant, classe et date
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

// ---------- Utilisateur courant : chaque enseignant a son propre espace ----------

let utilisateur = '';

export function definirUtilisateur(uid: string) {
  utilisateur = uid;
}

// 'userId' est le seul repère partagé : il sert à reconnaître l'enseignant sans connexion
function cleCache(cle: string) {
  return cle === 'userId' ? cle : `${utilisateur}:${cle}`;
}

function cleFile(cle: string) {
  return `${utilisateur}|${cle}`;
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

// ---------- Cache des données (classes, élèves, trimestres...) ----------

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

// Efface les classes et les élèves gardés sur le téléphone.
// Les appels pas encore envoyés ne sont PAS effacés.
export async function viderCache(): Promise<void> {
  try {
    await executer('cache', 'readwrite', (s) => s.clear());
  } catch {
    // rien à faire
  }
}

// ---------- File d'attente des appels à envoyer ----------

export async function fileAjouter(item: AppelEnAttente): Promise<void> {
  await executer('file', 'readwrite', (s) =>
    s.put(item, `${item.enseignantId}|${item.cle}`)
  );
}

export async function fileObtenir(cle: string): Promise<AppelEnAttente | null> {
  if (!utilisateur) return null;
  try {
    const v = await executer<AppelEnAttente | undefined>('file', 'readonly', (s) =>
      s.get(cleFile(cle))
    );
    return v ?? null;
  } catch {
    return null;
  }
}

// Ne renvoie que les appels de l'enseignant connecté
export async function fileLister(): Promise<AppelEnAttente[]> {
  if (!utilisateur) return [];
  try {
    const tous = await executer<AppelEnAttente[]>('file', 'readonly', (s) => s.getAll());
    return tous.filter((i) => i.enseignantId === utilisateur);
  } catch {
    return [];
  }
}

async function fileSupprimer(item: AppelEnAttente): Promise<void> {
  await executer('file', 'readwrite', (s) => s.delete(`${item.enseignantId}|${item.cle}`));
  // ancien format de clé, d'avant la séparation par enseignant
  await executer('file', 'readwrite', (s) => s.delete(item.cle));
}

export async function fileCompter(): Promise<number> {
  return (await fileLister()).length;
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

      // 2 bis. Garder la trace de l'appel (même sans aucun absent) pour le suivi de l'éducateur.
      // Non bloquant : si cette trace échoue, l'appel lui-même reste bien enregistré.
      const lignesAppel = Object.values(item.lignes);
      const { error: traceErr } = await avecDelai(
        supabase.from('appels_journaliers').upsert(
          {
            etablissement_id: item.etablissementId,
            classe_id: item.classeId,
            date: item.date,
            enseignant_id: item.enseignantId,
            nb_eleves: lignesAppel.length,
            nb_absents: lignesAppel.filter((l) => l.statut === 'absence').length,
            nb_retards: lignesAppel.filter((l) => l.statut === 'retard').length,
            saisi_le: item.saisieLe,
          },
          { onConflict: 'classe_id,date' }
        ),
        15000
      );
      if (traceErr) console.warn("Trace de l'appel non enregistrée :", traceErr.message);

      // 3. Tout est passé : on retire l'appel de la file
      await fileSupprimer(item);
      envoyes++;
    }
  } catch (e: any) {
    erreur = e?.message ?? 'Erreur réseau';
  } finally {
    syncEnCours = false;
  }

  return { envoyes, restants: await fileCompter(), erreur };
}
