"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type EnfantLie = {
  eleve_id: string;
  lien_parente: string | null;
  responsable_financier: boolean;
  contact_principal: boolean;
  nom: string;
  prenom: string;
  matricule: string;
};

export default function FicheParentPage() {
  const params = useParams();
  const parentId = params.id as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [identite, setIdentite] = useState<{ nom: string; prenom: string; identifiant: string; telephone: string | null } | null>(null);
  const [profession, setProfession] = useState("");
  const [adresse, setAdresse] = useState("");

  const [enfants, setEnfants] = useState<EnfantLie[]>([]);
  const [elevesDisponibles, setElevesDisponibles] = useState<{ id: string; nom: string; prenom: string; matricule: string }[]>([]);
  const [eleveChoisi, setEleveChoisi] = useState("");
  const [lienChoisi, setLienChoisi] = useState("");
  const [filtreEleve, setFiltreEleve] = useState("");

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: profil, error: profilError } = await supabase
        .from("profiles")
        .select("nom, prenom, identifiant, telephone, etablissement_id")
        .eq("id", parentId)
        .single();
      if (profilError) throw profilError;
      setIdentite(profil);

      const { data: fiche } = await supabase
        .from("parents")
        .select("profession, adresse")
        .eq("id", parentId)
        .maybeSingle();
      if (fiche) {
        setProfession(fiche.profession ?? "");
        setAdresse(fiche.adresse ?? "");
      }

      const { data: liaisons } = await supabase
        .from("parents_eleves")
        .select("eleve_id, lien_parente, responsable_financier, contact_principal")
        .eq("parent_id", parentId);

      const eleveIds = (liaisons ?? []).map((l) => l.eleve_id);
      const { data: elevesData } = await supabase
        .from("eleves")
        .select("id, matricule")
        .in("id", eleveIds.length > 0 ? eleveIds : ["00000000-0000-0000-0000-000000000000"]);
      const { data: profilsEleves } = await supabase
        .from("profiles")
        .select("id, nom, prenom")
        .in("id", eleveIds.length > 0 ? eleveIds : ["00000000-0000-0000-0000-000000000000"]);

      const matriculeMap = new Map((elevesData ?? []).map((e) => [e.id, e.matricule]));
      const profilMap = new Map((profilsEleves ?? []).map((p) => [p.id, p]));

      setEnfants(
        (liaisons ?? []).map((l) => {
          const p = profilMap.get(l.eleve_id);
          return {
            ...l,
            nom: p?.nom ?? "Inconnu",
            prenom: p?.prenom ?? "",
            matricule: matriculeMap.get(l.eleve_id) ?? "",
          };
        })
      );

      const { data: tousEleves } = await supabase
        .from("eleves")
        .select("id, matricule")
        .eq("etablissement_id", profil.etablissement_id);
      const idsTous = (tousEleves ?? []).map((e) => e.id);
      const { data: profilsTous } = await supabase
        .from("profiles")
        .select("id, nom, prenom")
        .in("id", idsTous.length > 0 ? idsTous : ["00000000-0000-0000-0000-000000000000"]);
      const profilTousMap = new Map((profilsTous ?? []).map((p) => [p.id, p]));

      setElevesDisponibles(
        (tousEleves ?? []).map((e) => {
          const p = profilTousMap.get(e.id);
          return { id: e.id, matricule: e.matricule, nom: p?.nom ?? "", prenom: p?.prenom ?? "" };
        }).sort((a, b) => a.nom.localeCompare(b.nom))
      );
    } catch (e: any) {
      setError(e.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [supabase, parentId]);

  useEffect(() => { charger(); }, [charger]);

  async function enregistrer() {
    setError(null);
    setMessage(null);
    if (!identite) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: chefProfile } = await supabase.from("profiles").select("etablissement_id").eq("id", user?.id).single();

    const { error: upsertError } = await supabase.from("parents").upsert({
      id: parentId,
      etablissement_id: chefProfile?.etablissement_id,
      profession: profession || null,
      adresse: adresse || null,
      updated_at: new Date().toISOString(),
    });
    if (upsertError) { setError(upsertError.message); return; }
    setMessage("Fiche mise à jour.");
  }

  async function lierEnfant() {
    if (!eleveChoisi) return;
    setError(null);
    const { error: linkError } = await supabase.from("parents_eleves").insert({
      parent_id: parentId,
      eleve_id: eleveChoisi,
      lien_parente: lienChoisi || null,
      responsable_financier: false,
      contact_principal: false,
    });
    if (linkError) { setError(linkError.message.includes("duplicate") ? "Cet élève est déjà lié." : linkError.message); return; }
    setEleveChoisi("");
    setLienChoisi("");
    charger();
  }

  async function delierEnfant(eleveId: string) {
    if (!window.confirm("Retirer ce lien parent-élève ?")) return;
    await supabase.from("parents_eleves").delete().eq("parent_id", parentId).eq("eleve_id", eleveId);
    charger();
  }

  async function toggleFlag(eleveId: string, champ: "responsable_financier" | "contact_principal", valeur: boolean) {
    await supabase.from("parents_eleves").update({ [champ]: !valeur }).eq("parent_id", parentId).eq("eleve_id", eleveId);
    charger();
  }

  const elevesFiltres = elevesDisponibles.filter((e) => {
    const q = filtreEleve.toLowerCase();
    return e.nom.toLowerCase().includes(q) || e.prenom.toLowerCase().includes(q) || e.matricule.toLowerCase().includes(q);
  });

  if (loading) return <main className="p-8">Chargement...</main>;
  if (!identite) return <main className="p-8">Parent introuvable.</main>;

  return (
    <main className="p-6 sm:p-8 max-w-xl mx-auto pb-16 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold mb-1">{identite.prenom} {identite.nom}</h1>
        <p className="text-neutral-500 text-sm">{identite.identifiant} {identite.telephone && `· ${identite.telephone}`}</p>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
      {message && <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">{message}</div>}

      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold">Informations</h2>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Profession</label>
          <input value={profession} onChange={(e) => setProfession(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Adresse</label>
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
        </div>
        <button onClick={enregistrer} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium">
          Enregistrer
        </button>
      </section>

      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold mb-3">Enfants</h2>
        {enfants.length === 0 ? (
          <p className="text-sm text-neutral-400 mb-3">Aucun enfant lié.</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {enfants.map((e) => (
              <li key={e.eleve_id} className="bg-neutral-50 rounded-lg px-3 py-2">
                <div className="flex justify-between items-center mb-1">
                  <p className="font-medium text-sm">
                    {e.prenom} {e.nom} ({e.matricule}) {e.lien_parente && `— ${e.lien_parente}`}
                  </p>
                  <button onClick={() => delierEnfant(e.eleve_id)} className="text-red-600 text-xs hover:underline">
                    Retirer
                  </button>
                </div>
                <div className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={e.responsable_financier} onChange={() => toggleFlag(e.eleve_id, "responsable_financier", e.responsable_financier)} />
                    Responsable financier
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={e.contact_principal} onChange={() => toggleFlag(e.eleve_id, "contact_principal", e.contact_principal)} />
                    Contact principal
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}

        <input
          value={filtreEleve}
          onChange={(e) => setFiltreEleve(e.target.value)}
          placeholder="Filtrer les élèves..."
          className="w-full border rounded-lg p-2 text-sm mb-2"
        />
        <div className="flex flex-wrap gap-2 items-center">
          <select value={eleveChoisi} onChange={(e) => setEleveChoisi(e.target.value)} className="border rounded-lg p-1.5 text-sm">
            <option value="">Choisir un élève...</option>
            {elevesFiltres.map((e) => (
              <option key={e.id} value={e.id}>{e.prenom} {e.nom} ({e.matricule})</option>
            ))}
          </select>
          <input
            value={lienChoisi}
            onChange={(e) => setLienChoisi(e.target.value)}
            placeholder="Lien (père, mère, tuteur...)"
            className="border rounded-lg p-1.5 text-sm"
          />
          <button onClick={lierEnfant} className="bg-black text-white rounded-lg px-3 py-1.5 text-sm font-medium">
            + Lier
          </button>
        </div>
      </section>
    </main>
  );
                                        }
