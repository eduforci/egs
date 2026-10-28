"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEspace } from "@/lib/use-espace";

type Eleve = {
  id: string;
  matricule: string | null;
  statut: string;
  classe_nom: string;
  cycle: string | null;
  niveau: string | null;
  type_enseignement: string | null;
  nom: string;
  prenom: string;
  photo_url: string | null;
};

export default function ListeElevesPage() {
  const supabase = createClient();
  const { classeVisible } = useEspace();
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [recherche, setRecherche] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anneeChoisie, setAnneeChoisie] = useState("");
  const [annees, setAnnees] = useState<any[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Non authentifié.");

        const { data: profile } = await supabase.from("profiles").select("etablissement_id").eq("id", user.id).single();
        if (!profile?.etablissement_id) throw new Error("Pas d'établissement");

        const { data: anneesData } = await supabase.from("annees_scolaires").select("libelle, active").eq("etablissement_id", profile.etablissement_id).order("libelle", { ascending: false });
        setAnnees(anneesData ?? []);
        const active = anneesData?.find((a:any) => a.active)?.libelle || anneesData?.[0]?.libelle || "";
        const anneeFinale = anneeChoisie || active;
        setAnneeChoisie(anneeFinale);
        if(!anneeFinale) { setLoading(false); return; }

        // On charge les élèves directement - sans se compliquer avec inscriptions
        const { data: elevesData, error } = await supabase
          .from("eleves")
          .select("id, matricule, statut, photo_url, classe_id, nom, prenom, classes(nom, cycle, niveau, type_enseignement)")
          .eq("etablissement_id", profile.etablissement_id);

        if (error) throw error;

        const liste = (elevesData ?? []).map((e:any) => {
          const cl = Array.isArray(e.classes) ? e.classes[0] : e.classes;
          return {
            id: e.id,
            matricule: e.matricule,
            statut: e.statut,
            photo_url: e.photo_url,
            classe_nom: cl?.nom ?? "-",
            cycle: cl?.cycle ?? null,
            niveau: cl?.niveau ?? null,
            type_enseignement: cl?.type_enseignement ?? null,
            nom: e.nom,
            prenom: e.prenom,
          };
        });

        setEleves(liste);
      } catch (e:any) {
        console.error(e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [anneeChoisie]); // se relance quand tu changes d'année

  const elevesDeLEspace = eleves.filter((e) => classeVisible(e.cycle, e.type_enseignement, e.niveau));
  const filtres = elevesDeLEspace.filter((e) => {
    const q = recherche.toLowerCase();
    return e.nom.toLowerCase().includes(q) || e.prenom.toLowerCase().includes(q) || (e.matricule || "").toLowerCase().includes(q);
  });

  return (
    <main className="p-6 sm:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-3xl font-semibold">Élèves</h1>
        <div className="flex gap-2">
          <Link href="/chef/eleves/import" className="border border-black rounded-lg px-3 py-1.5 text-sm">Importer</Link>
          <Link href="/chef/eleves/nouveau" className="bg-black text-white rounded-lg px-3 py-1.5 text-sm">+ Ajouter</Link>
        </div>
      </div>

      <select value={anneeChoisie} onChange={(e) => setAnneeChoisie(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm mb-4">
        {annees.map((a) => <option key={a.libelle} value={a.libelle}>{a.libelle}{a.active ? " (active)" : ""}</option>)}
      </select>

      <p className="text-neutral-500 mb-4">{elevesDeLEspace.length} élève(s)</p>
      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{error}</div>}
      <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher..." className="w-full border rounded-lg p-2.5 mb-4" />

      {loading ? <p className="text-center py-8 text-neutral-400">Chargement...</p> : (
        <div className="space-y-2">
          {filtres.map((e) => (
            <Link key={e.id} href={`/chef/eleves/${e.id}`} className="block bg-white border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {e.photo_url ? <img src={e.photo_url} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-xs">{e.prenom[0]}{e.nom[0]}</div>}
                  <div><p className="font-medium">{e.prenom} {e.nom}</p><p className="text-xs text-neutral-400">{e.matricule} · {e.classe_nom}</p></div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">{e.statut}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}