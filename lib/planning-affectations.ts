// Garde les classes en accord avec les emplois du temps : pour chaque cours enregistré avec un
// enseignant, la matière est rattachée à la classe (classes_matieres) et l'enseignant est affecté
// à cette matière dans cette classe (affectations_enseignant).

import { disciplineDeMatiere } from '@/lib/volumes-officiels';

export type BilanSynchro = { matieresAjoutees: number; affectationsAjoutees: number; affectationsRemplacees: number; ignorees?: string[] };

export async function synchroniserAffectations(admin: any, etablissementId: string, classeIds?: string[]): Promise<BilanSynchro> {
  const bilan: BilanSynchro = { matieresAjoutees: 0, affectationsAjoutees: 0, affectationsRemplacees: 0 };

  // cours enregistrés avec un enseignant
  const cours: any[] = [];
  for (let debut = 0; debut < 50000; debut += 1000) {
    let q = admin.from('emploi_du_temps').select('classe_id, matiere_id, enseignant_id, heure_debut, heure_fin')
      .eq('etablissement_id', etablissementId).not('enseignant_id', 'is', null).not('matiere_id', 'is', null);
    if (classeIds && classeIds.length > 0) q = q.in('classe_id', classeIds);
    const { data } = await q.range(debut, debut + 999);
    cours.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  if (cours.length === 0) return bilan;

  // (classe, matière) -> enseignants du cours, avec le nombre de créneaux
  const parCouple = new Map<string, { classe: string; matiere: string; profs: Map<string, number> }>();
  for (const c of cours) {
    const k = `${c.classe_id}|${c.matiere_id}`;
    const e = parCouple.get(k) ?? { classe: c.classe_id as string, matiere: c.matiere_id as string, profs: new Map<string, number>() };
    e.profs.set(c.enseignant_id, (e.profs.get(c.enseignant_id) ?? 0) + 1);
    parCouple.set(k, e);
  }
  const classes = Array.from(new Set(Array.from(parCouple.values()).map((e) => e.classe)));

  const lire = async (table: string, champs: string): Promise<any[]> => {
    const out: any[] = [];
    for (let i = 0; i < classes.length; i += 40) {
      const { data } = await admin.from(table).select(champs).in('classe_id', classes.slice(i, i + 40));
      out.push(...(data ?? []));
    }
    return out;
  };
  const liees = await lire('classes_matieres', 'classe_id, matiere_id');
  const affs = await lire('affectations_enseignant', 'id, classe_id, matiere_id, enseignant_id');
  const dejaLiee = new Set(liees.map((l) => `${l.classe_id}|${l.matiere_id}`));

  // coefficient habituel de chaque matière, repris d'une autre classe qui l'a déjà
  const matieres = Array.from(new Set(Array.from(parCouple.values()).map((e) => e.matiere)));
  const coefParMatiere = new Map<string, number>();
  for (let i = 0; i < matieres.length; i += 40) {
    const { data } = await admin.from('classes_matieres').select('matiere_id, coefficient').in('matiere_id', matieres.slice(i, i + 40));
    (data ?? []).forEach((r: any) => { if (!coefParMatiere.has(r.matiere_id) && r.coefficient != null) coefParMatiere.set(r.matiere_id, Number(r.coefficient)); });
  }

  // 1. matières manquantes dans les classes
  const aLier = Array.from(parCouple.values()).filter((e) => !dejaLiee.has(`${e.classe}|${e.matiere}`))
    .map((e) => ({ classe_id: e.classe, matiere_id: e.matiere, coefficient: coefParMatiere.get(e.matiere) ?? 1 }));
  for (let i = 0; i < aLier.length; i += 200) {
    const { error } = await admin.from('classes_matieres').insert(aLier.slice(i, i + 200));
    if (error) throw new Error(`Rattachement des matières aux classes impossible : ${error.message}`);
  }
  bilan.matieresAjoutees = aLier.length;

  // 2. enseignants : l'emploi du temps fait foi pour ce couple classe + matière
  for (const e of Array.from(parCouple.values())) {
    const voulus = new Set(Array.from(e.profs.keys()));
    const actuelles = affs.filter((a) => a.classe_id === e.classe && a.matiere_id === e.matiere);
    const aSupprimer = actuelles.filter((a) => !voulus.has(a.enseignant_id));
    const presents = new Set(actuelles.map((a) => a.enseignant_id));
    const aAjouter = Array.from(voulus).filter((p) => !presents.has(p));
    if (aSupprimer.length > 0) {
      const { error } = await admin.from('affectations_enseignant').delete().in('id', aSupprimer.map((a) => a.id));
      if (error) throw new Error(`Mise à jour des affectations impossible : ${error.message}`);
      bilan.affectationsRemplacees += aSupprimer.length;
    }
    // jamais deux langues vivantes pour un même enseignant
    const autorises: string[] = [];
    for (const p of aAjouter) {
      const msg = await conflitLangue(admin, p, e.matiere);
      if (msg) { (bilan.ignorees = bilan.ignorees ?? []).push(msg); } else autorises.push(p);
    }
    if (autorises.length > 0) {
      const { error } = await admin.from('affectations_enseignant')
        .insert(autorises.map((p) => ({ enseignant_id: p, matiere_id: e.matiere, classe_id: e.classe })));
      if (error) throw new Error(`Affectation des enseignants impossible : ${error.message}`);
      bilan.affectationsAjoutees += autorises.length;
    }
  }
  return bilan;
}


// ---------- Une seule langue vivante par enseignant ----------

const LANGUES: Record<string, string> = { lv2_allemand: 'allemand', lv2_espagnol: 'espagnol' };
export const langueDeMatiere = (nom: string | null | undefined): string | null => {
  const d = disciplineDeMatiere(nom ?? '');
  return d && d.startsWith('lv2_') ? d : null;
};

async function nomsMatieres(admin: any, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 40) {
    const { data } = await admin.from('matieres').select('id, nom').in('id', ids.slice(i, i + 40));
    (data ?? []).forEach((m: any) => out.set(m.id, m.nom));
  }
  return out;
}

