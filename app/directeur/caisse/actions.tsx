"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReglesAlerte } from "@/lib/alertes-caisse";

async function appeler(corps: Record<string, unknown>): Promise<string | null> {
  try {
    const reponse = await fetch("/api/alertes-caisse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    const data = await reponse.json().catch(() => ({}));
    if (!reponse.ok) return (data?.error as string) || "Une erreur est survenue.";
    return null;
  } catch {
    return "Connexion impossible. Réessayez.";
  }
}

// Accorder ou refuser une dépense qui attend la décision du promoteur.
export function BoutonsValidation({ depenseId }: { depenseId: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function decider(action: "accorder" | "refuser") {
    let motif = "";
    if (action === "refuser") {
      const saisie = window.prompt("Motif du refus (facultatif) :");
      if (saisie === null) return;
      motif = saisie;
    }
    setEnCours(true);
    setErreur(null);
    const retour = await appeler({ action, depenseId, motif });
    setEnCours(false);
    if (retour) {
      setErreur(retour);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      <div className="flex gap-3">
        <button
          type="button"
          disabled={enCours}
          onClick={() => decider("refuser")}
          className="h-12 flex-1 rounded-xl border border-red-300 bg-white text-sm font-semibold text-red-800 disabled:opacity-50"
        >
          Refuser
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={() => decider("accorder")}
          className="h-12 flex-1 rounded-xl bg-emerald-700 text-sm font-semibold text-white disabled:opacity-50"
        >
          Accorder
        </button>
      </div>
      {erreur && <p className="mt-2 text-sm text-red-700">{erreur}</p>}
    </div>
  );
}

export function BoutonToutLire() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  async function toutLire() {
    setEnCours(true);
    await appeler({ action: "tout_lire" });
    setEnCours(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={enCours}
      onClick={toutLire}
      className="h-11 rounded-lg border px-3 text-sm font-medium text-neutral-700 disabled:opacity-50"
    >
      Tout marquer comme lu
    </button>
  );
}

// Formulaire des seuils et des options.
export function FormReglages({ valeurs }: { valeurs: ReglesAlerte }) {
  const router = useRouter();
  const [seuilSortie, setSeuilSortie] = useState(String(valeurs.seuil_sortie));
  const [seuilJustificatif, setSeuilJustificatif] = useState(String(valeurs.seuil_justificatif));
  const [seuilValidation, setSeuilValidation] = useState(
    valeurs.seuil_validation === null ? "" : String(valeurs.seuil_validation)
  );
  const [sansJustificatif, setSansJustificatif] = useState(valeurs.alerte_sans_justificatif);
  const [ecartCloture, setEcartCloture] = useState(valeurs.alerte_ecart_cloture);
  const [modification, setModification] = useState(valeurs.alerte_modification);
  const [sms, setSms] = useState(valeurs.envoyer_sms);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  async function enregistrer() {
    setEnCours(true);
    setMessage(null);
    const retour = await appeler({
      action: "reglages",
      seuil_sortie: Number(seuilSortie),
      seuil_justificatif: Number(seuilJustificatif),
      seuil_validation: seuilValidation.trim() === "" ? null : Number(seuilValidation),
      alerte_sans_justificatif: sansJustificatif,
      alerte_ecart_cloture: ecartCloture,
      alerte_modification: modification,
      envoyer_sms: sms,
    });
    setEnCours(false);
    if (retour) {
      setMessage({ ok: false, texte: retour });
      return;
    }
    setMessage({ ok: true, texte: "Réglages enregistrés." });
    router.refresh();
  }

  const champ = "h-12 w-full rounded-xl border bg-white px-3 text-base";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="seuil-sortie" className="mb-1 block text-sm font-semibold">
          Alerter à partir d'une sortie de (FCFA)
        </label>
        <input
          id="seuil-sortie"
          type="number"
          inputMode="numeric"
          min={0}
          value={seuilSortie}
          onChange={(e) => setSeuilSortie(e.target.value)}
          className={champ}
        />
      </div>

      <div>
        <label htmlFor="seuil-justificatif" className="mb-1 block text-sm font-semibold">
          Alerter pour une dépense sans justificatif à partir de (FCFA)
        </label>
        <input
          id="seuil-justificatif"
          type="number"
          inputMode="numeric"
          min={0}
          value={seuilJustificatif}
          onChange={(e) => setSeuilJustificatif(e.target.value)}
          className={champ}
        />
      </div>

      <div>
        <label htmlFor="seuil-validation" className="mb-1 block text-sm font-semibold">
          Exiger mon accord à partir de (FCFA)
        </label>
        <input
          id="seuil-validation"
          type="number"
          inputMode="numeric"
          min={0}
          value={seuilValidation}
          placeholder="Laissez vide pour ne rien exiger"
          onChange={(e) => setSeuilValidation(e.target.value)}
          className={champ}
        />
        <p className="mt-1 text-xs text-neutral-500">
          Au-dessus de ce montant, le comptable ne peut plus valider une dépense seul : elle apparaît dans « À valider ».
        </p>
      </div>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-semibold">Signaler aussi</legend>
        {[
          { id: "o-justif", label: "Les dépenses sans justificatif", v: sansJustificatif, set: setSansJustificatif },
          { id: "o-ecart", label: "Les écarts à la clôture de la caisse", v: ecartCloture, set: setEcartCloture },
          { id: "o-modif", label: "Les modifications et suppressions", v: modification, set: setModification },
          { id: "o-sms", label: "Envoyer les alertes par SMS", v: sms, set: setSms },
        ].map((o) => (
          <label key={o.id} htmlFor={o.id} className="flex min-h-[44px] items-center gap-3 text-sm">
            <input
              id={o.id}
              type="checkbox"
              checked={o.v}
              onChange={(e) => o.set(e.target.checked)}
              className="h-5 w-5"
            />
            {o.label}
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        disabled={enCours}
        onClick={enregistrer}
        className="h-12 w-full rounded-xl bg-black text-base font-semibold text-white disabled:opacity-50"
      >
        {enCours ? "Enregistrement..." : "Enregistrer les réglages"}
      </button>

      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.texte}</p>
      )}
    </div>
  );
}
