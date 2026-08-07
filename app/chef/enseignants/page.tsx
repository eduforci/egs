"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export default function GestionEnseignants() {
  const supabase = createClient();
  const [enseignants, setEnseignants] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [matieres, setMatieres] = useState<any[]>([]);
  const [classesMatieres, setClassesMatieres] = useState<{ classe_id: string; matiere_id: string }[]>([]);
  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [nouvelleClasse, setNouvelleClasse] = useState<Record<string, string>>({});
  const [nouvelleMatiere, setNouvelleMatiere] = useState<Record<string, string>>({});

  function matieresPourClasse(classeId: string) {
    if (!classeId) return [];
    const idsAutorises = new Set(
      classesMatieres.filter((cm) => cm.classe_id === classeId).map((cm) => cm.matiere_id)
    );
    return matieres.filter((m) => idsAutorises.has(m.id));
  }

  const charger = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: chefProfile } = await supabase
      .from("profiles")
      .select("etablissement_id")
      .eq("id", user?.id)
      .single();

    if (!chefProfile?.etablissement_id) {
      setChargement(false);
      return;
    }

    setEtablissementId(chefProfile.etablissement_id);

    const { data: profs } = await supabase
      .from("profiles")
      .select("id, nom, prenom, identifiant, role")
      .eq("etablissement_id", chefProfile.etablissement_id)
      .in("role", ["enseignant", "educateur"])
      .order("nom");

    const { data: c } = await supabase
      .from("classes")
      .select("id, nom")
      .eq("etablissement_id", chefProfile.etablissement_id)
      .order("nom");

    const { data: m } = await supabase
      .from("matieres")
      .select("id, nom")
      .eq("etablissement_id", chefProfile.etablissement_id)
      .order("nom");

    const classeIds = (c ?? []).map((classe) => classe.id);
    const { data: cm } = await supabase
      .from("classes_matieres")
      .select("classe_id, matiere_id")
      .in("classe_id", classeIds.length > 0 ? classeIds : ["00000000-0000-0000-0000-000000000000"]);

    setClassesMatieres(cm ?? []);

    const profIds = (profs ?? []).map((p) => p.id);
    const { data: affectations } = await supabase
      .from("affectations_enseignant")
      .select("id, enseignant_id, classes ( id, nom ), matieres ( id, nom )")
      .in("enseignant_id", profIds.length > 0 ? profIds : ["00000000-0000-0000-0000-000000000000"]);

    const profsAvecAffectations = (profs ?? []).map((p) => ({
      ...p,
      affectations: (affectations ?? []).filter((a: any) => a.enseignant_id === p.id),
    }));

    setEnseignants(profsAvecAffectations);
    setClasses(c ?? []);
    setMatieres(m ?? []);
    setChargement(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouterAffectation(enseignantId: string) {
    const classeId = nouvelleClasse[enseignantId];
    const matiereId = nouvelleMatiere[enseignantId];
    if (!classeId || !matiereId) {
      setErreur("Choisissez une classe et une matière.");
      return;
    }
    setErreur(null);

    const { error } = await supabase.from("affectations_enseignant").insert({
      enseignant_id: enseignantId,
      classe_id: classeId,
      matiere_id: matiereId,
    });

    if (error) {
      setErreur(error.message.includes("duplicate") ? "Cette affectation existe déjà." : error.message);
      return;
    }

    setNouvelleClasse((p) => ({ ...p, [enseignantId]: "" }));
    setNouvelleMatiere((p) => ({ ...p, [enseignantId]: "" }));
    charger();
  }

  async function retirerAffectation(affectationId: string) {
    const confirmation = window.confirm("Retirer cette affectation ?");
    if (!confirmation) return;

    const { error } = await supabase.from("affectations_enseignant").delete().eq("id", affectationId);
    if (error) {
      setErreur(error.message);
      return;
    }
    charger();
  }

  if (chargement) {
    return <main className="p-8">Chargement...</main>;
  }

  return (
    <main className="p-6 sm:p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-3xl font-semibold mb-1">Enseignants &amp; éducateurs</h1>
      <p className="text-neutral-500 mb-6">
        {enseignants.length} compte(s) — gérez leurs classes et matières
      </p>

      {erreur && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{erreur}</div>
      )}

      {enseignants.length === 0 && (
        <p className="text-neutral-500 text-sm">Aucun enseignant ou éducateur créé pour le moment.</p>
      )}

      <div className="space-y-4">
        {enseignants.map((ens) => (
          <div key={ens.id} className="bg-white border rounded-xl p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display text-lg font-semibold">
                {ens.prenom} {ens.nom}
              </h2>
              <span className="text-xs text-neutral-400">
                {ens.identifiant} · {ens.role === "educateur" ? "Éducateur" : "Enseignant"}
                {" · "}
                <a href={`/chef/enseignants/${ens.id}`} className="text-blue-600 hover:underline">
                  Détails
                </a>
              </span>
            </div>

            {ens.affectations.length > 0 ? (
              <ul className="space-y-1 mb-3 text-sm">
                {ens.affectations.map((a: any) => (
                  <li key={a.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-1.5">
                    <span>{a.classes?.nom} — {a.matieres?.nom}</span>
                    <button
                      onClick={() => retirerAffectation(a.id)}
                      className="text-red-600 text-xs hover:underline"
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-400 mb-3">Aucune classe affectée.</p>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={nouvelleClasse[ens.id] ?? ""}
                onChange={(e) => {
                  const classeId = e.target.value;
                  setNouvelleClasse((p) => ({ ...p, [ens.id]: classeId }));
                  setNouvelleMatiere((p) => ({ ...p, [ens.id]: "" }));
                }}
                className="border rounded-lg p-1.5 text-sm"
              >
                <option value="">Classe...</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
              <select
                value={nouvelleMatiere[ens.id] ?? ""}
                onChange={(e) => setNouvelleMatiere((p) => ({ ...p, [ens.id]: e.target.value }))}
                disabled={!nouvelleClasse[ens.id]}
                className="border rounded-lg p-1.5 text-sm disabled:opacity-50"
              >
                <option value="">
                  {nouvelleClasse[ens.id] ? "Matière..." : "Choisir une classe d'abord"}
                </option>
                {matieresPourClasse(nouvelleClasse[ens.id] ?? "").map((m) => (
                  <option key={m.id} value={m.id}>{m.nom}</option>
                ))}
              </select>
              <button
                onClick={() => ajouterAffectation(ens.id)}
                className="bg-black text-white rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                + Ajouter
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
                              }
              
