"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ChefDashboard() {
  const supabase = createClient();
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [classeId, setClasseId] = useState("");
  const [matiereId, setMatiereId] = useState("");
  const [classes, setClasses] = useState<any[]>([]);
  const [matieres, setMatieres] = useState<any[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ identifiant: string; motDePasseProvisoire: string } | null>(null);

  useEffect(() => {
    async function charger() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("etablissement_id")
        .eq("id", user?.id)
        .single();

      if (profile?.etablissement_id) {
        const { data: c } = await supabase
          .from("classes")
          .select("id, nom")
          .eq("etablissement_id", profile.etablissement_id);
        const { data: m } = await supabase
          .from("matieres")
          .select("id, nom")
          .eq("etablissement_id", profile.etablissement_id);
        setClasses(c ?? []);
        setMatieres(m ?? []);
      }
    }
    charger();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);
    setResultat(null);

    const res = await fetch("/api/chef/creer-enseignant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, prenom, classeId, matiereId }),
    });

    const data = await res.json();
    setChargement(false);

    if (!res.ok) {
      setErreur(data.error || "Erreur lors de la création.");
      return;
    }

    setResultat(data);
    setNom("");
    setPrenom("");
    setClasseId("");
    setMatiereId("");
  }

  return (
    <main className="p-6 sm:p-8 max-w-lg mx-auto">
      <h1 className="font-display text-3xl font-semibold mb-1">Ajouter un enseignant</h1>
      <p className="text-neutral-500 mb-6">
        Créez le compte, puis transmettez l'identifiant et le mot de passe provisoire à l'enseignant.
      </p>

      {resultat && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-sm">
          <p className="font-medium text-green-800 mb-2">Compte créé avec succès</p>
          <p>Identifiant : <strong>{resultat.identifiant}</strong></p>
          <p>Mot de passe provisoire : <strong>{resultat.motDePasseProvisoire}</strong></p>
          <p className="text-green-700 mt-2 text-xs">
            Notez ces informations maintenant, elles ne seront plus affichées.
          </p>
        </div>
      )}
<a href="/chef/enseignants" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
  → Voir et gérer tous les enseignants
</a>
      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-4">
        {erreur && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{erreur}</div>}

        <div>
          <label className="block text-sm font-medium mb-1">Nom *</label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} required className="w-full border rounded-lg p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Prénom *</label>
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required className="w-full border rounded-lg p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Classe (optionnel)</label>
          <select value={classeId} onChange={(e) => setClasseId(e.target.value)} className="w-full border rounded-lg p-2">
            <option value="">— Aucune —</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Matière (optionnel)</label>
          <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)} className="w-full border rounded-lg p-2">
            <option value="">— Aucune —</option>
            {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        </div>

        <button type="submit" disabled={chargement} className="w-full bg-black text-white rounded-lg p-3 font-medium disabled:opacity-50">
          {chargement ? "Création..." : "Créer le compte enseignant"}
        </button>
      </form>
    </main>
  );
            }
