import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: chefProfile } = await supabase
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();

  if (!chefProfile || chefProfile.role !== "chef") {
    return NextResponse.json({ error: "Accès réservé au chef d'établissement." }, { status: 403 });
  }

  const { nom, prenom } = await request.json();

  if (!nom || !prenom) {
    return NextResponse.json({ error: "Nom et prénom obligatoires." }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Numérotation robuste : plus grand numéro EDU-XXXX déjà utilisé SUR TOUTE LA BASE
  const { data: existants } = await admin
    .from("profiles")
    .select("identifiant")
    .like("identifiant", "EDU-%");

  const maxNumero = (existants ?? []).reduce((max, p) => {
    const match = p.identifiant?.match(/^EDU-(\d+)$/);
    const n = match ? parseInt(match[1], 10) : 0;
    return n > max ? n : max;
  }, 0);

  const numero = String(maxNumero + 1).padStart(4, "0");
  const identifiant = `EDU-${numero}`;
  const emailTechnique = `${identifiant.toLowerCase()}@${chefProfile.etablissement_id}.egs.local`;
  const motDePasseProvisoire = Math.random().toString(36).slice(-8) + "A1!";

  const { data: nouvelUser, error: createError } = await admin.auth.admin.createUser({
    email: emailTechnique,
    password: motDePasseProvisoire,
    email_confirm: true,
  });

  if (createError || !nouvelUser.user) {
    return NextResponse.json({ error: createError?.message || "Erreur de création." }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: nouvelUser.user.id,
    role: "educateur",
    etablissement_id: chefProfile.etablissement_id,
    nom,
    prenom,
    identifiant,
  });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ identifiant, motDePasseProvisoire });
    }