// Langues déjà enseignées par un enseignant (affectations et emplois du temps) : langue -> noms des classes
async function languesDe(admin: any, enseignantId: string): Promise<Map<string, Set<string>>> {
  const couples: { classe: string; matiere: string }[] = [];
  const { data: a } = await admin.from('affectations_enseignant').select('classe_id, matiere_id').eq('enseignant_id', enseignantId);
  (a ?? []).forEach((x: any) => couples.push({ classe: x.classe_id, matiere: x.matiere_id }));
  const { data: c } = await admin.from('emploi_du_temps').select('classe_id, matiere_id').eq('enseignant_id', enseignantId);
  (c ?? []).forEach((x: any) => couples.push({ classe: x.classe_id, matiere: x.matiere_id }));
  const noms = await nomsMatieres(admin, Array.from(new Set(couples.map((x) => x.matiere))));
  const idsClasses = Array.from(new Set(couples.map((x) => x.classe)));
  const nomClasse = new Map<string, string>();
  for (let i = 0; i < idsClasses.length; i += 40) {
    const { data } = await admin.from('classes').select('id, nom').in('id', idsClasses.slice(i, i + 40));
    (data ?? []).forEach((k: any) => nomClasse.set(k.id, k.nom));
  }
  const out = new Map<string, Set<string>>();
  for (const x of couples) {
    const l = langueDeMatiere(noms.get(x.matiere));
    if (!l) continue;
    const set = out.get(l) ?? new Set<string>();
    set.add(nomClasse.get(x.classe) ?? '');
    out.set(l, set);
  }
  return out;
}

// Message d'erreur si l'enseignant enseigne déjà une AUTRE langue vivante que celle de cette matière, sinon null.
export async function conflitLangue(admin: any, enseignantId: string, matiereId: string): Promise<string | null> {
  const noms = await nomsMatieres(admin, [matiereId]);
  const langue = langueDeMatiere(noms.get(matiereId));
  if (!langue) return null;
  const deja = await languesDe(admin, enseignantId);
  const autres = Array.from(deja.keys()).filter((l) => l !== langue);
  if (autres.length === 0) return null;
  const { data: p } = await admin.from('profiles').select('nom, prenom').eq('id', enseignantId).maybeSingle();
  const qui = `${p?.prenom ?? ''} ${p?.nom ?? ''}`.trim() || 'Cet enseignant';
  const l = autres[0];
  return `${qui} enseigne déjà ${LANGUES[l] ?? l} (${Array.from(deja.get(l)!).filter(Boolean).join(', ') || 'autre classe'}) : il ne peut pas aussi enseigner ${LANGUES[langue] ?? langue}.`;
}

