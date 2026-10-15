import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  VOLUMES_OFFICIELS,
  NIVEAUX_CODES,
  NIVEAU_LABEL,
  niveauDeClasse,
  cleDeMatiere,
  type NiveauCode,
} from "@/lib/volumes-officiels";
import { CLES_ORDRE, LIBELLE_CLE, indexerConfig, normaliserNom, type LigneConfig } from "@/lib/planning-niveaux";

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

// Classes de l'année active, avec leur niveau officiel (même méthode que les autres pages du planning).
async function chargerClasses(admin: any, etablissementId: string) {
  const { data: etab } = await admin.from("etablissements").select("annee_scolaire_active").eq("id", etablissementId).single();
  let req = admin.from("classes").select("id, nom, niveau, annee_scolaire").eq("etablissement_id", etablissementId);
  if (etab?.annee_scolaire_active) req = req.eq("annee_scolaire", etab.annee_scolaire_active);
  const { data } = await req.order("nom");
  const brutes = (data ?? []) as { id: string; nom: string; niveau: string | null }[];
  // la série est rangée dans une colonne à part : lecture facultative
  const sr = brutes.length ? await admin.from("classes").select("id, serie").in("id", brutes.map((c) => c.id)) : { data: [] as any[] };
  const serieParId = new Map<string, string | null>((sr.data ?? []).map((x: any) => [x.id, x.serie ?? null]));
  return brutes.map((c) => ({
    id: c.id,
    nom: c.nom,
    code: niveauDeClasse({ niveau: c.niveau, nom: c.nom, serie: serieParId.get(c.id) ?? null }) as NiveauCode | null,
  }));
}

async function chargerConfig(admin: any, etablissementId: string) {
  const res = await admin
    .from("planning_niveau_matieres")
    .select("niveau, cle, matiere_id, actif, volume_hebdo")
    .eq("etablissement_id", etablissementId);
  if (res.error) return { installe: false, lignes: [] as LigneConfig[] };
  return { installe: true, lignes: (res.data ?? []) as LigneConfig[] };
}

const codeValide = (c: any): c is NiveauCode => typeof c === "string" && (NIVEAUX_CODES as string[]).includes(c);
const volumeValide = (v: any) => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 40;

