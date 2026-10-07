"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Coordonnées affichées aux écoles dont l'abonnement est suspendu
const NOM_CONTACT = "EGS";
const WHATSAPP = "2250575516214"; // format international, sans + ni espaces
const WHATSAPP_AFFICHE = "05 75 51 62 14";
const TELEPHONE = "0153109586";
const TELEPHONE_AFFICHE = "01 53 10 95 86";

function IconWhatsApp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.25 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29z" />
    </svg>
  );
}

function IconPhone({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function Contenu() {
  const params = useSearchParams();
  const motif = params.get("motif");
  const compteBloque = motif === "compte";

  const titre = compteBloque
    ? "Compte bloqué"
    : motif === "expire"
    ? "Abonnement expiré"
    : "Abonnement suspendu";

  const message = compteBloque
    ? "L'accès à ce compte a été bloqué par l'administration de votre établissement. Contactez-la pour plus d'informations."
    : "L'abonnement de votre établissement à EGS est inactif. Pensez à renouveler votre abonnement pour retrouver l'accès à votre espace.";

  const texteWhatsApp = encodeURIComponent(
    "Bonjour, l'abonnement de mon établissement est suspendu. Je souhaite le renouveler. Nom de l'établissement : "
  );
  const lienWhatsApp = `https://wa.me/${WHATSAPP}?text=${texteWhatsApp}`;

  async function seDeconnecter() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 pb-28">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl text-red-600">
          !
        </div>
        <h1 className="mb-2 text-2xl font-bold">{titre}</h1>
        <p className="mb-6 text-sm text-neutral-600">{message}</p>

        {!compteBloque && (
          <div className="mb-6 space-y-2">
            <a
              href={lienWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] p-3 text-sm font-medium text-white"
            >
              <IconWhatsApp className="h-5 w-5" />
              Renouveler via WhatsApp
            </a>
            <a
              href={`tel:${TELEPHONE}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium text-neutral-800"
            >
              <IconPhone className="h-4 w-4" />
              Appeler {NOM_CONTACT}
            </a>
          </div>
        )}

        <button
          type="button"
          onClick={seDeconnecter}
          className="w-full rounded-lg bg-black p-3 text-sm font-medium text-white"
        >
          Se déconnecter
        </button>

        {!compteBloque && (
          <div className="mt-6 border-t pt-4 text-xs text-neutral-500">
            <p className="font-semibold text-neutral-700">Contacter {NOM_CONTACT}</p>
            <p className="mt-1">WhatsApp : {WHATSAPP_AFFICHE}</p>
            <p>Téléphone : {TELEPHONE_AFFICHE}</p>
          </div>
        )}
      </div>

      {/* Bouton WhatsApp flottant */}
      {!compteBloque && (
        <a
          href={lienWhatsApp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contacter EGS sur WhatsApp"
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg"
        >
          <IconWhatsApp className="h-8 w-8" />
        </a>
      )}
    </main>
  );
}

export default function AbonnementSuspenduPage() {
  return (
    <Suspense fallback={null}>
      <Contenu />
    </Suspense>
  );
}
