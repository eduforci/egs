"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const STATUTS = ["actif", "en_attente", "suspendu", "expire"] as const;
const TYPES = [
  { value: "maternelle", label: "Maternelle" },
  { value: "primaire", label: "Primaire" },
  { value: "college", label: "Collège" },
  { value: "lycee", label: "Lycée" },
  { value: "college_lycee", label: "Collège-Lycée" },
] as const;
const SYSTEMES = [{ value: "ivoirien", label: "Ivoirien" }];

export default function NouvelEtablissement() {
  const supabase = createClient();

  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [statut, setStatut] = useState<(typeof STATUTS)[number]>("en_attente");
  const [dateDebut, setDateDebut] = useState("");
  const [typeEtablissement, setTypeEtablissement] = useState<(typeof TYPES)[number]["value"]>("college");
  const [systeme, setSysteme] = useState("ivoirien");
  const [anneeScolaire, setAnneeScolaire] = useState("2025-2026");

  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ classes: number; matieres: number } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!nom.trim()) {
      setErreur("Le nom de l'établissement est obligatoire.");
      return;
    }

    setChargement(true);

    const { data: nouvelEtab, error } = await supabase
      .from("etablissements")
      .insert({
        nom: nom.trim(),
        ville: ville.trim() || null,
        adresse: adresse.trim() || null,
        telephone: telephone.trim() || null,
        statut,
        date_debut_abonnement: dateDebut || null,
        type_etablissement: typeEtablissement,
        systeme_enseignement: systeme,
        annee_scolaire_active: anneeScolaire,
      })
      .select("id")
      .single();

    if (error || !nouvelEtab) {
      setErreur(error?.message || "Erreur lors de la création.");
      setChargement(false);
      return;
    }

    // Initialisation automatique : classes + matières générées à partir
    // du programme correspondant.
    const { data: initData, error: initError } = await supabase.rpc(
      "initialiser_etablissement",
      { p_etablissement_id: nouvelEtab.id }
    );

    setChargement(false);

    if (initError) {
      setErreur(
        `Établissement créé, mais l'initialisation automatique a échoué : ${initError.message}. Tu peux réessayer depuis la fiche de l'établissement.`
      );
      return;
    }

    setResultat({
      classes: initData?.classes_creees ?? 0,
      matieres: initData?.matieres_creees ?? 0,
    });
  }

  if (resultat) {
    return (
      <main className="p-6 sm:p-8 max-w-lg">
        <h1 className="font-display text-2xl font-semibold mb-1">
          Établissement créé et initialisé
        </h1>
        <p className="text-neutral-500 mb-6 text-sm">
          Le moteur d'initialisation a préparé la structure de base.
        </p>

        <div className="bg-white border rounded-xl p-5 space-y-2 mb-4">
          <p><span className="font-medium">{resultat.classes}</span> classe(s) créée(s)</p>
          <p><span className="font-medium">{resultat.matieres}</span> matière(s) créée(s), avec coefficients</p>
        </div>

        <p className="text-sm text-neutral-500 mb-4">
          Le chef d'établissement n'a plus qu'à ajouter les enseignants et les élèves.
        </p>

        <div className="flex gap-3">
          <Link href="/admin/etablissements" className="bg-black text-white rounded-lg px-4 py-2.5 text-sm font-medium">
            Voir les établissements
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 sm:p-8 max-w-xl">
      <h1 className="font-display text-3xl font-semibold mb-1">
        Nouvel établissement
      </h1>
      <p className="text-neutral-500 mb-6">
        Renseignez les informations. Les classes et matières seront créées automatiquement selon le type et le système choisis.
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Type d'établissement *</label>
            <select
              value={typeEtablissement}
              onChange={(e) => setTypeEtablissement(e.target.value as any)}
              className="w-full border rounded-lg p-2"
              required
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Système d'enseignement *</label>
            <select
              value={systeme}
              onChange={(e) => setSysteme(e.target.value)}
              className="w-full border rounded-lg p-2"
              required
            >
              {SYSTEMES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Année scolaire</label>
          <input
            type="text"
            value={anneeScolaire}
            onChange={(e) => setAnneeScolaire(e.target.value)}
            placeholder="2025-2026"
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
            onChange={(e) => setStatut(e.target.value as (typeof STATUTS)[number])}
            className="w-full border rounded-lg p-2"
          >
            {STATUTS.map((s) => (
              <option key={s} value={s}>{s}</option>
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
          {chargement ? "Création et initialisation..." : "Créer et initialiser l'établissement"}
        </button>
      </form>
    </main>
  );
      }
        
