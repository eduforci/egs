"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Parent = { id: string; nom: string; prenom: string; identifiant: string; telephone: string | null };

export default function ListeParentsPage() {
  const supabase = createClient();
  const [parents, setParents] = useState<Parent[]>([]);
  const [recherche, setRecherche] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [profession, setProfession] = useState("");
  const [adresse, setAdresse] = useState("");
  const [creation, setCreation] = useState(false);
  const [resultat, setResultat] = useState<{ identifiant: string; motDePasseProvisoire: string } | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("etablissement_id").eq("id", user?.id).single();
      if (!profile) throw new Error("Profil introuvable.");

      const { data: parentsRows } = await supabase.from("parents").select("id").eq("etablissement_id", profile.etablissement_id);
      const ids = (parentsRows ?? []).map((p) => p.id);
      const { data: profils } = await supabase
        .from("profiles")
        .select("id, nom, prenom, identifiant, telephone")
        .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

      setParents((profils ?? []).sort((a, b) => a.nom.localeCompare(b.nom)));
    } catch (e: any) {
      setError(e.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { charger(); }, [charger]);

  async function creerParent(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !prenom.trim()) { setError("Nom et prénom obligatoires."); return; }
    setCreation(true);
    setError(null);
    try {
      const res = await fetch("/api/chef/creer-parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: nom.trim(), prenom: prenom.trim(), telephone, profession, adresse }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur lors de la création."); return; }
      setResultat(data);
      setNom(""); setPrenom(""); setTelephone(""); setProfession(""); setAdresse("");
      charger();
    } finally {
      setCreation(false);
    }
  }

  const filtres = parents.filter((p) => {
    const q = recherche.toLowerCase();
    return p.nom.toLowerCase().includes(q) || p.prenom.toLowerCase().includes(q);
  });

  if (loading) return <main className="p-8">Chargement...</main>;

  return (
    <main className="p-6 sm:p-8 max-w-2xl mx-auto pb-16">
      <h1 className="font-display text-3xl font-semibold mb-1">Parents</h1>
      <p className="text-neutral-500 mb-6">{parents.length} parent(s)</p>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{error}</div>}

      {resultat && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-sm">
          <p className="font-medium text-green-800 mb-2">Compte parent créé</p>
          <p>Identifiant : <strong>{resultat.identifiant}</strong></p>
          <p>Mot de passe provisoire : <strong>{resultat.motDePasseProvisoire}</strong></p>
          <p className="text-green-700 mt-2 text-xs">Notez ces informations maintenant, elles ne seront plus affichées.</p>
        </div>
      )}

      <form onSubmit={creerParent} className="bg-white border rounded-xl p-5 space-y-3 mb-6">
        <h2 className="font-semibold">Ajouter un parent</h2>
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Nom *" value={nom} onChange={(e) => setNom(e.target.value)} className="border rounded-lg p-2 text-sm" />
          <input placeholder="Prénom *" value={prenom} onChange={(e) => setPrenom(e.target.value)} className="border rounded-lg p-2 text-sm" />
          <input placeholder="Téléphone" value={telephone} onChange={(e) => setTelephone(e.target.value)} className="border rounded-lg p-2 text-sm" />
          <input placeholder="Profession" value={profession} onChange={(e) => setProfession(e.target.value)} className="border rounded-lg p-2 text-sm" />
          <input placeholder="Adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} className="border rounded-lg p-2 text-sm col-span-2" />
        </div>
        <button type="submit" disabled={creation} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
          {creation ? "Création..." : "Créer le compte parent"}
        </button>
      </form>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un parent..."
        className="w-full border rounded-lg p-2.5 mb-4"
      />

      <div className="space-y-2">
        {filtres.map((p) => (
          <a key={p.id} href={`/chef/parents/${p.id}`} className="block bg-white border rounded-lg p-3 hover:bg-neutral-50">
            <p className="font-medium">{p.prenom} {p.nom}</p>
            <p className="text-xs text-neutral-400">{p.identifiant} {p.telephone && `· ${p.telephone}`}</p>
          </a>
        ))}
        {filtres.length === 0 && <p className="text-sm text-neutral-400 text-center py-8">Aucun parent trouvé.</p>}
      </div>
    </main>
  );
               }
