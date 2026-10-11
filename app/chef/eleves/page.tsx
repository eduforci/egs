"use client";

import { useEffect, useState, useCallback } from "react";
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
};

type AnneeOption = {
  libelle: string;
  active: boolean;
};

export default function ListeElevesPage() {
  const supabase = createClient();
  const { classeVisible } = useEspace();
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [recherche, setRecherche] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [annees, setAnnees] = useState<AnneeOption[]>([]);
  const [anneeChoisie, setAnneeChoisie] = useState<string>("");

  const chargerAnnees = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Non authentifié.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("etablissement_id")
      .eq("id", user.id)
      .single();

    if (!profile) throw new Error("Profil introuvable.");
    setEtablissementId(profile.etablissement_id);

    const { data: anneesData } = await supabase
      .from("annees_scolaires")
      .select("libelle, active")
      .eq("etablissement_id", profile.etablissement_id)
      .order("libelle", { ascending: false });

    const liste = anneesData ?? [];
    setAnnees(liste);

    const anneeActive = liste.find((a) => a.active);
    setAnneeChoisie(anneeActive?.libelle ?? liste[0]?.libelle ?? "");
  }, [supabase]);

  useEffect(() => {
    chargerAnnees().catch((e) => setError(e.message || "Erreur lors du chargement des années"));
  }, [chargerAnnees]);

  const estAnneeActive = annees.find((a) => a.libelle === anneeChoisie)?.active ?? false;

  const charger = useCallback(async () => {
    if (!etablissementId || !anneeChoisie) return;
    setLoading(true);
    setError(null);
    try {
      if (estAnneeActive) {
        // Année active : source de vérité = eleves.classe_id (situation actuelle)
        // On demande aussi le cycle et le type d'enseignement (espaces de travail) ;
        // si le script SQL n'est pas installé, on retombe sur la lecture d'avant.
        let reponseEleves: any = await supabase
          .from("eleves")
          .select("id, matricule, statut, classe_id, classes(nom, cycle, niveau, type_enseignement)")
          .eq("etablissement_id", etablissementId);
        if (reponseEleves.error) {
          reponseEleves = await supabase
            .from("eleves")
            .select("id, matricule, statut, classe_id, classes(nom, cycle, niveau)")
            .eq("etablissement_id", etablissementId);
        }
        const { data: elevesData, error: elevesError } = reponseEleves;

        if (elevesError) throw elevesError;

        const eleveIds = (elevesData ?? []).map((e: any) => e.id);
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, nom, prenom")
          .in("id", eleveIds.length > 0 ? eleveIds : ["00000000-0000-0000-0000-000000000000"]);
        const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

        type InfoClasse = { nom: string; cycle?: string | null; niveau?: string | null; type_enseignement?: string | null };
        type RowE = { id: string; matricule: string | null; statut: string; classes: InfoClasse | InfoClasse[] | null };
        const liste: Eleve[] = ((elevesData ?? []) as unknown as RowE[]).map((e) => {
          const cl = Array.isArray(e.classes) ? e.classes[0] : e.classes;
          const profil = profilesMap.get(e.id);
          return {
            id: e.id,
            matricule: e.matricule,
            statut: e.statut,
            classe_nom: cl?.nom ?? "-",
            cycle: cl?.cycle ?? null,
            niveau: cl?.niveau ?? null,
            type_enseignement: cl?.type_enseignement ?? null,
            nom: profil?.nom ?? "",
            prenom: profil?.prenom ?? "",
          };
        });

        liste.sort((a, b) => a.nom.localeCompare(b.nom));
        setEleves(liste);
      } else {
        // Année archivée : source de vérité = inscriptions (historique)
        let reponseClasses: any = await supabase
          .from("classes")
          .select("id, nom, cycle, niveau, type_enseignement")
          .eq("etablissement_id", etablissementId)
          .eq("annee_scolaire", anneeChoisie);
        if (reponseClasses.error) {
          reponseClasses = await supabase
            .from("classes")
            .select("id, nom, cycle, niveau")
            .eq("etablissement_id", etablissementId)
            .eq("annee_scolaire", anneeChoisie);
        }
        const classesAnnee: any[] = reponseClasses.data ?? [];

        const classesMap = new Map(classesAnnee.map((c: any) => [c.id, c.nom]));
        const classesInfo = new Map(classesAnnee.map((c: any) => [c.id, c]));
        const classeIds = (classesAnnee ?? []).map((c) => c.id);

        const { data: inscrData, error: inscrError } = classeIds.length > 0
          ? await supabase
              .from("inscriptions")
              .select("eleve_id, classe_id")
              .eq("annee_scolaire", anneeChoisie)
              .in("classe_id", classeIds)
          : { data: [], error: null };

        if (inscrError) throw inscrError;

        const eleveIds = [...new Set((inscrData ?? []).map((i) => i.eleve_id))];

        const { data: elevesData } = eleveIds.length > 0
          ? await supabase.from("eleves").select("id, matricule, statut, nom, prenom").in("id", eleveIds)
          : { data: [] };
        const elevesMap = new Map((elevesData ?? []).map((e) => [e.id, e]));

        const liste: Eleve[] = (inscrData ?? []).map((i) => {
          const e = elevesMap.get(i.eleve_id);
          return {
            id: i.eleve_id,
            matricule: e?.matricule ?? null,
            statut: e?.statut ?? "-",
            classe_nom: classesMap.get(i.classe_id) ?? "-",
            cycle: (classesInfo.get(i.classe_id) as any)?.cycle ?? null,
            niveau: (classesInfo.get(i.classe_id) as any)?.niveau ?? null,
            type_enseignement: (classesInfo.get(i.classe_id) as any)?.type_enseignement ?? null,
            nom: e?.nom ?? "",
            prenom: e?.prenom ?? "",
          };
        });

        liste.sort((a, b) => a.nom.localeCompare(b.nom));
        setEleves(liste);
      }
    } catch (e: any) {
      setError(e.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [supabase, etablissementId, anneeChoisie, estAnneeActive]);

  useEffect(() => {
  chargerAnnees().catch((e) => {
    setError(e.message || "Erreur lors du chargement des années");
    setLoading(false);
  });
}, [chargerAnnees]);

  const elevesDeLEspace = eleves.filter((e) => classeVisible(e.cycle, e.type_enseignement, e.niveau));

  const filtres = elevesDeLEspace.filter((e) => {
    const q = recherche.toLowerCase();
    return (
      (e.nom || "").toLowerCase().includes(q) ||
      (e.prenom || "").toLowerCase().includes(q) ||
      (e.matricule || "").toLowerCase().includes(q)
    );
  });

  if (loading && annees.length === 0) return <main className="p-8">Chargement...</main>;

  return (
    <main className="p-6 sm:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-3xl font-semibold">Élèves</h1>
        {estAnneeActive && (
          <div className="flex gap-2">
            <Link href="/chef/eleves/import" className="border border-black text-black rounded-lg px-3 py-1.5 text-sm font-medium">
              Importer
            </Link>
            <Link href="/chef/eleves/nouveau" className="bg-black text-white rounded-lg px-3 py-1.5 text-sm font-medium">
              + Ajouter
            </Link>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <select
          value={anneeChoisie}
          onChange={(e) => setAnneeChoisie(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm"
        >
          {annees.map((a) => (
            <option key={a.libelle} value={a.libelle}>
              {a.libelle}{a.active ? " (active)" : ""}
            </option>
          ))}
        </select>
        {!estAnneeActive && (
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-1">
            Archive — lecture seule
          </span>
        )}
      </div>

      <p className="text-neutral-500 mb-6">{elevesDeLEspace.length} élève(s)</p>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un élève..."
        className="w-full border rounded-lg p-2.5 mb-4"
      />

      {loading ? (
        <p className="text-sm text-neutral-400 text-center py-8">Chargement...</p>
      ) : (
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
                  <p className="text-xs text-neutral-400">{e.matricule ?? "Sans matricule"} · {e.classe_nom}</p>
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
      )}
    </main>
  );
          }

                    
