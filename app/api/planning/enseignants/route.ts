import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { niveauDeClasse, cycleDuNiveau } from "@/lib/volumes-officiels";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["administration", "directeur_etudes", "super_admin"];

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

async function lireParPaquets(admin: any, table: string, colonne: string, ids: string[], champs: string): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    const { data, error } = await admin.from(table).select(champs).in(colonne, ids.slice(i, i + 40));
    if (error) return out;
    out.push(...(data ?? []));
  }
  return out;
}

const hhmm = (h: any) => String(h).slice(0, 5);
const minutes = (h: string) => {
  const [a, b] = h.split(":").map(Number);
  return (a || 0) * 60 + (b || 0);
};

// Tout ce qu'il faut pour afficher et imprimer l'emploi du temps de chaque enseignant :
// les cours enregistrés pour les classes de l'année active, regroupés par enseignant.
export async function GET() {
  const ctx = await contexte();
  if ("erreur" in ctx) return ctx.erreur;
  const { admin, etablissementId } = ctx;

  const { data: etab } = await admin
    .from("etablissements")
    .select("nom, adresse, telephone, code_etablissement, dren, type_etablissement, annee_scolaire_active")
    .eq("id", etablissementId)
    .single();
  const annee: string = etab?.annee_scolaire_active ?? "";

  // Classes de l'année active
  let reqClasses = admin.from("classes").select("id, nom, niveau, cycle").eq("etablissement_id", etablissementId);
  if (annee) reqClasses = reqClasses.eq("annee_scolaire", annee);
  const { data: classesBrutes } = await reqClasses;
  const classes = (classesBrutes ?? []) as { id: string; nom: string; niveau: string | null; cycle: string | null }[];
  const classeParId = new Map(classes.map((c) => [c.id, c]));
  const cycleDeClasse = (id: string): string => {
    const c = classeParId.get(id);
    if (!c) return "college";
    if (c.cycle === "college" || c.cycle === "lycee") return c.cycle;
    const code = niveauDeClasse({ niveau: c.niveau, nom: c.nom });
    return code ? cycleDuNiveau(code) : "college";
  };

  // Cours enregistrés
  const cours: any[] = [];
  for (let debut = 0; debut < 20000; debut += 1000) {
    const { data } = await admin
      .from("emploi_du_temps")
      .select("classe_id, matiere_id, enseignant_id, jour, heure_debut, heure_fin, salle")
      .eq("etablissement_id", etablissementId)
      .not("enseignant_id", "is", null)
      .range(debut, debut + 999);
    cours.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const coursActifs = cours.filter((c) => classeParId.has(c.classe_id));

  // Noms des matières
  const { data: matieres } = await admin.from("matieres").select("id, nom").eq("etablissement_id", etablissementId);
  const nomMatiere = new Map<string, string>((matieres ?? []).map((m: any) => [m.id, m.nom as string]));
  const manquantes = Array.from(new Set(coursActifs.map((c) => c.matiere_id).filter((id: string) => id && !nomMatiere.has(id))));
  (await lireParPaquets(admin, "matieres", "id", manquantes as string[], "id, nom")).forEach((m: any) => nomMatiere.set(m.id, m.nom));

  // Grille horaire par cycle
  const { data: periodesBrutes } = await admin
    .from("creneaux_horaires_types")
    .select("cycle, ordre, heure_debut, heure_fin, est_pause, libelle")
    .eq("etablissement_id", etablissementId)
    .order("ordre");
  const periodes: Record<string, { ordre: number; debut: string; fin: string; pause: boolean; libelle: string | null }[]> = {};
  (periodesBrutes ?? []).forEach((p: any) => {
    (periodes[p.cycle] = periodes[p.cycle] || []).push({
      ordre: p.ordre,
      debut: hhmm(p.heure_debut),
      fin: hhmm(p.heure_fin),
      pause: p.est_pause === true,
      libelle: p.libelle ?? null,
    });
  });

  // Enseignants de l'école
  const { data: profs } = await admin
    .from("profiles")
    .select("id, nom, prenom, telephone")
    .eq("etablissement_id", etablissementId)
    .eq("role", "enseignant");
  const idsProfs = (profs ?? []).map((p: any) => p.id as string);
  const fiches = await lireParPaquets(admin, "enseignants", "id", idsProfs, "id, matricule, sexe, specialite, statut");
  const ficheParId = new Map<string, any>(fiches.map((f: any) => [f.id, f]));

  // Compléments de service (professeur principal, etc.)
  const compRes = await admin
    .from("complement_service")
    .select("enseignant_id, type, heures, classe_id")
    .eq("etablissement_id", etablissementId)
    .eq("annee_scolaire", annee);
  const complements = (compRes.error ? [] : (compRes.data ?? [])) as any[];

  // Effectif des classes qui apparaissent dans un emploi du temps
  const idsClassesUtiles = Array.from(new Set(coursActifs.map((c) => c.classe_id as string)));
  const effectif = new Map<string, number>();
  for (let i = 0; i < idsClassesUtiles.length; i += 10) {
    await Promise.all(
      idsClassesUtiles.slice(i, i + 10).map(async (id) => {
        const { count } = await admin.from("eleves").select("id", { count: "exact", head: true }).eq("classe_id", id);
        effectif.set(id, count ?? 0);
      })
    );
  }

  const enseignants = (profs ?? [])
    .map((p: any) => {
      const f = ficheParId.get(p.id);
      const siens = coursActifs.filter((c) => c.enseignant_id === p.id);
      const creneaux = siens.map((c) => ({
        jour: c.jour as string,
        debut: hhmm(c.heure_debut),
        fin: hhmm(c.heure_fin),
        salle: (c.salle ?? null) as string | null,
        classeId: c.classe_id as string,
        classeNom: classeParId.get(c.classe_id)?.nom ?? "",
        matiere: nomMatiere.get(c.matiere_id) ?? "",
        cycle: cycleDeClasse(c.classe_id),
      }));
      // récapitulatif : une ligne par (classe, matière), avec les heures de la semaine
      const recapMap = new Map<string, { classeId: string; classeNom: string; matiere: string; minutes: number }>();
      for (const c of creneaux) {
        const k = c.classeId + "|" + c.matiere;
        const r = recapMap.get(k) ?? { classeId: c.classeId, classeNom: c.classeNom, matiere: c.matiere, minutes: 0 };
        r.minutes += minutes(c.fin) - minutes(c.debut);
        recapMap.set(k, r);
      }
      const recap = Array.from(recapMap.values())
        .sort((a, b) => a.classeNom.localeCompare(b.classeNom, "fr", { numeric: true }))
        .map((r) => ({
          classeNom: r.classeNom,
          effectif: effectif.get(r.classeId) ?? 0,
          matiere: r.matiere,
          heures: Math.round((r.minutes / 60) * 100) / 100,
        }));
      return {
        id: p.id as string,
        nom: (p.nom ?? "") as string,
        prenom: (p.prenom ?? "") as string,
        telephone: (p.telephone ?? null) as string | null,
        matricule: (f?.matricule ?? null) as string | null,
        sexe: (f?.sexe ?? null) as string | null,
        statut: (f?.statut ?? null) as string | null,
        specialite: (f?.specialite ?? null) as string | null,
        heures: Math.round((recap.reduce((s, r) => s + r.heures, 0)) * 100) / 100,
        creneaux,
        recap,
        complements: complements
          .filter((c) => c.enseignant_id === p.id)
          .map((c) => ({ type: c.type as string, heures: Number(c.heures) || 0, classeNom: c.classe_id ? classeParId.get(c.classe_id)?.nom ?? "" : "" })),
      };
    })
    .sort((a: any, b: any) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr"));

  return NextResponse.json({ etablissement: etab ?? null, annee, periodes, enseignants });
}
