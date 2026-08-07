"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function FicheEnseignantPage() {
  const params = useParams();
  const enseignantId = params.id as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [identite, setIdentite] = useState<{ nom: string; prenom: string; identifiant: string; role: string } | null>(null);
  const [matricule, setMatricule] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [sexe, setSexe] = useState("");
  const [adresse, setAdresse] = useState("");
  const [dateEmbauche, setDateEmbauche] = useState("");
  const [specialite, setSpecialite] = useState("");
  const [statut, setStatut] = useState("actif");

  const [affectations, setAffectations] = useState<{ id: string; classe: string; matiere: string }[]>([]);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: profil, error: profilError } = await supabase
        .from("profiles")
        .select("nom, prenom, identifiant, role, etablissement_id")
        .eq("id", enseignantId)
        .single();
      if (profilError) throw profilError;
      setIdentite(profil);

      const { data: fiche } = await supabase
        .from("enseignants")
        .select("matricule, date_naissance, sexe, adresse, date_embauche, specialite, statut")
        .eq("id", enseignantId)
        .maybeSingle();

      if (fiche) {
        setMatricule(fiche.matricule ?? "");
        setDateNaissance(fiche.date_naissance ?? "");
        setSexe(fiche.sexe ?? "");
        setAdresse(fiche.adresse ?? "");
        setDateEmbauche(fiche.date_embauche ?? "");
        setSpecialite(fiche.specialite ?? "");
        setStatut(fiche.statut ?? "actif");
      }

      const { data: aff } = await supabase
        .from("affectations_enseignant")
        .select("id, classes(nom), matieres(nom)")
        .eq("enseignant_id", enseignantId);

      setAffectations(
        ((aff ?? []) as any[]).map((a) => {
          const cl = Array.isArray(a.classes) ? a.classes[0] : a.classes;
          const mat = Array.isArray(a.matieres) ? a.matieres[0] : a.matieres;
          return { id: a.id, classe: cl?.nom ?? "-", matiere: mat?.nom ?? "-" };
        })
      );
    } catch (e: any) {
      setError(e.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [supabase, enseignantId]);

  useEffect(() => { charger(); }, [charger]);

  async function enregistrer() {
    setError(null);
    setMessage(null);
    if (!identite) return;

    const { data: { user } } = await supabase.auth.getUser();
    const { data: chefProfile } = await supabase.from("profiles").select("etablissement_id").eq("id", user?.id).single();

    const { error: upsertError } = await supabase.from("enseignants").upsert({
      id: enseignantId,
      etablissement_id: chefProfile?.etablissement_id,
      matricule: matricule || null,
      date_naissance: dateNaissance || null,
      sexe: sexe || null,
      adresse: adresse || null,
      date_embauche: dateEmbauche || null,
      specialite: specialite || null,
      statut,
      updated_at: new Date().toISOString(),
    });

    if (upsertError) { setError(upsertError.message); return; }
    setMessage("Fiche mise à jour.");
  }

  if (loading) return <main className="p-8">Chargement...</main>;
  if (!identite) return <main className="p-8">Enseignant introuvable.</main>;

  return (
    <main className="p-6 sm:p-8 max-w-xl mx-auto pb-16 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold mb-1">{identite.prenom} {identite.nom}</h1>
        <p className="text-neutral-500 text-sm">{identite.identifiant} · {identite.role === "educateur" ? "Éducateur" : "Enseignant"}</p>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
      {message && <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">{message}</div>}

      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold">Informations</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Matricule</label>
            <input value={matricule} onChange={(e) => setMatricule(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Sexe</label>
            <select value={sexe} onChange={(e) => setSexe(e.target.value)} className="w-full border rounded-lg p-2 text-sm">
              <option value="">—</option>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Date de naissance</label>
            <input type="date" value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Date d'embauche</label>
            <input type="date" value={dateEmbauche} onChange={(e) => setDateEmbauche(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Adresse</label>
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Spécialité</label>
          <input value={specialite} onChange={(e) => setSpecialite(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Statut</label>
          <select value={statut} onChange={(e) => setStatut(e.target.value)} className="w-full border rounded-lg p-2 text-sm">
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
            <option value="suspendu">Suspendu</option>
            <option value="demissionne">Démissionné</option>
          </select>
        </div>
        <button onClick={enregistrer} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium">
          Enregistrer
        </button>
      </section>

      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold mb-3">Classes &amp; matières</h2>
        {affectations.length === 0 ? (
          <p className="text-sm text-neutral-400">Aucune affectation.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {affectations.map((a) => (
              <li key={a.id} className="bg-neutral-50 rounded-lg px-3 py-1.5">{a.classe} — {a.matiere}</li>
            ))}
          </ul>
        )}
        <a href="/chef/enseignants" className="text-xs text-blue-600 hover:underline mt-3 inline-block">
          → Gérer les affectations
        </a>
      </section>
    </main>
  );
            }
