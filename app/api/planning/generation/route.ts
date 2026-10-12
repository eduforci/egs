import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { volumesOfficielsClasse, niveauVersCode, cycleDuNiveau } from "@/lib/volumes-officiels";

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

// Tout ce dont la génération a besoin, calculé côté serveur (les règles d'accès ne bloquent pas la lecture).
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

  // Matières, volumes et professeurs affectés
  let lignesRes = idsClasses.length
    ? await admin.from("classes_matieres").select("classe_id, matiere_id, volume_hebdo").in("classe_id", idsClasses)
    : { data: [] as any[], error: null as any };
  if (lignesRes.error) lignesRes = await admin.from("classes_matieres").select("classe_id, matiere_id").in("classe_id", idsClasses);
  const lignes = (lignesRes.data ?? []) as any[];
  const idsMat = Array.from(new Set(lignes.map((l) => l.matiere_id).filter(Boolean)));
  const { data: matsBrutes } = idsMat.length ? await admin.from("matieres").select("id, nom").in("id", idsMat) : { data: [] as any[] };
  const nomMat = new Map((matsBrutes ?? []).map((m: any) => [m.id, m.nom as string]));

  const { data: affs } = idsClasses.length
    ? await admin.from("affectations_enseignant").select("classe_id, matiere_id, enseignant_id").in("classe_id", idsClasses)
    : { data: [] as any[] };
  const profParPaire = new Map((affs ?? []).map((a: any) => [a.classe_id + "|" + a.matiere_id, a.enseignant_id as string]));

  const { data: ensBruts } = await admin
    .from("profiles")
    .select("id, nom, prenom")
    .eq("etablissement_id", etablissementId)
    .eq("role", "enseignant");
  const { data: planBruts } = await admin
    .from("enseignants_planning")
    .select("enseignant_id, vacataire, max_heures_semaine")
    .eq("etablissement_id", etablissementId);
  const { data: dispoBrutes } = await admin
    .from("enseignants_disponibilites")
    .select("enseignant_id, jour, heure_debut, heure_fin")
    .eq("etablissement_id", etablissementId);
  const planParId = new Map((planBruts ?? []).map((p: any) => [p.enseignant_id, p]));
  const profs = (ensBruts ?? []).map((e: any) => {
    const p: any = planParId.get(e.id);
    return {
      id: e.id as string,
      nom: `${e.nom ?? ""} ${e.prenom ?? ""}`.trim(),
      vacataire: p?.vacataire === true,
      maxHeures: p?.max_heures_semaine === null || p?.max_heures_semaine === undefined ? null : Number(p.max_heures_semaine),
      dispos: (dispoBrutes ?? [])
        .filter((d: any) => d.enseignant_id === e.id)
        .map((d: any) => ({ jour: d.jour, heure_debut: String(d.heure_debut).slice(0, 5), heure_fin: String(d.heure_fin).slice(0, 5) })),
    };
  });

  // Construction des éléments à placer
  const classes: any[] = [];
  const items: any[] = [];
  const avertissements: string[] = [];
  const matieresInconnues = new Set<string>();
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
    const deClasse = lignes.filter((l) => l.classe_id === c.id);
    const off = volumesOfficielsClasse(c.niveau, deClasse.map((l) => ({ id: l.matiere_id, nom: nomMat.get(l.matiere_id) ?? "" })));
    off.inconnues.forEach((n) => matieresInconnues.add(n));
    let nb = 0;
    for (const l of deClasse) {
      const manuel = l.volume_hebdo === null || l.volume_hebdo === undefined ? null : Number(l.volume_hebdo);
      const heures = manuel !== null ? manuel : off.volumes.get(l.matiere_id) ?? 0;
      if (!(heures > 0)) continue;
      items.push({
        classeId: c.id,
        matiereId: l.matiere_id,
        matiereNom: nomMat.get(l.matiere_id) ?? "Matière",
        heures,
        profId: profParPaire.get(c.id + "|" + l.matiere_id) ?? null,
        cycle,
      });
      nb++;
    }
    classes.push({ id: c.id, nom: c.nom, niveau: c.niveau, cycle, nbMatieres: nb });
  }

  // Cours déjà enregistrés (servent à éviter les conflits de professeurs avec les classes non régénérées)
  const { data: existants } = await admin
    .from("emploi_du_temps")
    .select("classe_id, enseignant_id, jour, heure_debut, heure_fin")
    .eq("etablissement_id", etablissementId);

  return NextResponse.json({
    jours,
    periodes,
    classes,
    items,
    profs,
    existants: (existants ?? []).map((e: any) => ({
      classeId: e.classe_id,
      profId: e.enseignant_id,
      jour: e.jour,
      debut: String(e.heure_debut).slice(0, 5),
      fin: String(e.heure_fin).slice(0, 5),
    })),
    avertissements,
    matieresInconnues: Array.from(matieresInconnues),
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
       
