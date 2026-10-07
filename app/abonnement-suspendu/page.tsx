"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Contenu() {
  const params = useSearchParams();
  const motif = params.get("motif");

  const titre =
    motif === "compte"
      ? "Compte bloqué"
      : motif === "expire"
      ? "Abonnement expiré"
      : "Abonnement suspendu";

  const message =
    motif === "compte"
      ? "L'accès à ce compte a été bloqué par l'administration de votre établissement. Contactez-la pour plus d'informations."
      : "L'abonnement de votre établissement à EGS est inactif. Pensez à renouveler votre abonnement pour retrouver l'accès à votre espace.";

  async function seDeconnecter() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl text-red-600">
          !
        </div>
        <h1 className="mb-2 text-2xl font-bold">{titre}</h1>
        <p className="mb-6 text-sm text-neutral-600">{message}</p>
        <button
          type="button"
          onClick={seDeconnecter}
          className="w-full rounded-lg bg-black p-3 text-sm font-medium text-white"
        >
          Se déconnecter
        </button>
      </div>
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
