import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type DestinataireSMS = {
  telephone: string;
  nom?: string;
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { destinataires, message } = body as {
    destinataires: DestinataireSMS[];
    message: string;
  };

  if (!Array.isArray(destinataires) || destinataires.length === 0 || !message?.trim()) {
    return NextResponse.json(
      { error: "Au moins un destinataire et un message sont obligatoires." },
      { status: 400 }
    );
  }

  // Seuls chef et directeur des études peuvent déclencher un envoi SMS.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const rolesAutorises = ["chef", "directeur_etudes"];
  if (!profile || !rolesAutorises.includes(profile.role)) {
    return NextResponse.json(
      { error: "Vous n'êtes pas autorisé à envoyer des SMS." },
      { status: 403 }
    );
  }

  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;

  if (!username || !apiKey) {
    return NextResponse.json(
      { error: "Configuration SMS manquante (variables d'environnement absentes)." },
      { status: 500 }
    );
  }

  // Numéros ivoiriens : on les normalise au format international +225XXXXXXXXXX.
  function normaliserNumero(numero: string): string | null {
    const chiffres = numero.replace(/[^\d]/g, "");
    if (chiffres.startsWith("225") && chiffres.length === 13) return `+${chiffres}`;
    if (chiffres.length === 10) return `+225${chiffres}`;
    if (numero.startsWith("+")) return numero;
    return null;
  }

  const numerosValides: string[] = [];
  const numerosInvalides: string[] = [];

  destinataires.forEach((d) => {
    const normalise = normaliserNumero(d.telephone || "");
    if (normalise) numerosValides.push(normalise);
    else numerosInvalides.push(d.telephone || "(vide)");
  });

  if (numerosValides.length === 0) {
    return NextResponse.json(
      { error: "Aucun numéro de téléphone valide parmi les destinataires." },
      { status: 400 }
    );
  }

  const endpoint =
    username === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";

  const params = new URLSearchParams();
  params.append("username", username);
  params.append("to", numerosValides.join(","));
  params.append("message", message.trim());

  try {
    const reponseAT = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        apiKey,
      },
      body: params.toString(),
    });

    const dataAT = await reponseAT.json();

    if (!reponseAT.ok) {
      return NextResponse.json(
        { error: dataAT?.error || "Erreur lors de l'envoi via Africa's Talking." },
        { status: 502 }
      );
    }

    const recipients = dataAT?.SMSMessageData?.Recipients ?? [];
    const nbEnvoyes = recipients.filter((r: any) => r.status === "Success").length;
    const nbEchecs = recipients.length - nbEnvoyes;

    return NextResponse.json({
      nbEnvoyes,
      nbEchecs,
      numerosInvalides,
      details: recipients,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur réseau lors de l'envoi SMS." },
      { status: 500 }
    );
  }
  }
      
