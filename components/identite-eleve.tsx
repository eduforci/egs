"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function IdentiteEleve({ eleveId }: { eleveId: string }) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("nom, prenom")
      .eq("id", eleveId)
      .single()
      .then(({ data }) => {
        setNom(data?.nom ?? "");
        setPrenom(data?.prenom ?? "");
      });
  }, [eleveId]);

  async function enregistrer() {
    setChargement(true);
    setErreur(null);
    setInfo(null);
    try {
      const res = await fetch("/api/chef/modifier-identite-eleve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eleveId, nom, prenom }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error || "Erreur.");
        return;
      }
      setInfo("Nom enregistré.");
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setErreur("Connexion impossible. Réessayez.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <section className="bg-white border rounded-xl p-5 space-y-3">
      <h2 className="font-semibold">Identité de l'élève</h2>
      {erreur && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{erreur}</div>}
      {info && <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">{info}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Nom</label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Prénom</label>
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
        </div>
      </div>
      <button
        type="button"
        onClick={enregistrer}
        disabled={chargement}
        className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {chargement ? "Enregistrement..." : "Enregistrer le nom"}
      </button>
    </section>
  );
}
