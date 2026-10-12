import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { volumesOfficielsClasse, niveauVersCode, NIVEAU_LABEL } from "@/lib/volumes-officiels";

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

async function chargerClasses(admin: any, etablissementId: string) {
  const { data: etab } = await admin.from("etablissements").select("annee_scolaire_active").eq("id", etablissementId).single();
  let req = admin.from("classes").select("id, nom, niveau, annee_scolaire").eq("etablissement_id", etablissementId);
  if (etab?.annee_scolaire_active) req = req.eq("annee_scolaire", etab.annee_scolaire_active);
  const { data } = await req.order("nom");
  return (data ?? []) as { id: string; nom: string; niveau: string | null; annee_scolaire: string | null }[];
}

async function chargerLignes(admin: any, classeIds: string[]) {
  if (classeIds.length === 0) return { lignes: [] as any[], installe: true };
  let res = await admin.from("classes_matieres").select("id, classe_id, matiere_id, volume_hebdo").in("classe_id", classeIds);
  let installe = true;
  if (res.error) {
    installe = false;
    res = await admin.from("classes_matieres").select("id, classe_id, matiere_id").in("classe_id", classeIds);
  }
  const lignes = (res.data ?? []) as any[];
  const idsMat = Array.from(new Set(lignes.map((l) => l.matiere_id).filter(Boolean)));
  const { data: mats } = idsMat.length ? await admin.from("matieres").select("id, nom").in("id", idsMat) : { data: [] as any[] };
  const nomParId = new Map((mats ?? []).map((m: any) => [m.id, m.nom as string]));
  return { lignes: lignes.map((l) => ({ ...l, nom: nomParId.get(l.matiere_id) ?? "Matière" })), installe };
}

// Pour une classe : les matières, le volume enregistré et le volume officiel proposé.
export async function GET(request: NextRequest) {
  const ctx = await contexte();
  if ("erreur" in ctx) return ctx.erreur;
  const { admin, etablissementId } = ctx;

  const classes = await chargerClasses(admin, etablissementId);
  const classeId = request.nextUrl.searchParams.get("classeId");
  const liste = classes.map((c) => ({ id: c.id, nom: c.nom, niveau: c.niveau, reconnu: niveauVersCode(c.niveau) !== null }));
  if (!classeId) return NextResponse.json({ classes: liste });

  const classe = classes.find((c) => c.id === classeId);
  if (!classe) return NextResponse.json({ error: "Classe introuvable." }, { status: 404 });
  const { lignes, installe } = await chargerLignes(admin, [classeId]);
  const off = volumesOfficielsClasse(classe.niveau, lignes.map((l) => ({ id: l.matiere_id, nom: l.nom })));
  return NextResponse.json({
    classes: liste,
    installe,
    niveauOfficiel: off.code ? NIVEAU_LABEL[off.code] : null,
    lignes: lignes
      .map((l) => ({
        id: l.id,
        nom: l.nom,
        volume: l.volume_hebdo === null || l.volume_hebdo === undefined ? null : Number(l.volume_hebdo),
        officiel: off.volumes.get(l.matiere_id) ?? null,
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
  });
}

// POST { mode: 'officiel' }  : applique le tableau officiel à toutes les classes (sans écraser les volumes déjà saisis,
//                                sauf si ecraser = true)
// POST { mode: 'classe', classeId, volumes: [{id, volume}], copierMemeNiveau }
export async function POST(request: NextRequest) {
  const ctx = await contexte();
  if ("erreur" in ctx) return ctx.erreur;
  const { admin, etablissementId } = ctx;
  const body = await request.json().catch(() => ({}));
  const classes = await chargerClasses(admin, etablissementId);

  if (body?.mode === "officiel") {
    const ecraser = body?.ecraser === true;
    const { lignes, installe } = await chargerLignes(admin, classes.map((c) => c.id));
    if (!installe)
      return NextResponse.json({ error: "Exécutez d'abord le script SQL « planning_v1 » dans Supabase." }, { status: 500 });
    let appliquees = 0;
    const classesIgnorees: string[] = [];
    const matieresInconnues = new Set<string>();
    for (const c of classes) {
      const deClasse = lignes.filter((l) => l.classe_id === c.id);
      const off = volumesOfficielsClasse(c.niveau, deClasse.map((l) => ({ id: l.matiere_id, nom: l.nom })));
      if (!off.code) {
        classesIgnorees.push(c.nom);
        continue;
      }
      off.inconnues.forEach((n) => matieresInconnues.add(n));
      for (const l of deClasse) {
        const v = off.volumes.get(l.matiere_id);
        if (v === undefined) continue;
        if (!ecraser && l.volume_hebdo !== null && l.volume_hebdo !== undefined) continue;
        const { error } = await admin.from("classes_matieres").update({ volume_hebdo: v }).eq("id", l.id);
        if (!error) appliquees++;
      }
    }
    return NextResponse.json({ ok: true, appliquees, classesIgnorees, matieresInconnues: Array.from(matieresInconnues) });
  }

  if (body?.mode === "classe") {
    const classe = classes.find((c) => c.id === body?.classeId);
    if (!classe) return NextResponse.json({ error: "Classe introuvable." }, { status: 404 });
    const volumes: { id: string; volume: number | null }[] = Array.isArray(body?.volumes) ? body.volumes : [];
    for (const v of volumes) {
      if (v.volume !== null && (typeof v.volume !== "number" || isNaN(v.volume) || v.volume < 0 || v.volume > 40))
        return NextResponse.json({ error: "Un volume doit être un nombre entre 0 et 40." }, { status: 400 });
    }
    const { lignes } = await chargerLignes(admin, [classe.id]);
    const idsAutorises = new Set(lignes.map((l) => l.id));
    let enregistres = 0;
    for (const v of volumes) {
      if (!idsAutorises.has(v.id)) continue;
      const { error } = await admin.from("classes_matieres").update({ volume_hebdo: v.volume }).eq("id", v.id);
      if (error)
        return NextResponse.json({ error: `${error.message}. Exécutez d'abord le script SQL « planning_v1 ».` }, { status: 500 });
      enregistres++;
    }
    let copiees = 0;
    if (body?.copierMemeNiveau && classe.niveau) {
      const memeNiveau = classes.filter((c) => c.id !== classe.id && c.niveau === classe.niveau);
      const { lignes: autres } = await chargerLignes(admin, memeNiveau.map((c) => c.id));
      const volParMatiere = new Map(lignes.map((l) => [l.matiere_id, volumes.find((v) => v.id === l.id)?.volume]));
      for (const a of autres) {
        if (!volParMatiere.has(a.matiere_id)) continue;
        await admin.from("classes_matieres").update({ volume_hebdo: volParMatiere.get(a.matiere_id) ?? null }).eq("id", a.id);
      }
      copiees = memeNiveau.length;
    }
    return NextResponse.json({ ok: true, enregistres, copiees });
  }

  return NextResponse.json({ error: "Demande inconnue." }, { status: 400 });
      }
  
