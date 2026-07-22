"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STATUTS = ["actif", "en_attente", "suspendu", "expire"] as const;

export default function NouvelEtablissement() {
  const router = useRouter();
  const supabase = createClient();

  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [statut, setStatut] = useState<(typeof STATUTS)[number]>("en_attente");
  const [dateDebut, setDateDebut] = useState("");

  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!nom.trim()) {
      setErreur("Le nom de l'établissement est obligatoire.");
      return;
    }

    setChargement(true);

    const { error } = await supabase.from("etablissements").insert({
      nom: nom.trim(),
      ville: ville.trim() || null,
      adresse: adresse.trim() || null,
      telephone: telephone.trim() || null,
      statut,
      date_debut_abonnement: dateDebut || null,
    });

    setChargement(false);

    if (error) {
      setErreur(error.message);
      return;
    }

    router.push("/admin/dashboard");
    router.refresh();
  }

  return (
    <main className="p-8 max-w-xl">
      <h1 className="font-display text-3xl font-semibold mb-1">
        Nouvel établissement
      </h1>
      <p className="text-neutral-500 mb-6">
        Renseignez les informations pour créer un établissement.
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white border rounded-xl p-6 space-y-4"
      >
        {erreur && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">
            {erreur}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">
            Nom de l'établissement *
          </label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Ville</label>
          <input
            type="text"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Adresse</label>
          <input
            type="text"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Téléphone</label>
          <input
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Statut</label>
          <select
            value={statut}
            onChange={(e) =>
              setStatut(e.target.value as (typeof STATUTS)[number])
            }
            className="w-full border rounded-lg p-2"
          >
            {STATUTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Date de début d'abonnement
          </label>
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <button
          type="submit"
          disabled={chargement}
          className="w-full bg-black text-white rounded-lg p-3 font-medium disabled:opacity-50"
        >
          {chargement ? "Création..." : "Créer l'établissement"}
        </button>
      </form>
    </main>
  );
            }
