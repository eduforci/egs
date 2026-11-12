import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { UUID_RE } from "@/lib/alertes-caisse";

export const dynamic = "force-dynamic";

// Seul le compte « administration » (le promoteur) peut agir ici.
// L'établissement vient TOUJOURS du profil, jamais de la requête.
async function verifierPromoteur() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { erreur: NextResponse.json({ error: "Non connecté." }, { status: 401 }) };
  }
  const { data: profil } = await supabase
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();
  if (!profil?.etablissement_id || profil.role !== "administration") {
    return {
      erreur: NextResponse.json({ error: "Réservé au promoteur de l'école." }, { status: 403 }),
    };
  }
  return {
    userId: user.id,
    etablissementId: profil.etablissement_id as string,
    admin: createAdminClient(),
  };
}

function montantValide(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1_000_000_000_000) return null;
  return Math.round(v);
}

function erreurBase(message: string | undefined) {
  const texte = message ?? "Erreur inconnue.";
  if (/does not exist|schema cache|relation/i.test(texte)) {
    return NextResponse.json(
      { error: "Les tables d'alertes n'existent pas encore. Exécutez supabase/alertes-caisse.sql." },
      { status: 500 }
    );
  }
  return NextResponse.json({ error: texte }, { status: 500 });
}

export async function POST(req: NextRequest) {
  const verif = await verifierPromoteur();
  if ("erreur" in verif) return verif.erreur;
  const { userId, etablissementId, admin } = verif;

  let corps: any;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const action = corps?.action;

  // ---- Marquer des alertes comme lues ----
  if (action === "tout_lire" || action === "lire") {
    let requete = admin
      .from("alertes_caisse")
      .update({ lue_le: new Date().toISOString() })
      .eq("etablissement_id", etablissementId)
      .is("lue_le", null);

    if (action === "lire") {
      const ids = Array.isArray(corps.ids)
        ? corps.ids.filter((x: unknown) => typeof x === "string" && UUID_RE.test(x)).slice(0, 200)
        : [];
      if (ids.length === 0) return NextResponse.json({ ok: true });
      requete = requete.in("id", ids);
    }

    const { error } = await requete;
    if (error) return erreurBase(error.message);
    return NextResponse.json({ ok: true });
  }

  // ---- Accorder ou refuser une dépense ----
  if (action === "accorder" || action === "refuser") {
    const depenseId = corps.depenseId;
    if (typeof depenseId !== "string" || !UUID_RE.test(depenseId)) {
      return NextResponse.json({ error: "Dépense inconnue." }, { status: 400 });
    }
    const motif =
      typeof corps.motif === "string" ? corps.motif.trim().slice(0, 200) : "";

    const maintenant = new Date().toISOString();
    const modifs =
      action === "accorder"
        ? { validee: true, validee_par: userId, validee_le: maintenant, refusee: false, refus_motif: null }
        : { validee: false, validee_par: null, validee_le: null, refusee: true, refus_motif: motif || null };

    const { data: depense, error } = await admin
      .from("depenses")
      .update(modifs)
      .eq("id", depenseId)
      .eq("etablissement_id", etablissementId)
      .select("id, libelle, montant")
      .maybeSingle();

    if (error) return erreurBase(error.message);
    if (!depense) return NextResponse.json({ error: "Dépense introuvable." }, { status: 404 });

    // La décision est prise : les alertes liées à cette dépense passent en « lues ».
    await admin
      .from("alertes_caisse")
      .update({ lue_le: maintenant })
      .eq("etablissement_id", etablissementId)
      .eq("cible_type", "depenses")
      .eq("cible_id", depenseId)
      .is("lue_le", null);

    await journaliser(admin, {
      etablissementId,
      acteurId: userId,
      action: action === "accorder" ? "caisse.depense_accordee" : "caisse.depense_refusee",
      cibleType: "depenses",
      cibleId: depenseId,
      cibleLibelle: depense.libelle,
      details: { montant: depense.montant, motif: motif || null },
    });

    return NextResponse.json({ ok: true });
  }

  // ---- Réglages des seuils et des options ----
  if (action === "reglages") {
    const seuilSortie = montantValide(corps.seuil_sortie);
    const seuilJustificatif = montantValide(corps.seuil_justificatif);
    const seuilValidation =
      corps.seuil_validation === null || corps.seuil_validation === ""
        ? null
        : montantValide(corps.seuil_validation);

    if (seuilSortie === null || seuilJustificatif === null) {
      return NextResponse.json({ error: "Les seuils doivent être des montants valides." }, { status: 400 });
    }
    if (corps.seuil_validation !== null && corps.seuil_validation !== "" && seuilValidation === null) {
      return NextResponse.json({ error: "Le seuil d'accord doit être un montant valide ou vide." }, { status: 400 });
    }

    const ligne = {
      etablissement_id: etablissementId,
      seuil_sortie: seuilSortie,
      seuil_justificatif: seuilJustificatif,
      seuil_validation: seuilValidation,
      alerte_sans_justificatif: corps.alerte_sans_justificatif === true,
      alerte_ecart_cloture: corps.alerte_ecart_cloture === true,
      alerte_modification: corps.alerte_modification === true,
      envoyer_sms: corps.envoyer_sms === true,
      mis_a_jour_le: new Date().toISOString(),
    };

    const { error } = await admin
      .from("regles_alerte_caisse")
      .upsert(ligne, { onConflict: "etablissement_id" });
    if (error) return erreurBase(error.message);

    await journaliser(admin, {
      etablissementId,
      acteurId: userId,
      action: "caisse.reglages_alertes",
      cibleType: "regles_alerte_caisse",
      cibleId: etablissementId,
      cibleLibelle: "Alertes de caisse",
      details: {
        seuil_sortie: ligne.seuil_sortie,
        seuil_justificatif: ligne.seuil_justificatif,
        seuil_validation: ligne.seuil_validation,
      },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