// GET            : la liste des niveaux (avec le nombre de classes et si les choix ont été faits)
// GET ?niveau=6e : les matières du niveau (tableau officiel + matières ajoutées par l'école)
export async function GET(request: NextRequest) {
  const ctx = await contexte();
  if ("erreur" in ctx) return ctx.erreur;
  const { admin, etablissementId } = ctx;

  const classes = await chargerClasses(admin, etablissementId);
  const { installe, lignes } = await chargerConfig(admin, etablissementId);
  const config = indexerConfig(lignes);

  const niveaux = NIVEAUX_CODES.map((code) => ({
    code,
    label: NIVEAU_LABEL[code],
    nbClasses: classes.filter((c) => c.code === code).length,
    configure: config.has(code),
  }));

  const code = request.nextUrl.searchParams.get("niveau");
  if (!code) return NextResponse.json({ installe, niveaux });
  if (!codeValide(code)) return NextResponse.json({ error: "Niveau inconnu." }, { status: 400 });

  const conf = config.get(code);
  const officielles = CLES_ORDRE.map((cle) => {
    const officiel = (VOLUMES_OFFICIELS[code] as Record<string, number | undefined>)[cle] ?? null;
    const choix = conf?.officielles.get(cle);
    return {
      cle,
      label: LIBELLE_CLE[cle] ?? cle,
      officiel,
      actif: choix ? choix.actif : officiel !== null,
      volume: choix?.volume ?? officiel,
    };
  });

  const idsPerso = (conf?.perso ?? []).map((p) => p.matiereId);
  const { data: mats } = idsPerso.length ? await admin.from("matieres").select("id, nom").in("id", idsPerso) : { data: [] as any[] };
  const nomParId = new Map<string, string>((mats ?? []).map((m: any) => [m.id, m.nom as string]));
  const perso = (conf?.perso ?? [])
    .filter((p) => nomParId.has(p.matiereId))
    .map((p) => ({ matiereId: p.matiereId, nom: nomParId.get(p.matiereId) as string, actif: p.actif, volume: p.volume }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return NextResponse.json({
    installe,
    niveaux,
    niveau: { code, label: NIVEAU_LABEL[code], nbClasses: classes.filter((c) => c.code === code).length },
    officielles,
    perso,
  });
}

// POST { mode: 'niveau',  niveau, officielles: [{cle, actif, volume}], perso: [{matiereId, actif, volume}] }
// POST { mode: 'ajouter', nom, volume, coefficient, niveaux: ['6e', ...] }
// POST { mode: 'retirer', niveau, matiereId }
export async function POST(request: NextRequest) {
  const ctx = await contexte();
  if ("erreur" in ctx) return ctx.erreur;
  const { admin, etablissementId } = ctx;
  const body = await request.json().catch(() => ({}));

  const probe = await admin.from("planning_niveau_matieres").select("id").eq("etablissement_id", etablissementId).limit(1);
  if (probe.error)
    return NextResponse.json({ error: "Exécutez d'abord le script SQL « planning_v5 » dans Supabase." }, { status: 500 });

  // ---------- Enregistrer les choix d'un niveau ----------
  if (body?.mode === "niveau") {
    const code = body?.niveau;
    if (!codeValide(code)) return NextResponse.json({ error: "Niveau inconnu." }, { status: 400 });
    const officielles: { cle: string; actif: boolean; volume: number | null }[] = Array.isArray(body?.officielles) ? body.officielles : [];
    const perso: { matiereId: string; actif: boolean; volume: number | null }[] = Array.isArray(body?.perso) ? body.perso : [];

    for (const o of officielles) {
      if (!CLES_ORDRE.includes(o?.cle)) return NextResponse.json({ error: "Matière inconnue." }, { status: 400 });
      if (o.actif && o.volume !== null && !volumeValide(o.volume))
        return NextResponse.json({ error: `Les heures de « ${LIBELLE_CLE[o.cle]} » doivent être un nombre entre 0,5 et 40.` }, { status: 400 });
      const officiel = (VOLUMES_OFFICIELS[code] as Record<string, number | undefined>)[o.cle];
      if (o.actif && officiel === undefined && !volumeValide(o.volume))
        return NextResponse.json({ error: `Indiquez les heures de « ${LIBELLE_CLE[o.cle]} » (elle n'est pas dans le tableau officiel de ce niveau).` }, { status: 400 });
    }
    for (const p of perso) {
      if (p.actif && !volumeValide(p.volume))
        return NextResponse.json({ error: "Indiquez les heures de chaque matière cochée (entre 0,5 et 40)." }, { status: 400 });
    }

    // matières officielles : on remplace toutes les lignes du niveau
    const { error: errSup } = await admin
      .from("planning_niveau_matieres")
      .delete()
      .eq("etablissement_id", etablissementId)
      .eq("niveau", code)
      .not("cle", "is", null);
    if (errSup) return NextResponse.json({ error: errSup.message }, { status: 500 });

    const aInserer = officielles.map((o) => {
      const officiel = (VOLUMES_OFFICIELS[code] as Record<string, number | undefined>)[o.cle];
      // on ne garde un volume que s'il diffère du tableau officiel (le reste suit le tableau officiel)
      const volume = o.actif && o.volume !== null && o.volume !== officiel ? o.volume : null;
      return { etablissement_id: etablissementId, niveau: code, cle: o.cle, matiere_id: null, actif: o.actif === true, volume_hebdo: volume };
    });
    if (aInserer.length > 0) {
      const { error } = await admin.from("planning_niveau_matieres").insert(aInserer);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // matières ajoutées par l'école : on met à jour les lignes existantes
    for (const p of perso) {
      const { error } = await admin
        .from("planning_niveau_matieres")
        .update({ actif: p.actif === true, volume_hebdo: p.volume })
        .eq("etablissement_id", etablissementId)
        .eq("niveau", code)
        .eq("matiere_id", p.matiereId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ---------- Retirer une matière ajoutée par l'école d'un niveau ----------
  if (body?.mode === "retirer") {
    const code = body?.niveau;
    if (!codeValide(code) || typeof body?.matiereId !== "string")
      return NextResponse.json({ error: "Demande incomplète." }, { status: 400 });
    const { error } = await admin
      .from("planning_niveau_matieres")
      .delete()
      .eq("etablissement_id", etablissementId)
      .eq("niveau", code)
      .eq("matiere_id", body.matiereId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ---------- Ajouter une matière (TIC, arabe...) à un ou plusieurs niveaux ----------
  if (body?.mode === "ajouter") {
    const nom = typeof body?.nom === "string" ? body.nom.trim().replace(/\s+/g, " ") : "";
    const volume = typeof body?.volume === "number" ? body.volume : NaN;
    const coefficient = typeof body?.coefficient === "number" && body.coefficient >= 0 && body.coefficient <= 20 ? body.coefficient : 1;
    const niveaux: NiveauCode[] = Array.isArray(body?.niveaux) ? body.niveaux.filter(codeValide) : [];
    if (nom.length < 2 || nom.length > 60) return NextResponse.json({ error: "Écrivez le nom de la matière (2 à 60 lettres)." }, { status: 400 });
    if (!volumeValide(volume)) return NextResponse.json({ error: "Les heures par semaine doivent être un nombre entre 0,5 et 40." }, { status: 400 });
    if (niveaux.length === 0) return NextResponse.json({ error: "Choisissez au moins un niveau." }, { status: 400 });

    const cleOfficielle = cleDeMatiere(nom);
    if (cleOfficielle)
      return NextResponse.json(
        { error: `« ${nom} » fait déjà partie du tableau officiel (${LIBELLE_CLE[cleOfficielle] ?? cleOfficielle}) : cochez-la dans la liste du niveau.` },
        { status: 400 }
      );

    // la matière existe peut-être déjà dans l'école
    const { data: matsEcole } = await admin.from("matieres").select("id, nom").eq("etablissement_id", etablissementId);
    const existante = (matsEcole ?? []).find((m: any) => normaliserNom(m.nom) === normaliserNom(nom));
    let matiereId: string | null = existante?.id ?? null;
    if (!matiereId) {
      const { data: creee, error } = await admin
        .from("matieres")
        .insert({ etablissement_id: etablissementId, nom, coefficient_defaut: coefficient, groupe_bilan: "Autres" })
        .select("id")
        .single();
      if (error || !creee) return NextResponse.json({ error: `Création de la matière impossible : ${error?.message ?? ""}` }, { status: 500 });
      matiereId = creee.id as string;
    }

    // une ligne par niveau (mise à jour si elle existe déjà)
    for (const code of niveaux) {
      const { data: deja } = await admin
        .from("planning_niveau_matieres")
        .select("id")
        .eq("etablissement_id", etablissementId)
        .eq("niveau", code)
        .eq("matiere_id", matiereId)
        .maybeSingle();
      const { error } = deja
        ? await admin.from("planning_niveau_matieres").update({ actif: true, volume_hebdo: volume }).eq("id", deja.id)
        : await admin
            .from("planning_niveau_matieres")
            .insert({ etablissement_id: etablissementId, niveau: code, cle: null, matiere_id: matiereId, actif: true, volume_hebdo: volume });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // rattache la matière aux classes de ces niveaux (bulletins, notes, affectation des professeurs)
    const classes = await chargerClasses(admin, etablissementId);
    const idsClasses = classes.filter((c) => c.code && niveaux.includes(c.code)).map((c) => c.id);
    let rattachees = 0;
    if (idsClasses.length > 0) {
      const { data: dejaLiees } = await admin.from("classes_matieres").select("classe_id").eq("matiere_id", matiereId).in("classe_id", idsClasses);
      const dejaIds = new Set((dejaLiees ?? []).map((l: any) => l.classe_id as string));
      const nouvelles = idsClasses.filter((id) => !dejaIds.has(id)).map((id) => ({ classe_id: id, matiere_id: matiereId, coefficient }));
      if (nouvelles.length > 0) {
        const { error } = await admin.from("classes_matieres").insert(nouvelles);
        if (error)
          return NextResponse.json({ error: `Matière ajoutée à l'emploi du temps, mais pas rattachée aux classes : ${error.message}` }, { status: 500 });
        rattachees = nouvelles.length;
      }
    }
    return NextResponse.json({ ok: true, creee: !existante, niveaux: niveaux.length, classesRattachees: rattachees });
  }

  return NextResponse.json({ error: "Demande inconnue." }, { status: 400 });
}
