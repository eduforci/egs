import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function genererMotDePasseTemporaire() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

type LigneImport = {
  nom: string;
  prenom: string;
  matricule: string;
  niveau: string;
  sexe?: string | null;
  date_naissance?: string | null;
};

type ResultatLigne = {
  ligne: number;
  nom: string;
  prenom: string;
  matricule: string;
  succes: boolean;
  motDePasse?: string;
  erreur?: string;
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const lignes: LigneImport[] = body?.lignes ?? [];

  if (!Array.isArray(lignes) || lignes.length === 0) {
    return NextResponse.json({ error: "Aucune ligne à importer." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();

  const rolesAutorises = ["chef", "directeur_etudes", "secretaire", "super_admin"];
  if (!profile || !rolesAutorises.includes(profile.role)) {
    return NextResponse.json(
      { error: "Vous n'êtes pas autorisé à importer des élèves." },
      { status: 403 }
    );
  }

  if (!profile.etablissement_id) {
    return NextResponse.json(
      { error: "Aucun établissement associé à votre compte." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const etablissementId = profile.etablissement_id;

  // Vérifie en une seule requête tous les matricules déjà utilisés dans EGS,
  // pour éviter une collision avec un compte existant (élève déjà importé,
  // doublon dans le fichier, etc.).
  const matriculesFichier = lignes
    .map((l) => (l.matricule ?? "").toString().trim())
    .filter(Boolean);

  const { data: profilsExistants } = await admin
    .from("profiles")
    .select("identifiant")
    .in("identifiant", matriculesFichier.length > 0 ? matriculesFichier : ["__aucun__"]);

  const matriculesDejaUtilises = new Set(
    (profilsExistants ?? []).map((p) => p.identifiant)
  );

  // Cache des classes par niveau : évite une requête par ligne, et crée
  // automatiquement une classe par défaut "<Niveau> A" si aucune n'existe.
  const classeParNiveau = new Map<string, string>();

  async function obtenirClasseId(niveau: string): Promise<string> {
    const cle = niveau.trim().toLowerCase();
    if (classeParNiveau.has(cle)) return classeParNiveau.get(cle)!;

    const { data: classesExistantes } = await supabase
      .from("classes")
      .select("id, nom")
      .eq("etablissement_id", etablissementId)
      .ilike("niveau", niveau.trim())
      .order("nom")
      .limit(1);

    if (classesExistantes && classesExistantes.length > 0) {
      classeParNiveau.set(cle, classesExistantes[0].id);
      return classesExistantes[0].id;
    }

    const { data: etab } = await supabase
      .from("etablissements")
      .select("annee_scolaire_active")
      .eq("id", etablissementId)
      .single();

    const { data: nouvelleClasse, error: classeError } = await admin
      .from("classes")
      .insert({
        etablissement_id: etablissementId,
        nom: `${niveau.trim()} A`,
        niveau: niveau.trim(),
        annee_scolaire: etab?.annee_scolaire_active ?? "2025-2026",
      })
      .select("id")
      .single();

    if (classeError || !nouvelleClasse) {
      throw new Error(`Impossible de créer la classe pour le niveau "${niveau}".`);
    }

    classeParNiveau.set(cle, nouvelleClasse.id);
    return nouvelleClasse.id;
  }

  const resultats: ResultatLigne[] = [];
  const matriculesTraitesDansCetImport = new Set<string>();

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const numeroLigne = i + 2; // +2 : ligne 1 = en-têtes dans le fichier source

    const nom = (ligne.nom ?? "").toString().trim();
    const prenom = (ligne.prenom ?? "").toString().trim();
    const matricule = (ligne.matricule ?? "").toString().trim();
    const niveau = (ligne.niveau ?? "").toString().trim();

    if (!nom || !prenom || !matricule || !niveau) {
      resultats.push({
        ligne: numeroLigne,
        nom,
        prenom,
        matricule,
        succes: false,
        erreur: "Nom, prénom, matricule et niveau sont obligatoires.",
      });
      continue;
    }

    if (matriculesDejaUtilises.has(matricule)) {
      resultats.push({
        ligne: numeroLigne,
        nom,
        prenom,
        matricule,
        succes: false,
        erreur: "Ce matricule est déjà utilisé par un compte existant.",
      });
      continue;
    }

    if (matriculesTraitesDansCetImport.has(matricule)) {
      resultats.push({
        ligne: numeroLigne,
        nom,
        prenom,
        matricule,
        succes: false,
        erreur: "Matricule en double dans ce fichier.",
      });
      continue;
    }

    try {
      const classeId = await obtenirClasseId(niveau);

      const motDePasse = genererMotDePasseTemporaire();
      const emailSynthetique = `${matricule.toLowerCase()}@eleves.egs.local`;

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: emailSynthetique,
        password: motDePasse,
        email_confirm: true,
      });

      if (createError || !created?.user) {
        throw new Error(createError?.message || "Erreur lors de la création du compte.");
      }

      const userId = created.user.id;

      const { error: profileError } = await admin.from("profiles").insert({
        id: userId,
        role: "eleve",
        etablissement_id: etablissementId,
        nom,
        prenom,
        identifiant: matricule,
        must_change_password: true,
      });

      if (profileError) {
        await admin.auth.admin.deleteUser(userId);
        throw new Error(profileError.message);
      }

      const dateNaissance = ligne.date_naissance ? ligne.date_naissance.toString().trim() : null;
      const sexe = ligne.sexe ? ligne.sexe.toString().trim().toUpperCase() : null;

      const { error: eleveError } = await admin.from("eleves").insert({
        id: userId,
        etablissement_id: etablissementId,
        classe_id: classeId,
        matricule,
        date_naissance: dateNaissance || null,
        sexe: sexe === "M" || sexe === "F" ? sexe : null,
        statut: "actif",
      });

      if (eleveError) {
        await admin.auth.admin.deleteUser(userId);
        throw new Error(eleveError.message);
      }

      matriculesTraitesDansCetImport.add(matricule);

      resultats.push({
        ligne: numeroLigne,
        nom,
        prenom,
        matricule,
        succes: true,
        motDePasse,
      });
    } catch (err) {
      resultats.push({
        ligne: numeroLigne,
        nom,
        prenom,
        matricule,
        succes: false,
        erreur: err instanceof Error ? err.message : "Erreur inconnue.",
      });
    }
  }

  const nbSucces = resultats.filter((r) => r.succes).length;
  const nbEchecs = resultats.length - nbSucces;

  return NextResponse.json({ resultats, nbSucces, nbEchecs });
       }
            
