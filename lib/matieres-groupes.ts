import { cleDeMatiere } from '@/lib/volumes-officiels';

export type GroupeBilan = 'Lettres' | 'Sciences' | 'Autres';
export const GROUPES_BILAN: GroupeBilan[] = ['Lettres', 'Sciences', 'Autres'];

const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Groupe du bilan (bulletin) d'une matière d'après son nom :
// Lettres = français, langues, histoire-géographie, philosophie ; Sciences = maths, physique-chimie, SVT ;
// Autres = EPS, arts, EDHC, conduite, TIC et le reste.
export function groupeDeMatiere(nom: string): GroupeBilan {
  const cle = cleDeMatiere(nom);
  if (cle === 'francais' || cle === 'anglais' || cle === 'lv2' || cle === 'hg' || cle === 'philo') return 'Lettres';
  if (cle === 'maths' || cle === 'pc' || cle === 'svt') return 'Sciences';
  if (cle) return 'Autres';
  const n = sansAccent(nom);
  if (/arabe|latin|russe|chinois|italien|portugais|lecture|dictee|grammaire|expression|litterature|redaction|orthographe|composition francaise/.test(n)) return 'Lettres';
  if (/mathemat|^maths?$|physique|chimie|^pc$|^pct$|^svt$|science.*(vie|terre)|biologie/.test(n)) return 'Sciences';
  return 'Autres';
}

// Pour une matière enregistrée sans groupe précis (« Autres » ou vide) : le groupe qu'elle devrait avoir, sinon null.
export function groupeACorriger(nom: string, actuel: string | null | undefined): GroupeBilan | null {
  if (actuel && actuel !== 'Autres') return null; // groupe choisi volontairement : on n'y touche pas
  const voulu = groupeDeMatiere(nom);
  return voulu === 'Autres' ? null : voulu;
}

// Met à jour le groupe des matières d'une école dont le groupe est resté « Autres » alors qu'elles sont de Lettres ou de Sciences.
export async function corrigerGroupes(admin: any, etablissementId: string, seulement?: string[]): Promise<number> {
  let q = admin.from('matieres').select('id, nom, groupe_bilan').eq('etablissement_id', etablissementId);
  if (seulement && seulement.length > 0) q = q.in('id', seulement);
  const { data } = await q;
  let nb = 0;
  for (const m of (data ?? []) as { id: string; nom: string; groupe_bilan: string | null }[]) {
    const g = groupeACorriger(m.nom, m.groupe_bilan);
    if (!g) continue;
    const { error } = await admin.from('matieres').update({ groupe_bilan: g }).eq('id', m.id);
    if (!error) nb++;
  }
  return nb;
}
