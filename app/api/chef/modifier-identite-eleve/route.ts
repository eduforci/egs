import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();

  const rolesAutorises = ["administration", "chef", "directeur_etudes", "secretaire", "super_admin"];
  if (!profile || !rolesAutorises.includes(profile.role)) {
    return NextResponse.json({ error: "Accès réservé à l'administration de l'école." }, { status: 403 });
  }

  const { eleveId, nom, prenom } = await request.json();
  const nomPropre = String(nom ?? "").trim();
  const prenomPropre = String(prenom ?? "").trim();

  if (!eleveId || !nomPropre || !prenomPropre) {
    return NextResponse.json({ error: "Nom et prénom obligatoires." }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: eleve } = await admin
    .from("eleves")
    .select("id, etablissement_id")
    .eq("id", eleveId)
    .single();

  if (!eleve) return NextResponse.json({ error: "Élève introuvable." }, { status: 404 });
  if (profile.role !== "super_admin" && eleve.etablissement_id !== profile.etablissement_id) {
    return NextResponse.json({ error: "Accès refusé pour cet établissement." }, { status: 403 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ nom: nomPropre, prenom: prenomPropre })
    .eq("id", eleveId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
