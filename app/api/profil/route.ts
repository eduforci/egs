import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";

// Chaque utilisateur connecté modifie SON propre profil.
// Le rôle, l'établissement et l'identifiant ne sont jamais modifiables ici.
// - élève : photo de profil uniquement (son identité est officielle : matricule, bulletins)
// - parent : nom, prénom, téléphone, photo
// - personnel : nom, prénom, téléphone, fonction, photo
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: {
    nom?: string;
    prenom?: string;
    telephone?: string;
    fonction?: string;
    avatar_url?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: profil } = await admin
    .from("profiles")
    .select("role, etablissement_id, nom, prenom, telephone, fonction, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profil) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });
  }

  const role = profil.role as string;
  const estEleve = role === "eleve";
  const estParent = role === "parent";

  const misAJour: Record<string, any> = {};

  // Photo de profil : l'adresse doit pointer vers le dossier de CET utilisateur
  if (body.avatar_url !== undefined) {
    if (body.avatar_url === null || body.avatar_url === "") {
      misAJour.avatar_url = null;
    } else {
      const attendu = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${user.id}/`;
      if (!body.avatar_url.startsWith(attendu)) {
        return NextResponse.json({ error: "Adresse de photo invalide." }, { status: 400 });
      }
      misAJour.avatar_url = body.avatar_url;
    }
  }

  if (!estEleve) {
    if (body.nom !== undefined || body.prenom !== undefined) {
      const nom = (body.nom ?? "").toString().trim();
      const prenom = (body.prenom ?? "").toString().trim();
      if (!nom || !prenom) {
        return NextResponse.json({ error: "Le nom et le prénom sont obligatoires." }, { status: 400 });
      }
      if (nom.length > 100 || prenom.length > 100) {
        return NextResponse.json({ error: "Le nom ou le prénom est trop long." }, { status: 400 });
      }
      misAJour.nom = nom;
      misAJour.prenom = prenom;
    }

    if (body.telephone !== undefined) {
      const telephone = (body.telephone ?? "").toString().trim();
      if (telephone.length > 30) {
        return NextResponse.json({ error: "Numéro de téléphone trop long." }, { status: 400 });
      }
      misAJour.telephone = telephone || null;
    }

    if (body.fonction !== undefined && !estParent) {
      const fonction = (body.fonction ?? "").toString().trim();
      if (fonction.length > 100) {
        return NextResponse.json({ error: "La fonction est trop longue." }, { status: 400 });
      }
      misAJour.fonction = fonction || null;
    }
  }

  if (Object.keys(misAJour).length === 0) {
    return NextResponse.json({ error: "Aucune modification autorisée pour votre profil." }, { status: 400 });
  }

  const { error } = await admin.from("profiles").update(misAJour).eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Journal d'audit : seulement ce qui a vraiment changé
  const diff: Record<string, { avant: unknown; apres: unknown }> = {};
  for (const cle of ["nom", "prenom", "telephone", "fonction"] as const) {
    if (misAJour[cle] !== undefined && (profil[cle] ?? null) !== misAJour[cle]) {
      diff[cle] = { avant: profil[cle] ?? null, apres: misAJour[cle] };
    }
  }
  if (misAJour.avatar_url !== undefined && (profil.avatar_url ?? null) !== misAJour.avatar_url) {
    diff.photo = { avant: profil.avatar_url ? "oui" : "non", apres: misAJour.avatar_url ? "oui" : "non" };
  }
  if (Object.keys(diff).length > 0) {
    await journaliser(admin, {
      etablissementId: profil.etablissement_id,
      acteurId: user.id,
      action: "profil.modifie",
      cibleType: "profil",
      cibleId: user.id,
      cibleLibelle: `${misAJour.prenom ?? profil.prenom ?? ""} ${misAJour.nom ?? profil.nom ?? ""}`.trim(),
      details: diff,
    });
  }

  return NextResponse.json({ success: true });
}
