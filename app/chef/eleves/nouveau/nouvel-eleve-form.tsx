"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Classe = { id: string; nom: string; niveau: string; annee_scolaire: string; };

export default function NouvelEleveForm({ classes }: { classes: Classe[] }) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [matricule, setMatricule] = useState("");
  const [classeId, setClasseId] = useState(classes[0]?.id ?? "");
  const [dateNaissance, setDateNaissance] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ matricule: string; motDePasse: string; provisoire: boolean } | null>(null);
  const [copie, setCopie] = useState(false);
  
  // PHOTO
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > 3 * 1024 * 1024) { setError("Photo trop lourde >3Mo"); return; }
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nom.trim() || !prenom.trim() || !classeId) {
      setError("Nom, prénom et classe sont obligatoires."); return;
    }
    setLoading(true);
    try {
      // 1. Upload photo d'abord vers Supabase Storage
      let photo_url: string | null = null;
      if (file) {
        const supabase = createClient();
        const fileName = `eleves/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("photos-eleves").upload(fileName, file);
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("photos-eleves").getPublicUrl(fileName);
        photo_url = data.publicUrl;
      }

      // 2. Créer élève via ton API existante
      const res = await fetch("/api/eleves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim(),
          prenom: prenom.trim(),
          matricule: matricule.trim() || undefined,
          classe_id: classeId,
          date_naissance: dateNaissance || null,
          photo_url: photo_url, // <-- NOUVEAU
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur"); return; }
      setResultat({ matricule: data.matricule, motDePasse: data.motDePasse, provisoire: data.provisoire });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  // ... garde tes fonctions reinitialiser() et copierIdentifiants() identiques ...

  function reinitialiser() {
    setNom(""); setPrenom(""); setMatricule(""); setDateNaissance(""); setFile(null); setPreview(""); setResultat(null); setError(null); setCopie(false);
  }
  async function copierIdentifiants() {
    const texte = `Identifiant : ${resultat?.matricule}\nMot de passe : ${resultat?.motDePasse}`;
    try { await navigator.clipboard.writeText(texte); setCopie(true); } catch {}
  }

  if (resultat) { /* ... ton même JSX résultat ... */ 
    return (
      <main className="p-8 max-w-lg mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Élève créé avec succès</h1>
        <div className="bg-white border rounded-xl p-5 space-y-3 mb-4">
          <div><span className="text-xs uppercase text-neutral-500">Identifiant</span><p className="font-mono text-lg font-semibold">{resultat.matricule}</p></div>
          <div><span className="text-xs uppercase text-neutral-500">Mot de passe temporaire</span><p className="font-mono text-lg font-semibold">{resultat.motDePasse}</p></div>
        </div>
        <div className="flex gap-3">
          <button onClick={copierIdentifiants} className="border rounded-lg px-4 py-2.5 text-sm">{copie ? "Copié ✓" : "Copier"}</button>
          <button onClick={reinitialiser} className="bg-black text-white rounded-lg px-4 py-2.5 text-sm">Créer un autre</button>
        </div>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Créer un compte élève</h1>
      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-4">
        {/* PHOTO - NOUVEAU BLOC */}
        <div>
          <label className="block text-sm font-medium mb-1">Photo <span className="text-neutral-400">(optionnel)</span></label>
          <div className="flex items-center gap-4">
            {preview ? <img src={preview} className="w-16 h-16 rounded-full object-cover border" /> : <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center text-[11px]">Aucune</div>}
            <input type="file" accept="image/*" onChange={handleFile} className="text-sm" />
          </div>
        </div>

        <div><label className="block text-sm font-medium mb-1">Matricule (optionnel)</label><input type="text" value={matricule} onChange={(e) => setMatricule(e.target.value)} className="w-full border rounded-lg p-2.5 font-mono" placeholder="ex: 21427141U" /></div>
        <div><label className="block text-sm font-medium mb-1">Nom</label><input type="text" value={nom} onChange={(e) => setNom(e.target.value)} className="w-full border rounded-lg p-2.5" required /></div>
        <div><label className="block text-sm font-medium mb-1">Prénom</label><input type="text" value={prenom} onChange={(e) => setPrenom(e.target.value)} className="w-full border rounded-lg p-2.5" required /></div>
        <div><label className="block text-sm font-medium mb-1">Classe</label>
          <select value={classeId} onChange={(e) => setClasseId(e.target.value)} className="w-full border rounded-lg p-2.5" required>
            {classes.map((c) => (<option key={c.id} value={c.id}>{c.nom} ({c.niveau})</option>))}
          </select>
        </div>
        <div><label className="block text-sm font-medium mb-1">Date de naissance</label><input type="date" value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)} className="w-full border rounded-lg p-2.5" /></div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="bg-black text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50 w-full">{loading ? "Création..." : "Créer l'élève"}</button>
      </form>
    </main>
  );
}