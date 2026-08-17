import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.role !== "super_admin") {
    return NextResponse.json({ error: "Accès réservé au super admin." }, { status: 403 });
  }

  const { etablissementId, nom, prenom } = await request.json();

  if (!etablissementId || !nom || !prenom) {
    return NextResponse.json(
      { error: "Établissement, nom et prénom du directeur sont obligatoires." },
      { status: 400 }
    );
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Vérifie qu'un directeur n'existe pas déjà pour cet établissement
  const { count: dejaExistant } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("etablissement_id", etablissementId)
    .eq("role", "chef");

  if (dejaExistant && dejaExistant > 0) {
    return NextResponse.json(
      { error: "Un directeur existe déjà pour cet établissement." },
      { status: 409 }
    );
  }

  // Numérotation robuste : plus grand numéro DIR-XXXX déjà utilisé
  // sur toute la base (identifiant unique globalement). Un simple
  // comptage peut provoquer des collisions après une suppression.
  const { data: existants } = await admin
    .from("profiles")
    .select("identifiant")
    .like("identifiant", "CE-%");

  const maxNumero = (existants ?? []).reduce((max, p) => {
    const match = p.identifiant?.match(/^CE-(\d+)$/);
    const n = match ? parseInt(match[1], 10) : 0;
    return n > max ? n : max;
  }, 0);

  const numero = String(maxNumero + 1).padStart(4, "0");
  const identifiant = `CE-${numero}`;
  const emailTechnique = `${identifiant.toLowerCase()}@${etablissementId}.egs.local`;
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
    role: "chef",
    etablissement_id: etablissementId,
    nom,
    prenom,
    identifiant,
  });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ identifiant, motDePasseProvisoire });
}
