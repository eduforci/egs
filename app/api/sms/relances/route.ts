import { NextRequest, NextResponse } from "next/server";
import {
  verifierAccesSms,
  envoyerSms,
  traiterParLots,
  lireParLots,
  enregistrerHistoriqueSms,
  smsConfigure,
  type AccesSms,
  type LigneHistoriqueSms,
} from "@/lib/sms";
import {
  normaliserNumero,
  simplifierPourSms,
  compterSegments,
  formaterMontant,
  formaterDateCourte,
} from "@/lib/sms-texte";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LigneRelance = {
  eleve_id: string;
  eleve_nom: string;
  eleve_prenom: string;
  classe_nom: string;
  nb_echeances: number;
  total_restant: number;
  plus_ancienne: string;
  jours_retard_max: number;
  parent_nom: string | null;
  telephone: string | null;
  message: string;
  segments: number;
  dernier_sms: string | null;
  deja_relance_aujourdhui: boolean;
};

type AccesOk = Extract<AccesSms, { ok: true }>;

// Construit, côté serveur, la liste des élèves en retard avec le numéro du parent à joindre.
// Les montants et les messages ne viennent jamais du navigateur.
async function construireRelances(
  acces: AccesOk
): Promise<{ lignes: LigneRelance[]; historiqueDispo: boolean } | { erreur: string }> {
  const { supabase, admin, etablissementId } = acces;

  // Même appel que l'ancienne page : la fonction SQL est lue avec le compte de l'utilisateur.
  const { data: retardsData, error } = await supabase.rpc("eleves_en_retard_paiement", {
    p_etablissement_id: etablissementId,
  });
  if (error) return { erreur: error.message };

  const retards = (retardsData ?? []) as any[];
  const idsEleves = Array.from(new Set(retards.map((r) => r.eleve_id as string)));
  if (idsEleves.length === 0) return { lignes: [], historiqueDispo: true };

  const { data: etab } = await admin
    .from("etablissements")
    .select("nom")
    .eq("id", etablissementId)
    .maybeSingle();
  const nomEcole = (etab?.nom as string | undefined) ?? "Ecole";

  const { lignes: eleves } = await lireParLots<any>(idsEleves, (lot) =>
    admin.from("eleves").select("id, classe_id, classes(nom)").in("id", lot)
  );
  const { lignes: profilsEleves } = await lireParLots<any>(idsEleves, (lot) =>
    admin.from("profiles").select("id, nom, prenom").in("id", lot)
  );
  const { lignes: liens } = await lireParLots<any>(idsEleves, (lot) =>
    admin
      .from("parents_eleves")
      .select("parent_id, eleve_id, responsable_financier, contact_principal")
      .in("eleve_id", lot)
  );
  const idsParents = Array.from(new Set(liens.map((l) => l.parent_id as string)));
  const { lignes: profilsParents } = await lireParLots<any>(idsParents, (lot) =>
    admin.from("profiles").select("id, nom, prenom, telephone").in("id", lot)
  );

  // Historique des SMS déjà envoyés (si la table n'existe pas encore, on continue sans)
  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);
  const { lignes: historique, erreur: erreurHistorique } = await lireParLots<any>(idsEleves, (lot) =>
    admin
      .from("sms_envoyes")
      .select("eleve_id, created_at, statut")
      .eq("etablissement_id", etablissementId)
      .eq("type", "relance")
      .eq("statut", "envoye")
      .in("eleve_id", lot)
      .order("created_at", { ascending: false })
  );
  const dernierSms = new Map<string, string>();
  const relanceAujourdhui = new Set<string>();
  for (const h of historique) {
    if (!dernierSms.has(h.eleve_id)) dernierSms.set(h.eleve_id, h.created_at);
    if (new Date(h.created_at) >= debutJour) relanceAujourdhui.add(h.eleve_id);
  }

  const elevesParId = new Map(eleves.map((e) => [e.id, e]));
  const profilsEleveParId = new Map(profilsEleves.map((p) => [p.id, p]));
  const profilsParentParId = new Map(profilsParents.map((p) => [p.id, p]));
  const liensParEleve = new Map<string, any[]>();
  for (const l of liens) {
    const liste = liensParEleve.get(l.eleve_id) ?? [];
    liste.push(l);
    liensParEleve.set(l.eleve_id, liste);
  }

  // Un seul SMS par élève, même s'il a plusieurs échéances en retard.
  const retardsParEleve = new Map<string, any[]>();
  for (const r of retards) {
    const liste = retardsParEleve.get(r.eleve_id) ?? [];
    liste.push(r);
    retardsParEleve.set(r.eleve_id, liste);
  }

  const lignes: LigneRelance[] = [];
  for (const [eleveId, echeances] of Array.from(retardsParEleve.entries())) {
    const profil = profilsEleveParId.get(eleveId);
    const eleve = elevesParId.get(eleveId);
    const classe = Array.isArray(eleve?.classes) ? eleve?.classes[0] : eleve?.classes;

    // Parent à joindre : responsable financier d'abord, puis contact principal, puis les autres.
    const liensEleve = [...(liensParEleve.get(eleveId) ?? [])].sort(
      (a, b) =>
        (b.responsable_financier ? 2 : 0) + (b.contact_principal ? 1 : 0) -
        ((a.responsable_financier ? 2 : 0) + (a.contact_principal ? 1 : 0))
    );
    let parentNom: string | null = null;
    let telephone: string | null = null;
    for (const lien of liensEleve) {
      const p = profilsParentParId.get(lien.parent_id);
      const nom = p ? `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() : "";
      if (parentNom === null && nom) parentNom = nom;
      const tel = normaliserNumero(p?.telephone);
      if (tel) {
        parentNom = nom || parentNom;
        telephone = tel;
        break;
      }
    }

    const total = echeances.reduce((s, r) => s + Number(r.montant_restant ?? 0), 0);
    const plusAncienne = echeances
      .map((r) => String(r.date_echeance))
      .sort()[0];
    const joursMax = Math.max(...echeances.map((r) => Number(r.jours_retard ?? 0)));

    const prenomNom = `${profil?.prenom ?? ""} ${profil?.nom ?? ""}`.trim();
    const message = simplifierPourSms(
      `${nomEcole} : rappel de scolarité pour ${prenomNom} (${classe?.nom ?? "classe"}). ` +
        `Retard de paiement : ${formaterMontant(total)} F CFA ` +
        `(${echeances.length} échéance${echeances.length > 1 ? "s" : ""}, la plus ancienne due le ${formaterDateCourte(plusAncienne)}). ` +
        `Merci de régulariser.`
    );

    lignes.push({
      eleve_id: eleveId,
      eleve_nom: profil?.nom ?? "",
      eleve_prenom: profil?.prenom ?? "",
      classe_nom: classe?.nom ?? "",
      nb_echeances: echeances.length,
      total_restant: total,
      plus_ancienne: plusAncienne,
      jours_retard_max: joursMax,
      parent_nom: parentNom,
      telephone,
      message,
      segments: compterSegments(message),
      dernier_sms: dernierSms.get(eleveId) ?? null,
      deja_relance_aujourdhui: relanceAujourdhui.has(eleveId),
    });
  }

  lignes.sort((a, b) => b.jours_retard_max - a.jours_retard_max);
  return { lignes, historiqueDispo: erreurHistorique === null };
}

// Liste des élèves en retard de paiement, avec le message SMS qui serait envoyé.
export async function GET() {
  const acces = await verifierAccesSms();
  if (!acces.ok) return acces.reponse;

  const resultat = await construireRelances(acces);
  if ("erreur" in resultat) {
    return NextResponse.json({ error: resultat.erreur }, { status: 500 });
  }
  return NextResponse.json({
    lignes: resultat.lignes,
    historiqueDispo: resultat.historiqueDispo,
    smsConfigure: smsConfigure() !== null,
  });
}

// Envoie les SMS de relance aux parents des élèves demandés.
export async function POST(request: NextRequest) {
  const acces = await verifierAccesSms();
  if (!acces.ok) return acces.reponse;

  const body = await request.json().catch(() => ({}));
  const eleveIds: string[] = Array.isArray(body?.eleveIds)
    ? body.eleveIds.filter((x: unknown) => typeof x === "string")
    : [];
  const forcer = body?.forcer === true;

  if (eleveIds.length === 0) {
    return NextResponse.json({ error: "Aucun élève sélectionné." }, { status: 400 });
  }
  if (eleveIds.length > 500) {
    return NextResponse.json({ error: "Maximum 500 relances par envoi." }, { status: 400 });
  }
  if (!smsConfigure()) {
    return NextResponse.json(
      { error: "Configuration SMS manquante (variables d'environnement absentes)." },
      { status: 500 }
    );
  }

  const resultat = await construireRelances(acces);
  if ("erreur" in resultat) {
    return NextResponse.json({ error: resultat.erreur }, { status: 500 });
  }

  const demandes = new Set(eleveIds);
  const lignesParId = new Map(resultat.lignes.map((l) => [l.eleve_id, l]));

  type Issue = { eleve_id: string; nom: string; statut: string; erreur?: string };
  const issues: Issue[] = [];
  const aEnvoyer: LigneRelance[] = [];

  for (const id of Array.from(demandes)) {
    const ligne = lignesParId.get(id);
    if (!ligne) {
      issues.push({ eleve_id: id, nom: "", statut: "introuvable" });
      continue;
    }
    const nom = `${ligne.eleve_prenom} ${ligne.eleve_nom}`.trim();
    if (!ligne.telephone) {
      issues.push({ eleve_id: id, nom, statut: "sans_numero" });
    } else if (ligne.deja_relance_aujourdhui && !forcer) {
      issues.push({ eleve_id: id, nom, statut: "deja_envoye" });
    } else {
      aEnvoyer.push(ligne);
    }
  }

  const historique: LigneHistoriqueSms[] = [];
  const envois = await traiterParLots(aEnvoyer, 10, async (ligne) => {
    const retour = await envoyerSms(ligne.telephone as string, ligne.message);
    historique.push({
      etablissement_id: acces.etablissementId,
      type: "relance",
      eleve_id: ligne.eleve_id,
      destinataire_nom: ligne.parent_nom,
      telephone: ligne.telephone as string,
      message: ligne.message,
      statut: retour.ok ? "envoye" : "echec",
      erreur: retour.ok ? null : retour.erreur ?? null,
      envoye_par: acces.userId,
    });
    return {
      eleve_id: ligne.eleve_id,
      nom: `${ligne.eleve_prenom} ${ligne.eleve_nom}`.trim(),
      statut: retour.ok ? "envoye" : "echec",
      erreur: retour.erreur,
    } as Issue;
  });
  issues.push(...envois);

  await enregistrerHistoriqueSms(acces.admin, historique);

  return NextResponse.json({
    nbEnvoyes: envois.filter((e) => e.statut === "envoye").length,
    nbEchecs: envois.filter((e) => e.statut === "echec").length,
    nbIgnores: issues.length - envois.length,
    resultats: issues,
  });
}