export type ConflitLangue = { enseignantId: string; nom: string; langues: { langue: string; libelle: string; classes: string[] }[] };

// Enseignants de l'école affectés à plusieurs langues vivantes
export async function auditerLangues(admin: any, etablissementId: string): Promise<ConflitLangue[]> {
  const { data: classes } = await admin.from('classes').select('id, nom').eq('etablissement_id', etablissementId);
  const nomClasse = new Map<string, string>((classes ?? []).map((c: any) => [c.id, c.nom]));
  const ids = Array.from(nomClasse.keys());
  const couples: { ens: string; classe: string; matiere: string }[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    const lot = ids.slice(i, i + 40);
    const { data: a } = await admin.from('affectations_enseignant').select('enseignant_id, classe_id, matiere_id').in('classe_id', lot);
    (a ?? []).forEach((x: any) => couples.push({ ens: x.enseignant_id, classe: x.classe_id, matiere: x.matiere_id }));
    const { data: c } = await admin.from('emploi_du_temps').select('enseignant_id, classe_id, matiere_id').in('classe_id', lot).not('enseignant_id', 'is', null);
    (c ?? []).forEach((x: any) => couples.push({ ens: x.enseignant_id, classe: x.classe_id, matiere: x.matiere_id }));
  }
  const noms = await nomsMatieres(admin, Array.from(new Set(couples.map((x) => x.matiere))));
  const par = new Map<string, Map<string, Set<string>>>();
  for (const x of couples) {
    const l = langueDeMatiere(noms.get(x.matiere));
    if (!l) continue;
    const m = par.get(x.ens) ?? new Map<string, Set<string>>();
    const set = m.get(l) ?? new Set<string>();
    set.add(nomClasse.get(x.classe) ?? '');
    m.set(l, set);
    par.set(x.ens, m);
  }
  const fautifs = Array.from(par.entries()).filter(([, m]) => m.size > 1);
  const profs = new Map<string, string>();
  const idsP = fautifs.map(([id]) => id);
  for (let i = 0; i < idsP.length; i += 40) {
    const { data } = await admin.from('profiles').select('id, nom, prenom').in('id', idsP.slice(i, i + 40));
    (data ?? []).forEach((p: any) => profs.set(p.id, `${p.prenom ?? ''} ${p.nom ?? ''}`.trim()));
  }
  return fautifs.map(([id, m]) => ({
    enseignantId: id,
    nom: profs.get(id) ?? 'Enseignant',
    langues: Array.from(m.entries()).map(([langue, cl]) => ({ langue, libelle: LANGUES[langue] ?? langue, classes: Array.from(cl).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })) })),
  }));
}

// L'enseignant garde une seule langue : ses cours et affectations dans l'autre langue lui sont retirés.
export async function garderLangue(admin: any, etablissementId: string, enseignantId: string, garder: string): Promise<{ affectationsRetirees: number; coursLiberes: number }> {
  const { data: classes } = await admin.from('classes').select('id').eq('etablissement_id', etablissementId);
  const ids = (classes ?? []).map((c: any) => c.id as string);
  let affectationsRetirees = 0;
  let coursLiberes = 0;
  for (let i = 0; i < ids.length; i += 40) {
    const lot = ids.slice(i, i + 40);
    const { data: a } = await admin.from('affectations_enseignant').select('id, matiere_id').eq('enseignant_id', enseignantId).in('classe_id', lot);
    const { data: c } = await admin.from('emploi_du_temps').select('id, matiere_id').eq('enseignant_id', enseignantId).in('classe_id', lot);
    const noms = await nomsMatieres(admin, Array.from(new Set([...(a ?? []), ...(c ?? [])].map((x: any) => x.matiere_id as string))));
    const mauvaise = (m: string) => { const l = langueDeMatiere(noms.get(m)); return l !== null && l !== garder; };
    const aSupp = (a ?? []).filter((x: any) => mauvaise(x.matiere_id)).map((x: any) => x.id as string);
    const cLib = (c ?? []).filter((x: any) => mauvaise(x.matiere_id)).map((x: any) => x.id as string);
    if (aSupp.length) { await admin.from('affectations_enseignant').delete().in('id', aSupp); affectationsRetirees += aSupp.length; }
    if (cLib.length) { await admin.from('emploi_du_temps').update({ enseignant_id: null }).in('id', cLib); coursLiberes += cLib.length; }
  }
  return { affectationsRetirees, coursLiberes };
}
