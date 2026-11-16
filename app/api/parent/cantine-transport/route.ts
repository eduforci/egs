import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Renvoie, pour le parent connecté et UNIQUEMENT pour ses propres enfants :
// leur inscription à la cantine et au transport, plus les menus de l'établissement
// pour les 14 prochains jours. Passage par le serveur : un parent ne peut pas lire
// directement les tables de gestion de l'école.
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: profil } = await admin
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();
  if (profil?.role !== "parent" || !profil.etablissement_id) {
    return NextResponse.json({ error: "Accès réservé aux parents." }, { status: 403 });
  }

  const { data: liens, error: liensErreur } = await admin
    .from("parents_eleves")
    .select("eleve_id")
    .eq("parent_id", user.id);
  if (liensErreur) {
    return NextResponse.json({ error: liensErreur.message }, { status: 500 });
  }
  const idsEleves = Array.from(new Set((liens ?? []).map((l: any) => l.eleve_id as string)));

  const aujourdhui = new Date();
  const fin = new Date();
  fin.setDate(fin.getDate() + 14);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const { data: menus } = await admin
    .from("cantine_menus")
    .select("date_menu, entree, plat, dessert")
    .eq("etablissement_id", profil.etablissement_id)
    .gte("date_menu", iso(aujourdhui))
    .lte("date_menu", iso(fin))
    .order("date_menu");

  if (idsEleves.length === 0) {
    return NextResponse.json({ enfants: [], menus: menus ?? [] });
  }

  const [{ data: eleves }, { data: cantine }, { data: transport }] = await Promise.all([
    admin.from("eleves").select("id, nom, prenom, classes(nom)").in("id", idsEleves),
    admin
      .from("cantine_inscriptions")
      .select("eleve_id, actif, regime, allergies, cantine_formules(nom, montant, periodicite)")
      .in("eleve_id", idsEleves)
      .eq("etablissement_id", profil.etablissement_id),
    admin
      .from("transport_inscriptions")
      .select("eleve_id, actif, sens, transport_circuits(nom, tarif, periodicite, heure_depart_matin, heure_depart_soir), transport_arrets(nom, heure_passage)")
      .in("eleve_id", idsEleves)
      .eq("etablissement_id", profil.etablissement_id),
  ]);

  const un = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null;

  const enfants = (eleves ?? []).map((e: any) => {
    const c = (cantine ?? []).find((x: any) => x.eleve_id === e.id);
    const t = (transport ?? []).find((x: any) => x.eleve_id === e.id);
    return {
      id: e.id,
      nom: e.nom,
      prenom: e.prenom,
      classe: un(e.classes)?.nom ?? null,
      cantine: c
        ? { actif: c.actif, regime: c.regime, allergies: c.allergies, formule: un(c.cantine_formules) }
        : null,
      transport: t
        ? { actif: t.actif, sens: t.sens, circuit: un(t.transport_circuits), arret: un(t.transport_arrets) }
        : null,
    };
  });

  return NextResponse.json({ enfants, menus: menus ?? [] });
}
