"use client";

import { useState } from "react";

type Classe = {
  id: string;
  nom: string;
  niveau: string;
  annee_scolaire: string;
};

export default function NouvelEleveForm({ classes }: { classes: Classe[] }) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [classeId, setClasseId] = useState(classes[0]?.id ?? "");
  const [dateNaissance, setDateNaissance] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ matricule: string; motDePasse: string } | null>(
    null
  );
  const [copie, setCopie] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim() || !prenom.trim() || !classeId) {
      setError("Nom, prénom et classe sont obligatoires.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/eleves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim(),
          prenom: prenom.trim(),
          classe_id: classeId,
          date_naissance: dateNaissance || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Une erreur est survenue.");
        return;
      }

      setResultat({ matricule: data.matricule, motDePasse: data.motDePasse });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  function reinitialiser() {
    setNom("");
    setPrenom("");
    setDateNaissance("");
    setResultat(null);
    setError(null);
    setCopie(false);
  }

  async function copierIdentifiants() {
    const texte = `Identifiant : ${resultat?.matricule}\nMot de passe : ${resultat?.motDePasse}`;
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
    } catch {
      // Presse-papiers indisponible : rien de grave, les infos restent affichées.
    }
  }

  if (resultat) {
    return (
      <main className="p-8 max-w-lg mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">
          Élève créé avec succès
        </h1>
        <p className="text-neutral-500 mb-6 text-sm">
          ⚠️ Ce mot de passe ne sera plus jamais affiché. Note-le ou transmets-le
          maintenant à l'élève ou à ses parents.
        </p>

        <div className="bg-white border rounded-xl p-5 space-y-3 mb-4">
          <div>
            <span className="text-xs uppercase text-neutral-500">Identifiant</span>
            <p className="font-mono text-lg font-semibold">{resultat.matricule}</p>
          </div>
          <div>
            <span className="text-xs uppercase text-neutral-500">Mot de passe temporaire</span>
            <p className="font-mono text-lg font-semibold">{resultat.motDePasse}</p>
          </div>
          <p className="text-xs text-neutral-500">
            L'élève devra le changer dès sa première connexion.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={copierIdentifiants}
            className="border rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
          >
            {copie ? "Copié ✓" : "Copier les identifiants"}
          </button>
          <button
            onClick={reinitialiser}
            className="bg-black text-white rounded-lg px-4 py-2.5 text-sm font-medium"
          >
            Créer un autre élève
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">
        Créer un compte élève
      </h1>
      <p className="text-neutral-500 mb-6 text-sm">
        Un identifiant et un mot de passe temporaire seront générés automatiquement.
      </p>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nom</label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full border rounded-lg p-2.5"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Prénom</label>
          <input
            type="text"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            className="w-full border rounded-lg p-2.5"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Classe</label>
          {classes.length > 0 ? (
            <select
              value={classeId}
              onChange={(e) => setClasseId(e.target.value)}
              className="w-full border rounded-lg p-2.5"
              required
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.niveau}) — {c.annee_scolaire}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-red-600">
              Aucune classe trouvée. Crée d'abord une classe pour ton établissement.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Date de naissance <span className="text-neutral-400">(optionnel)</span>
          </label>
          <input
            type="date"
            value={dateNaissance}
            onChange={(e) => setDateNaissance(e.target.value)}
            className="w-full border rounded-lg p-2.5"
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || classes.length === 0}
          className="bg-black text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50 w-full"
        >
          {loading ? "Création..." : "Créer l'élève"}
        </button>
      </form>
    </main>
  );
      }
            
