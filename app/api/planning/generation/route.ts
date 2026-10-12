import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { VOLUMES_OFFICIELS, cleDeMatiere, niveauVersCode, cycleDuNiveau } from "@/lib/volumes-officiels";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["administration", "directeur_etudes", "super_admin"];
const JOURS_DEFAUT = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"].map((jour) => ({ jour, fin: null as string | null }));

async function contexte() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  const { data: profil } = await supabase.from("profiles").select("role, etablissement_id").eq("id", user.id).single();
  if (!profil || !ROLES.includes(profil.role) || !profil.etablissement_id)
    return { erreur: NextResponse.json({ error: "Accès réservé à la direction de l'école." }, { status: 403 }) };
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { admin, etablissementId: profil.etablissement_id as string };
}

const LIBELLE: Record<string, string> = {
  anglais: "Anglais", dessin: "Dessin / Éducation musicale", edhc: "EDHC", eps: "EPS", francais: "Français",
  hg: "Histoire-Géographie", lv2: "LV2 (Allemand / Espagnol)", maths: "Mathématiques", philo: "Philosophie",
  pc: "Physique-Chimie", svt: "SVT",
};

// Lecture par paquets (la base limite le nombre de lignes renvoyées par requête).
async function lireParPaquets(admin: any, table: string, colonne: string, ids: string[], champs: string): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    const { data, error } = await admin.from(table).select(champs).in(colonne, ids.slice(i, i + 40));
    if (error) return out;
    out.push(...(data ?? []));
  }
  return out;
}

