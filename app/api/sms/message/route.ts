import { NextRequest, NextResponse } from "next/server";
import {
  verifierAccesSms,
  envoyerSms,
  traiterParLots,
  lireParLots,
  enregistrerHistoriqueSms,
  smsConfigure,
  type LigneHistoriqueSms,
} from "@/lib/sms";
import { normaliserNumero, simplifierPourSms, compterSegments } from "@/lib/sms-texte";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES_PERSONNEL = ["enseignant", "educateur", "comptable", "secretaire", "caissier", "directeur_etudes", "chef"];
const MAX_DESTINATAIRES = 2000;
const MAX_CARACTERES = 480;

// Liste des classes de l'année active + nom de l'école, pour remplir le formulaire.
export async function GET() {
  const acces = await verifierAccesSms();
  if (!acces.ok) return acces.reponse;
  const { admin, etablissementId } = acces;

  const { data: etab } = await admin
    .from("etablissements")
    .select("nom, annee_scolaire_active")
    .eq("id", etablissementId)
    .maybeSingle();

  let requete = admin.from("classes").select("id, nom").eq("etablissement_id", etablissementId);
  if (etab?.annee_scolaire_active) requete = requete.eq("annee_scolaire", etab.annee_scolaire_active);
  const { data: classes } = await requete.order("nom");

  return NextResponse.json({
    ecole: etab?.nom ?? "",
    classes: classes ?? [],
    smsConfigure: smsConfigure() !== null,
  });
}

type Destinataire = { nom: string; telephone: string };

// Envoie un message libre (ou en prépare l'aperçu avec "apercu": true : rien n'est envoyé).
export async function POST(request: NextRequest) {
  const acces = await verifierAccesSms();
  if (!acces.ok) return acces.reponse;
  const { admin, etablissementId, userId } = acces;

  const body = await request.json().catch(() => ({}));
  const cible = String(body?.cible ?? "");
  const classeId = typeof body?.classeId === "string" ? body.classeId : "";
  const apercu = body?.apercu === true;
  const texteSaisi = String(body?.message ?? "").trim();

  if (!["parents_tous", "parents_classe", "personnel"].includes(cible)) {
    return NextResponse.json({ error: "Destinataires non reconnus." }, { status: 400 });
  }
  if (!texteSaisi) {
    return NextResponse.json({ error: "Le message est vide." }, { status: 400 });
  }
  if (texteSaisi.length > MAX_CARACTERES) {
    return NextResponse.json(
      { error: `Message trop long (${MAX_CARACTERES} caractères maximum).` },
      { status: 400 }
    );
  }
  if (!apercu && !smsConfigure()) {
    return NextResponse.json(
      { error: "Configuration SMS manquante (variables d'environnement absentes)." },
      { status: 500 }
    );
  }

  const { data: etab } = await admin
    .from("etablissements")
    .select("nom")
    .eq("id", etablissementId)
    .maybeSingle();
  const message = simplifierPourSms(`${etab?.nom ?? "Ecole"} : ${texteSaisi}`);

  // --- Recherche des destinataires (toujours dans l'école de l'utilisateur) ---
  let profils: any[] = [];

  if (cible === "parents_tous") {
    const { data } = await admin
      .from("profiles")
      .select("id, nom, prenom, telephone")
      .eq("etablissement_id", etablissementId)
      .eq("role", "parent")
      .or("actif.is.null,actif.eq.true");
    profils = data ?? [];
  } else if (cible === "parents_classe") {
    if (!classeId) {
      return NextResponse.json({ error: "Choisissez une classe." }, { status: 400 });
    }
    const { data: classe } = await admin
      .from("classes")
      .select("id")
      .eq("id", classeId)
      .eq("etablissement_id", etablissementId)
      .maybeSingle();
    if (!classe) {
      return NextResponse.json({ error: "Classe introuvable dans votre école." }, { status: 404 });
    }
    const { data: elevesClasse } = await admin
      .from("eleves")
      .select("id")
      .eq("classe_id", classeId);
    const idsEleves = (elevesClasse ?? []).map((e: any) => e.id as string);
    const { lignes: liens } = await lireParLots<any>(idsEleves, (lot) =>
      admin.from("parents_eleves").select("parent_id").in("eleve_id", lot)
    );
    const idsParents = Array.from(new Set(liens.map((l) => l.parent_id as string)));
    const { lignes } = await lireParLots<any>(idsParents, (lot) =>
      admin
        .from("profiles")
        .select("id, nom, prenom, telephone")
        .in("id", lot)
        .or("actif.is.null,actif.eq.true")
    );
    profils = lignes;
  } else {
    const { data } = await admin
      .from("profiles")
      .select("id, nom, prenom, telephone")
      .eq("etablissement_id", etablissementId)
      .in("role", ROLES_PERSONNEL)
      .or("actif.is.null,actif.eq.true");
    profils = data ?? [];
  }

  // Un seul SMS par numéro (un parent de 3 enfants ne reçoit pas 3 fois le message).
  const parNumero = new Map<string, Destinataire>();
  let sansNumero = 0;
  for (const p of profils) {
    const tel = normaliserNumero(p.telephone);
    if (!tel) {
      sansNumero++;
      continue;
    }
    if (!parNumero.has(tel)) {
      parNumero.set(tel, { nom: `${p.prenom ?? ""} ${p.nom ?? ""}`.trim(), telephone: tel });
    }
  }
  const destinataires = Array.from(parNumero.values());

  if (destinataires.length > MAX_DESTINATAIRES) {
    return NextResponse.json(
      { error: `Trop de destinataires (${destinataires.length}). Maximum ${MAX_DESTINATAIRES} par envoi.` },
      { status: 400 }
    );
  }

  const segments = compterSegments(message);

  if (apercu) {
    return NextResponse.json({
      apercu: true,
      nbDestinataires: destinataires.length,
      nbSansNumero: sansNumero,
      segmentsParSms: segments,
      totalSms: destinataires.length * segments,
      messageFinal: message,
    });
  }

  if (destinataires.length === 0) {
    return NextResponse.json({ error: "Aucun destinataire avec un numéro valide." }, { status: 400 });
  }

  const historique: LigneHistoriqueSms[] = [];
  const retours = await traiterParLots(destinataires, 10, async (d) => {
    const retour = await envoyerSms(d.telephone, message);
    historique.push({
      etablissement_id: etablissementId,
      type: "libre",
      eleve_id: null,
      destinataire_nom: d.nom,
      telephone: d.telephone,
      message,
      statut: retour.ok ? "envoye" : "echec",
      erreur: retour.ok ? null : retour.erreur ?? null,
      envoye_par: userId,
    });
    return retour;
  });

  await enregistrerHistoriqueSms(admin, historique);

  const nbEnvoyes = retours.filter((r) => r.ok).length;
  const erreurs = Array.from(new Set(retours.filter((r) => !r.ok).map((r) => r.erreur ?? "Erreur")));

  return NextResponse.json({
    nbEnvoyes,
    nbEchecs: retours.length - nbEnvoyes,
    nbSansNumero: sansNumero,
    totalSms: nbEnvoyes * segments,
    erreurs: erreurs.slice(0, 3),
  });
}
