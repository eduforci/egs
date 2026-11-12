import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerSms, smsConfigure } from "@/lib/sms";
import { normaliserNumero, simplifierPourSms } from "@/lib/sms-texte";

export const dynamic = "force-dynamic";

// Envoie par SMS les alertes de caisse en attente au promoteur de chaque école.
//
// À appeler :
//   - par un Webhook de base de données Supabase (insertion dans alertes_caisse) : envoi immédiat ;
//   - et/ou par une tâche planifiée toutes les quelques minutes : rattrape les oublis.
// Dans les deux cas, l'appel doit porter l'en-tête  Authorization: Bearer <CRON_SECRET>.
// Les alertes « info » ne sont jamais envoyées par SMS.

const LIMITE_PAR_PASSAGE = 50;
const FENETRE_HEURES = 48;

async function traiter(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!smsConfigure()) {
    return NextResponse.json({ error: "Configuration SMS manquante." }, { status: 500 });
  }

  const admin = createAdminClient();
  const depuis = new Date(Date.now() - FENETRE_HEURES * 3600 * 1000).toISOString();

  const { data: enAttente, error } = await admin
    .from("alertes_caisse")
    .select("id")
    .is("sms_statut", null)
    .neq("niveau", "info")
    .gte("cree_le", depuis)
    .order("cree_le", { ascending: true })
    .limit(LIMITE_PAR_PASSAGE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!enAttente || enAttente.length === 0) return NextResponse.json({ envoyes: 0 });

  // On « réserve » les alertes avant l'envoi : deux passages simultanés ne les envoient pas deux fois.
  const { data: reservees, error: erreurReservation } = await admin
    .from("alertes_caisse")
    .update({ sms_statut: "en_cours" })
    .in(
      "id",
      enAttente.map((a: { id: string }) => a.id)
    )
    .is("sms_statut", null)
    .select("id, etablissement_id, titre, message, acteur_nom");

  if (erreurReservation) return NextResponse.json({ error: erreurReservation.message }, { status: 500 });

  const numerosParEcole = new Map<string, string[]>();
  async function numeros(etablissementId: string): Promise<string[]> {
    const connus = numerosParEcole.get(etablissementId);
    if (connus) return connus;
    const { data } = await admin
      .from("profiles")
      .select("telephone, actif")
      .eq("etablissement_id", etablissementId)
      .eq("role", "administration");
    const liste = Array.from(
      new Set(
        (data ?? [])
          .filter((p: { actif: boolean | null }) => p.actif !== false)
          .map((p: { telephone: string | null }) => normaliserNumero(p.telephone))
          .filter((n: string | null): n is string => !!n)
      )
    );
    numerosParEcole.set(etablissementId, liste);
    return liste;
  }

  let envoyes = 0;
  for (const alerte of reservees ?? []) {
    const destinataires = await numeros(alerte.etablissement_id);
    let statut: "envoye" | "echec" | "sans_numero" = "sans_numero";

    if (destinataires.length > 0) {
      const brut =
        `EGS Caisse : ${alerte.titre}` +
        (alerte.message ? ` - ${alerte.message}` : "") +
        (alerte.acteur_nom ? ` (${alerte.acteur_nom})` : "");
      const texte = simplifierPourSms(brut).slice(0, 155);

      statut = "echec";
      for (const numero of destinataires) {
        const retour = await envoyerSms(numero, texte);
        if (retour.ok) {
          statut = "envoye";
          envoyes += 1;
        } else {
          console.error("SMS alerte caisse non envoyé :", retour.erreur);
        }
      }
    }

    await admin.from("alertes_caisse").update({ sms_statut: statut }).eq("id", alerte.id);
  }

  return NextResponse.json({ envoyes, alertes: (reservees ?? []).length });
}

export async function GET(req: NextRequest) {
  return traiter(req);
}

export async function POST(req: NextRequest) {
  return traiter(req);
}