// Tout ce dont la génération a besoin, calculé côté serveur (les règles d'accès ne bloquent pas la lecture).
// Les cours à placer viennent des CLASSES et du tableau officiel des horaires, pas des matières déjà rattachées.
export async function GET() {
  const ctx = await contexte();
  if ("erreur" in ctx) return ctx.erreur;
  const { admin, etablissementId } = ctx;

  const { data: etab } = await admin.from("etablissements").select("annee_scolaire_active").eq("id", etablissementId).single();
  let reqClasses = admin.from("classes").select("id, nom, niveau, annee_scolaire").eq("etablissement_id", etablissementId);
  if (etab?.annee_scolaire_active) reqClasses = reqClasses.eq("annee_scolaire", etab.annee_scolaire_active);
  const { data: classesBrutes } = await reqClasses.order("nom");
  const classesToutes = (classesBrutes ?? []) as any[];
  const idsClasses = classesToutes.map((c) => c.id as string);

  // Grille horaire de l'école (par cycle) et jours de cours
  const { data: periodesBrutes } = await admin
    .from("creneaux_horaires_types")
    .select("id, cycle, ordre, heure_debut, heure_fin, est_pause")
    .eq("etablissement_id", etablissementId);
  const periodes: Record<string, any[]> = {};
  (periodesBrutes ?? []).forEach((p: any) => {
    (periodes[p.cycle] = periodes[p.cycle] || []).push({
      id: p.id,
      ordre: p.ordre,
      debut: String(p.heure_debut).slice(0, 5),
      fin: String(p.heure_fin).slice(0, 5),
      pause: p.est_pause === true,
    });
  });
  const { data: param } = await admin.from("planning_parametres").select("jours").eq("etablissement_id", etablissementId).maybeSingle();
  const jours = Array.isArray((param as any)?.jours) && (param as any).jours.length > 0 ? (param as any).jours : JOURS_DEFAUT;

  // Matières de l'école et matières rattachées aux classes (avec un éventuel volume saisi à la main)
  let lignes = await lireParPaquets(admin, "classes_matieres", "classe_id", idsClasses, "classe_id, matiere_id, volume_hebdo");
  if (lignes.length === 0) lignes = await lireParPaquets(admin, "classes_matieres", "classe_id", idsClasses, "classe_id, matiere_id");
  const { data: matsEtab } = await admin.from("matieres").select("id, nom").eq("etablissement_id", etablissementId);
  const nomMat = new Map<string, string>((matsEtab ?? []).map((m: any) => [m.id, m.nom as string]));
  const manquants = Array.from(new Set(lignes.map((l) => l.matiere_id).filter((id) => id && !nomMat.has(id))));
  (await lireParPaquets(admin, "matieres", "id", manquants as string[], "id, nom")).forEach((m: any) => nomMat.set(m.id, m.nom));
  const matieresEcole = Array.from(nomMat, ([id, nom]) => ({ id, nom, cle: cleDeMatiere(nom) })).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  // Professeurs : disciplines déclarées + disciplines déduites des affectations existantes
  const affs = await lireParPaquets(admin, "affectations_enseignant", "classe_id", idsClasses, "classe_id, matiere_id, enseignant_id");
  const cycleClasse = new Map<string, string>();
  classesToutes.forEach((c) => {
    const code = niveauVersCode(c.niveau);
    if (code) cycleClasse.set(c.id, cycleDuNiveau(code));
  });

  const { data: ensBruts } = await admin
    .from("profiles")
    .select("id, nom, prenom")
    .eq("etablissement_id", etablissementId)
    .eq("role", "enseignant");
  let planRes = await admin
    .from("enseignants_planning")
    .select("enseignant_id, vacataire, max_heures_semaine, disciplines, cycle_prof")
    .eq("etablissement_id", etablissementId);
  if (planRes.error)
    planRes = await admin.from("enseignants_planning").select("enseignant_id, vacataire, max_heures_semaine").eq("etablissement_id", etablissementId);
  const { data: dispoBrutes } = await admin
    .from("enseignants_disponibilites")
    .select("enseignant_id, jour, heure_debut, heure_fin")
    .eq("etablissement_id", etablissementId);
  const planParId = new Map((planRes.data ?? []).map((p: any) => [p.enseignant_id, p]));
  const profs = (ensBruts ?? []).map((e: any) => {
    const p: any = planParId.get(e.id);
    const siennes = affs.filter((a) => a.enseignant_id === e.id);
    const disciplines = new Set<string>(Array.isArray(p?.disciplines) ? p.disciplines : []);
    siennes.forEach((a) => {
      const cle = cleDeMatiere(nomMat.get(a.matiere_id) ?? "");
      if (cle) disciplines.add(cle);
    });
    const nbCycle: Record<string, number> = {};
    siennes.forEach((a) => {
      const c = cycleClasse.get(a.classe_id);
      if (c) nbCycle[c] = (nbCycle[c] || 0) + 1;
    });
    const cycleDeduit = Object.keys(nbCycle).sort((x, y) => nbCycle[y] - nbCycle[x])[0] ?? null;
    const cycleChoisi = p?.cycle_prof === "college" || p?.cycle_prof === "lycee" ? p.cycle_prof : null;
    return {
      id: e.id as string,
      nom: `${e.nom ?? ""} ${e.prenom ?? ""}`.trim(),
      vacataire: p?.vacataire === true,
      maxHeures: p?.max_heures_semaine === null || p?.max_heures_semaine === undefined ? null : Number(p.max_heures_semaine),
      dispos: (dispoBrutes ?? [])
        .filter((d: any) => d.enseignant_id === e.id)
        .map((d: any) => ({ jour: d.jour, heure_debut: String(d.heure_debut).slice(0, 5), heure_fin: String(d.heure_fin).slice(0, 5) })),
      disciplines: Array.from(disciplines),
      cycle: cycleChoisi ?? cycleDeduit,
      cycleStrict: cycleChoisi !== null,
      affectes: siennes.map((a) => a.classe_id + "|" + a.matiere_id),
    };
  });

  // Cours à placer : pour chaque classe, toutes les matières du tableau officiel de son niveau.
  const classes: any[] = [];
  const unites: any[] = [];
  const avertissements: string[] = [];
  for (const c of classesToutes) {
    const code = niveauVersCode(c.niveau);
    if (!code) {
      avertissements.push(`Classe « ${c.nom} » ignorée : niveau « ${c.niveau ?? "vide"} » non reconnu.`);
      continue;
    }
    const cycle = cycleDuNiveau(code);
    if (!periodes[cycle] || periodes[cycle].filter((p) => !p.pause).length === 0) {
      avertissements.push(`Classe « ${c.nom} » ignorée : la grille horaire du ${cycle === "college" ? "collège" : "lycée"} est vide.`);
      continue;
    }
    const rattachees = lignes.filter((l) => l.classe_id === c.id);
    const introuvables: string[] = [];
    let nb = 0;
    let total = 0;
    const dejaPrises = new Set<string>();
    for (const [cle, officiel] of Object.entries(VOLUMES_OFFICIELS[code])) {
      // la matière de la classe si elle existe, sinon la matière de l'école portant ce nom
      const idsDeCle = [
        ...rattachees.filter((l) => cleDeMatiere(nomMat.get(l.matiere_id) ?? "") === cle).map((l) => l.matiere_id as string),
        ...matieresEcole.filter((m) => m.cle === cle).map((m) => m.id),
      ];
      const matiereId = idsDeCle[0];
      if (!matiereId) {
        introuvables.push(LIBELLE[cle] ?? cle);
        continue;
      }
      const ligne = rattachees.find((l) => l.matiere_id === matiereId);
      const manuel = ligne && ligne.volume_hebdo !== null && ligne.volume_hebdo !== undefined ? Number(ligne.volume_hebdo) : null;
      const heures = manuel !== null ? manuel : (officiel as number);
      dejaPrises.add(matiereId);
      if (!(heures > 0)) continue;
      unites.push({
        classeId: c.id, classeNom: c.nom, matiereId, matiereNom: nomMat.get(matiereId) ?? LIBELLE[cle], heures,
        profId: null, cycle, cle,
      });
      nb++;
      total += heures;
    }
    // matières propres à l'école (hors tableau officiel) avec un volume saisi à la main
    for (const l of rattachees) {
      if (dejaPrises.has(l.matiere_id)) continue;
      const v = l.volume_hebdo === null || l.volume_hebdo === undefined ? 0 : Number(l.volume_hebdo);
      if (!(v > 0)) continue;
      unites.push({ classeId: c.id, classeNom: c.nom, matiereId: l.matiere_id, matiereNom: nomMat.get(l.matiere_id) ?? "Matière", heures: v, profId: null, cycle, cle: cleDeMatiere(nomMat.get(l.matiere_id) ?? "") });
      nb++;
      total += v;
    }
    classes.push({ id: c.id, nom: c.nom, niveau: c.niveau, cycle, nbMatieres: nb, heures: total, introuvables });
  }

  // Cours déjà enregistrés (servent à éviter les conflits de professeurs avec les classes non régénérées)
  const existants: any[] = [];
  for (let debut = 0; debut < 20000; debut += 1000) {
    const { data } = await admin
      .from("emploi_du_temps")
      .select("classe_id, enseignant_id, jour, heure_debut, heure_fin")
      .eq("etablissement_id", etablissementId)
      .range(debut, debut + 999);
    existants.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  return NextResponse.json({
    jours,
    periodes,
    classes,
    unites,
    profs,
    existants: existants.map((e: any) => ({
      classeId: e.classe_id,
      profId: e.enseignant_id,
      jour: e.jour,
      debut: String(e.heure_debut).slice(0, 5),
      fin: String(e.heure_fin).slice(0, 5),
    })),
    avertissements,
  });
}

// Enregistre le résultat : remplace l'emploi du temps des classes concernées.
export async function POST(request: NextRequest) {
  const ctx = await contexte();
  if ("erreur" in ctx) return ctx.erreur;
  const { admin, etablissementId } = ctx;

  const body = await request.json().catch(() => ({}));
  const classeIds: string[] = Array.isArray(body?.classeIds) ? body.classeIds.filter((x: any) => typeof x === "string") : [];
  const cours: any[] = Array.isArray(body?.cours) ? body.cours : [];
  if (classeIds.length === 0 || cours.length === 0)
    return NextResponse.json({ error: "Rien à enregistrer." }, { status: 400 });

  const { data: valides } = await admin.from("classes").select("id").eq("etablissement_id", etablissementId).in("id", classeIds);
  const idsValides = new Set((valides ?? []).map((c: any) => c.id as string));
  if (idsValides.size !== classeIds.length)
    return NextResponse.json({ error: "Une classe n'appartient pas à votre école." }, { status: 403 });

  const lignes = cours
    .filter((c) => idsValides.has(c?.classeId))
    .map((c) => ({
      etablissement_id: etablissementId,
      classe_id: c.classeId,
      matiere_id: c.matiereId,
      enseignant_id: c.profId || null,
      jour: c.jour,
      periode_id: c.periodeId,
      heure_debut: c.debut,
      heure_fin: c.fin,
    }));

  // Sauvegarde de l'ancien emploi du temps pour pouvoir le remettre en cas d'échec.
  const { data: anciens } = await admin.from("emploi_du_temps").select("*").in("classe_id", classeIds);

  const { error: erreurSuppression } = await admin.from("emploi_du_temps").delete().in("classe_id", classeIds);
  if (erreurSuppression) return NextResponse.json({ error: erreurSuppression.message }, { status: 500 });

  for (let i = 0; i < lignes.length; i += 200) {
    const { error } = await admin.from("emploi_du_temps").insert(lignes.slice(i, i + 200));
    if (error) {
      await admin.from("emploi_du_temps").delete().in("classe_id", classeIds);
      if (anciens && anciens.length > 0) await admin.from("emploi_du_temps").insert(anciens as any[]);
      return NextResponse.json({ error: `Enregistrement impossible (ancien emploi du temps conservé) : ${error.message}` }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, nbCreneaux: lignes.length, nbClasses: classeIds.length });
  }
                                  
