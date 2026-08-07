"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Eleve = {
  id: string;
  matricule: string;
  statut: string;
  classe_nom: string;
  nom: string;
  prenom: string;
};

export default function ListeElevesPage() {
  const supabase = createClient();
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [recherche, setRecherche] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié.");

      const { data: profile } = await supabase
        .from("profiles")
        .select("etablissement_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profil introuvable.");

      const { data: elevesData, error: elevesError } = await supabase
        .from("eleves")
        .select("id, matricule, statut, classe_id, classes(nom)")
        .eq("etablissement_id", profile.etablissement_id);

      if (elevesError) throw elevesError;

      const eleveIds = (elevesData ?? []).map((e) => e.id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, nom, prenom")
        .in("id", eleveIds.length > 0 ? eleveIds : ["00000000-0000-0000-0000-000000000000"]);
      const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

      type RowE = { id: string; matricule: string; statut: string; classes: { nom: string } | { nom: string }[] | null };
      const liste: Eleve[] = ((elevesData ?? []) as unknown as RowE[]).map((e) => {
        const cl = Array.isArray(e.classes) ? e.classes[0] : e.classes;
        const profil = profilesMap.get(e.id);
        return {
          id: e.id,
          matricule: e.matricule,
          statut: e.statut,
          classe_nom: cl?.nom ?? "-",
          nom: profil?.nom ?? "",
          prenom: profil?.prenom ?? "",
        };
      });

      liste.sort((a, b) => a.nom.localeCompare(b.nom));
      setEleves(liste);
    } catch (e: any) {
      setError(e.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { charger(); }, [charger]);

  const filtres = eleves.filter((e) => {
    const q = recherche.toLowerCase();
    return (
      e.nom.toLowerCase().includes(q) ||
      e.prenom.toLowerCase().includes(q) ||
      e.matricule.toLowerCase().includes(q)
    );
  });

  if (loading) return <main className="p-8">Chargement...</main>;

  return (
    <main className="p-6 sm:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-3xl font-semibold">Élèves</h1>
        <Link href="/chef/eleves/nouveau" className="bg-black text-white rounded-lg px-3 py-1.5 text-sm font-medium">
          + Ajouter
        </Link>
      </div>
      <p className="text-neutral-500 mb-6">{eleves.length} élève(s)</p>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un élève..."
        className="w-full border rounded-lg p-2.5 mb-4"
      />

      <div className="space-y-2">
        {filtres.map((e) => (
          <Link
            key={e.id}
            href={`/chef/eleves/${e.id}`}
            className="block bg-white border rounded-lg p-3 hover:bg-neutral-50"
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">{e.prenom} {e.nom}</p>
                <p className="text-xs text-neutral-400">{e.matricule} · {e.classe_nom}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                e.statut === "actif" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"
              }`}>
                {e.statut}
              </span>
            </div>
          </Link>
        ))}
        {filtres.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-8">Aucun élève trouvé.</p>
        )}
      </div>
    </main>
  );
          }
