import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { estCodeTarif } from "@/lib/tarifs";

export const dynamic = "force-dynamic";

async function verifierSuperAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "super_admin")
    return { erreur: NextResponse.json({ error: "Accès réservé à l'administrateur de la plateforme." }, { status: 403 }) };
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  return { admin };
}

const manque = (m: string) =>
  /tarifs_/i.test(m) && /(does not exist|schema cache|relation)/i.test(m)
    ? "Les tables de tarifs n'existent pas encore : lancez d'abord le script SQL migration_tarifs."
    : m;

// Offres, tranches, grille de prix, et écoles avec leurs cycles, leur formule et leur effectif
export async function GET() {
  const v = await verifierSuperAdmin();
  if (v.erreur) return v.erreur;
  const admin = v.admin!;

  const [offres, tranches, grille] = await Promise.all([
    admin.from("tarifs_abonnement").select("code, libelle").order("code"),
    admin.from("tarifs_tranches").select("ordre, effectif_max").order("ordre"),
    admin.from("tarifs_grille").select("code, ordre, prix_annuel"),
  ]);
  const err = offres.error || tranches.error || grille.error;
  if (err) return NextResponse.json({ error: manque(err.message) }, { status: 500 });

  // Lecture en deux temps : si le SQL « formules » n'est pas lancé, les écoles restent listées sans formule
  type Ecole = { id: string; nom: string; statut: string; espaces_actifs: string[] | null; formule_secondaire?: string | null };
  let ecoles: Ecole[] = [];
  const complet = await admin.from("etablissements").select("id, nom, statut, espaces_actifs, formule_secondaire").order("nom");
  if (!complet.error) ecoles = (complet.data ?? []) as Ecole[];
  else {
    const simple = await admin.from("etablissements").select("id, nom, statut, espaces_actifs").order("nom");
    if (simple.error) return NextResponse.json({ error: simple.error.message }, { status: 500 });
    ecoles = (simple.data ?? []) as Ecole[];
  }

  // Effectif : élèves de l'école (hors transférés), plus les étudiants si l'école a le supérieur
  const avecEffectif = await Promise.all(
    ecoles.map(async (e) => {
      const total = await admin.from("eleves").select("id", { count: "exact", head: true }).eq("etablissement_id", e.id);
      const partis = await admin.from("eleves").select("id", { count: "exact", head: true }).eq("etablissement_id", e.id).eq("statut", "transfere");
      let effectif = Math.max(0, (total.count ?? 0) - (partis.error ? 0 : partis.count ?? 0));
      if ((e.espaces_actifs ?? []).includes("superieur")) {
        const u = await admin.from("univ_etudiants").select("id", { count: "exact", head: true }).eq("etablissement_id", e.id);
        if (!u.error) effectif += u.count ?? 0;
      }
      return { ...e, effectif };
    })
  );

  return NextResponse.json({
    offres: offres.data ?? [],
    tranches: tranches.data ?? [],
    grille: grille.data ?? [],
    ecoles: avecEffectif,
  });
}

// POST { limites: [200, 400, 600], grille: [{ code, ordre, prix }] }
// `limites` = effectif maximum de chaque tranche sauf la dernière (sans limite). Prix vide = non défini.
export async function POST(request: Request) {
  const v = await verifierSuperAdmin();
  if (v.erreur) return v.erreur;
  const admin = v.admin!;
  const body = await request.json().catch(() => ({}));

  const limites: number[] = (Array.isArray(body?.limites) ? body.limites : []).map((x: unknown) => Number(String(x ?? "").replace(/\s/g, "")));
  for (let i = 0; i < limites.length; i++) {
    if (!Number.isInteger(limites[i]) || limites[i] < 1 || (i > 0 && limites[i] <= limites[i - 1]))
      return NextResponse.json({ error: "Les limites de tranches doivent être des nombres entiers croissants (ex. 200, 400, 600)." }, { status: 400 });
  }
  const nb = limites.length + 1;

  const lignes: { code: string; ordre: number; prix_annuel: number | null; modifie_le: string }[] = [];
  const liste: { code: unknown; ordre: unknown; prix: unknown }[] = Array.isArray(body?.grille) ? body.grille : [];
  for (const g of liste) {
    const ordre = Number(g.ordre);
    if (!estCodeTarif(g.code) || !Number.isInteger(ordre) || ordre < 1 || ordre > nb) continue;
    const brut = String(g.prix ?? "").replace(/\s/g, "");
    let prix: number | null = null;
    if (brut !== "") {
      const n = Number(brut);
      if (!Number.isInteger(n) || n < 0) return NextResponse.json({ error: `Prix invalide : « ${brut} » (nombre entier de FCFA).` }, { status: 400 });
      prix = n;
    }
    lignes.push({ code: g.code, ordre, prix_annuel: prix, modifie_le: new Date().toISOString() });
  }

  const tranches = Array.from({ length: nb }, (_, i) => ({ ordre: i + 1, effectif_max: i < limites.length ? limites[i] : null }));
  const t1 = await admin.from("tarifs_tranches").upsert(tranches, { onConflict: "ordre" });
  if (t1.error) return NextResponse.json({ error: manque(t1.error.message) }, { status: 500 });
  const t2 = await admin.from("tarifs_tranches").delete().gt("ordre", nb); // supprime aussi leurs prix (cascade)
  if (t2.error) return NextResponse.json({ error: manque(t2.error.message) }, { status: 500 });
  if (lignes.length) {
    const g1 = await admin.from("tarifs_grille").upsert(lignes, { onConflict: "code,ordre" });
    if (g1.error) return NextResponse.json({ error: manque(g1.error.message) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
