import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { ESPACES_CODES, espaceDeClasse } from "@/lib/espaces";

export const dynamic = "force-dynamic";

// Rôles dont on peut limiter l'accès à certains espaces (le promoteur voit toujours tout).
const ROLES_LIMITABLES = ["chef", "directeur_etudes", "secretaire", "comptable", "educateur", "caissier"];

async function verifierPromoteur() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { erreur: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  }
  const { data: profil } = await supabase
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();
  if (!profil?.etablissement_id || !["administration", "super_admin"].includes(profil.role)) {
    return {
      erreur: NextResponse.json({ error: "Réservé au promoteur de l'école." }, { status: 403 }),
    };
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return { admin, etablissementId: profil.etablissement_id as string };
}

function nettoyer(liste: unknown): string[] {
  if (!Array.isArray(liste)) return [];
  return ESPACES_CODES.filter((c) => liste.includes(c));
}

// Espaces ouverts dans l'école + personnel et espaces autorisés pour chacun.
export async function GET() {
  const verif = await verifierPromoteur();
  if ("erreur" in verif) return verif.erreur;
  const { admin, etablissementId } = verif;

  const { data: etab, error: erreurEtab } = await admin
    .from("etablissements")
    .select("espaces_actifs")
    .eq("id", etablissementId)
    .single();
  if (erreurEtab) {
    return NextResponse.json(
      { error: `${erreurEtab.message}. Exécutez d'abord le script SQL « espaces » dans Supabase.` },
      { status: 500 }
    );
  }

  const { data: personnel } = await admin
    .from("profiles")
    .select("id, nom, prenom, role, espaces_autorises")
    .eq("etablissement_id", etablissementId)
    .in("role", ROLES_LIMITABLES)
    .order("nom");

  return NextResponse.json({
    espacesActifs: nettoyer((etab as any)?.espaces_actifs ?? []),
    personnel: (personnel ?? []).map((p: any) => ({
      id: p.id,
      nom: p.nom ?? "",
      prenom: p.prenom ?? "",
      role: p.role,
      espaces: nettoyer(p.espaces_autorises ?? []),
    })),
  });
}

// Enregistre les espaces ouverts et, si fourni, les droits du personnel.
export async function POST(request: NextRequest) {
  const verif = await verifierPromoteur();
  if ("erreur" in verif) return verif.erreur;
  const { admin, etablissementId } = verif;

  const body = await request.json().catch(() => ({}));
  const espacesActifs = nettoyer(body?.espacesActifs);
  if (espacesActifs.length === 0) {
    return NextResponse.json({ error: "Ouvrez au moins un espace." }, { status: 400 });
  }

  // On ne ferme pas un espace qui contient encore des classes.
  const { data: classes } = await admin
    .from("classes")
    .select("cycle, niveau, type_enseignement")
    .eq("etablissement_id", etablissementId);
  const utilises = new Set((classes ?? []).map((c: any) => espaceDeClasse(c.cycle, c.type_enseignement, c.niveau)));
  const fermesAvecClasses = Array.from(utilises).filter((e) => !espacesActifs.includes(e));
  if (fermesAvecClasses.length > 0) {
    return NextResponse.json(
      { error: `Impossible de fermer : ${fermesAvecClasses.join(", ")} (des classes existent encore).` },
      { status: 400 }
    );
  }

  const { error: erreurEtab } = await admin
    .from("etablissements")
    .update({ espaces_actifs: espacesActifs })
    .eq("id", etablissementId);
  if (erreurEtab) {
    return NextResponse.json(
      { error: `${erreurEtab.message}. Exécutez d'abord le script SQL « espaces » dans Supabase.` },
      { status: 500 }
    );
  }

  const droits: { id: string; espaces: unknown }[] = Array.isArray(body?.droits) ? body.droits : [];
  let nbDroits = 0;
  for (const d of droits) {
    if (typeof d?.id !== "string") continue;
    const choisis = nettoyer(d.espaces).filter((e) => espacesActifs.includes(e));
    // Vide ou tous cochés = aucune limite (null).
    const valeur = choisis.length === 0 || choisis.length === espacesActifs.length ? null : choisis;
    const { error } = await admin
      .from("profiles")
      .update({ espaces_autorises: valeur })
      .eq("id", d.id)
      .eq("etablissement_id", etablissementId)
      .in("role", ROLES_LIMITABLES);
    if (!error) nbDroits++;
  }

  return NextResponse.json({ ok: true, espacesActifs, nbDroits });
      }
    
