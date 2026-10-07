import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { journaliser } from "@/lib/audit";

// Crée le compte principal « administration » d'un établissement.
// (Le chemin de la route est conservé pour ne pas casser les écrans existants.)
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
      { error: "Établissement, nom et prénom du responsable sont obligatoires." },
      { status: 400 }
    );
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Un seul compte administration par établissement
  const { count: dejaExistant } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("etablissement_id", etablissementId)
    .eq("role", "administration");

  if (dejaExistant && dejaExistant > 0) {
    return NextResponse.json(
      { error: "Un compte administration existe déjà pour cet établissement." },
      { status: 409 }
    );
  }

  // Numérotation : plus grand numéro AD-XXXX déjà utilisé sur toute la base
  const { data: existants } = await admin
    .from("profiles")
    .select("identifiant")
    .like("identifiant", "AD-%");

  const maxNumero = (existants ?? []).reduce((max, p) => {
    const match = p.identifiant?.match(/^AD-(\d+)$/);
    const n = match ? parseInt(match[1], 10) : 0;
    return n > max ? n : max;
  }, 0);

  const numero = String(maxNumero + 1).padStart(4, "0");
  const identifiant = `AD-${numero}`;
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
    role: "administration",
    etablissement_id: etablissementId,
    nom: String(nom).trim(),
    prenom: String(prenom).trim(),
    identifiant,
    must_change_password: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(nouvelUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  await journaliser(admin, {
    etablissementId,
    acteurId: user.id,
    action: "compte.cree",
    cibleType: "profil",
    cibleId: nouvelUser.user.id,
    cibleLibelle: `${String(prenom).trim()} ${String(nom).trim()}`,
    details: { role: "administration", identifiant },
  });

  return NextResponse.json({ identifiant, motDePasseProvisoire });
}
