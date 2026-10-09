// Outils SMS côté SERVEUR uniquement (routes app/api/sms/**).
// Ne jamais importer ce fichier dans un composant "use client".

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Seuls ces rôles peuvent envoyer des SMS au nom de l'école.
export const ROLES_SMS = ["administration", "chef", "directeur_etudes"];

export type AccesSms =
  | { ok: false; reponse: NextResponse }
  | {
      ok: true;
      userId: string;
      etablissementId: string;
      supabase: Awaited<ReturnType<typeof createServerClient>>;
      admin: ReturnType<typeof createAdminClient>;
    };

// Vérifie la connexion et le rôle. L'établissement vient TOUJOURS du profil de l'utilisateur,
// jamais de la requête : on ne peut pas envoyer de SMS pour une autre école.
export async function verifierAccesSms(): Promise<AccesSms> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, reponse: NextResponse.json({ error: "Non connecté." }, { status: 401 }) };
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();

  if (!profil || !ROLES_SMS.includes(profil.role) || !profil.etablissement_id) {
    return {
      ok: false,
      reponse: NextResponse.json(
        { error: "Vous n'êtes pas autorisé à envoyer des SMS." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    userId: user.id,
    etablissementId: profil.etablissement_id as string,
    supabase,
    admin: createAdminClient(),
  };
}

export function smsConfigure(): { username: string; apiKey: string; senderId?: string } | null {
  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  if (!username || !apiKey) return null;
  return { username, apiKey, senderId: process.env.AFRICASTALKING_SENDER_ID || undefined };
}

// Envoie UN SMS via Africa's Talking.
export async function envoyerSms(
  numero: string,
  message: string
): Promise<{ ok: boolean; erreur?: string }> {
  const conf = smsConfigure();
  if (!conf) return { ok: false, erreur: "Configuration SMS manquante." };

  const endpoint =
    conf.username === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";

  const params = new URLSearchParams();
  params.append("username", conf.username);
  params.append("to", numero);
  params.append("message", message);
  if (conf.senderId) params.append("from", conf.senderId);

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 15000);

  try {
    const reponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        apiKey: conf.apiKey,
      },
      body: params.toString(),
      signal: controleur.signal,
    });

    const texte = await reponse.text();
    let data: any = null;
    try {
      data = JSON.parse(texte);
    } catch {
      data = null;
    }

    if (!reponse.ok) {
      return { ok: false, erreur: (data?.error as string) || texte.slice(0, 120) || "Envoi refusé." };
    }

    const destinataire = data?.SMSMessageData?.Recipients?.[0];
    if (destinataire && (destinataire.status === "Success" || destinataire.statusCode === 101)) {
      return { ok: true };
    }
    return {
      ok: false,
      erreur: destinataire?.status || data?.SMSMessageData?.Message || "Envoi refusé.",
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return { ok: false, erreur: "Délai dépassé." };
    return { ok: false, erreur: e instanceof Error ? e.message : "Erreur réseau." };
  } finally {
    clearTimeout(minuteur);
  }
}

// Exécute `fn` sur les éléments par groupes (pour ne pas lancer des centaines d'envois à la fois).
export async function traiterParLots<T, R>(
  elements: T[],
  taille: number,
  fn: (element: T) => Promise<R>
): Promise<R[]> {
  const resultats: R[] = [];
  for (let i = 0; i < elements.length; i += taille) {
    const lot = elements.slice(i, i + taille);
    resultats.push(...(await Promise.all(lot.map(fn))));
  }
  return resultats;
}

// Lit une liste d'identifiants par groupes de 100 : une requête avec des centaines d'identifiants
// dépasserait la taille d'adresse acceptée.
export async function lireParLots<T = any>(
  ids: string[],
  requete: (lot: string[]) => PromiseLike<{ data: any; error: any }>
): Promise<{ lignes: T[]; erreur: string | null }> {
  const lignes: T[] = [];
  let erreur: string | null = null;
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await requete(ids.slice(i, i + 100));
    if (error) {
      erreur = error.message ?? "Erreur de lecture.";
      continue;
    }
    if (data) lignes.push(...(data as T[]));
  }
  return { lignes, erreur };
}

export type LigneHistoriqueSms = {
  etablissement_id: string;
  type: "relance" | "libre";
  eleve_id?: string | null;
  destinataire_nom?: string | null;
  telephone: string;
  message: string;
  statut: "envoye" | "echec";
  erreur?: string | null;
  envoye_par: string;
};

// Garde une trace de chaque SMS. Ne bloque jamais l'envoi : si la table n'existe pas encore,
// on ne fait qu'écrire dans les logs.
export async function enregistrerHistoriqueSms(
  admin: ReturnType<typeof createAdminClient>,
  lignes: LigneHistoriqueSms[]
): Promise<void> {
  if (lignes.length === 0) return;
  try {
    for (let i = 0; i < lignes.length; i += 200) {
      const { error } = await admin.from("sms_envoyes").insert(lignes.slice(i, i + 200));
      if (error) {
        console.error("Historique SMS non enregistré :", error.message);
        return;
      }
    }
  } catch (e) {
    console.error("Historique SMS non enregistré :", e);
  }
}
