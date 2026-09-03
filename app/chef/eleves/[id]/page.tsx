"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Inscription = {
  id: string;
  classe_id: string;
  annee_scolaire: string;
  date_inscription: string;
  statut: string;
  date_sortie: string | null;
  classe_nom: string;
};

type ParentLie = {
  parent_id: string;
  eleve_id: string;
  lien_parente: string | null;
  responsable_financier: boolean;
  contact_principal: boolean;
  nom: string;
  prenom: string;
  telephone: string | null;
};

type ContactUrgence = {
  id: string;
  nom: string;
  prenom: string;
  lien: string;
  telephone: string;
  adresse: string | null;
};

export default function FicheElevePage() {
  const params = useParams();
  const eleveId = params.id as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [identite, setIdentite] = useState<{ nom: string; prenom: string; matricule: string; classe_nom: string } | null>(null);
  const [adresse, setAdresse] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [statut, setStatut] = useState("actif");
  const [dateNaissance, setDateNaissance] = useState("");
  const [lieuNaissance, setLieuNaissance] = useState("");
  const [etablissementId, setEtablissementId] = useState("");

  const [inscriptions, setInscriptions] = useState<Inscription[]>([]);
  const [parentsLies, setParentsLies] = useState<ParentLie[]>([]);
  const [contacts, setContacts] = useState<ContactUrgence[]>([]);

  const [parentsDisponibles, setParentsDisponibles] = useState<{ id: string; nom: string; prenom: string }[]>([]);
  const [parentChoisi, setParentChoisi] = useState("");
  const [lienChoisi, setLienChoisi] = useState("");

  const [nouveauContact, setNouveauContact] = useState({ nom: "", prenom: "", lien: "", telephone: "", adresse: "" });

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: eleve, error: eleveError } = await supabase
        .from("eleves")
        .select("id, matricule, adresse, photo_url, statut, date_naissance, lieu_naissance, etablissement_id, classe_id, classes(nom)")
        .eq("id", eleveId)
        .single();

      if (eleveError) throw eleveError;

      const { data: profil } = await supabase
        .from("profiles")
        .select("nom, prenom")
        .eq("id", eleveId)
        .single();

      const classeInfo: any = Array.isArray((eleve as any).classes) ? (eleve as any).classes[0] : (eleve as any).classes;

      setIdentite({
        nom: profil?.nom ?? "",
        prenom: profil?.prenom ?? "",
        matricule: eleve.matricule,
        classe_nom: classeInfo?.nom ?? "-",
      });
      setAdresse(eleve.adresse ?? "");
      setPhotoUrl(eleve.photo_url ?? "");
      setStatut(eleve.statut ?? "actif");
      setDateNaissance(eleve.date_naissance ?? "");
      setLieuNaissance(eleve.lieu_naissance ?? "");
      setEtablissementId(eleve.etablissement_id);

      const { data: inscrData } = await supabase
        .from("inscriptions")
        .select("id, classe_id, annee_scolaire, date_inscription, statut, date_sortie, classes(nom)")
        .eq("eleve_id", eleveId)
        .order("date_inscription", { ascending: false });

      setInscriptions(
        ((inscrData ?? []) as any[]).map((i) => {
          const cl = Array.isArray(i.classes) ? i.classes[0] : i.classes;
          return { ...i, classe_nom: cl?.nom ?? "-" };
        })
      );

      const { data: liaisons } = await supabase
        .from("parents_eleves")
        .select("parent_id, eleve_id, lien_parente, responsable_financier, contact_principal")
        .eq("eleve_id", eleveId);

      const parentIds = (liaisons ?? []).map((l) => l.parent_id);
      const { data: parentsProfiles } = await supabase
        .from("profiles")
        .select("id, nom, prenom, telephone")
        .in("id", parentIds.length > 0 ? parentIds : ["00000000-0000-0000-0000-000000000000"]);
      const parentsMap = new Map((parentsProfiles ?? []).map((p) => [p.id, p]));

      setParentsLies(
        (liaisons ?? []).map((l) => {
          const p = parentsMap.get(l.parent_id);
          return {
            ...l,
            nom: p?.nom ?? "Inconnu",
            prenom: p?.prenom ?? "",
            telephone: p?.telephone ?? null,
          };
        })
      );

      const { data: contactsData } = await supabase
        .from("contacts_urgence")
        .select("id, nom, prenom, lien, telephone, adresse")
        .eq("eleve_id", eleveId)
        .order("created_at");
      setContacts(contactsData ?? []);

      const { data: tousParents } = await supabase
        .from("parents")
        .select("id")
        .eq("etablissement_id", eleve.etablissement_id);
      const idsParents = (tousParents ?? []).map((p) => p.id);
      const { data: profilsParents } = await supabase
        .from("profiles")
        .select("id, nom, prenom")
        .in("id", idsParents.length > 0 ? idsParents : ["00000000-0000-0000-0000-000000000000"]);
      setParentsDisponibles((profilsParents ?? []).sort((a, b) => a.nom.localeCompare(b.nom)));
    } catch (e: any) {
      setError(e.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [supabase, eleveId]);

  useEffect(() => { charger(); }, [charger]);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("La photo ne doit pas dépasser 5 Mo.");
      return;
    }

    setUploadingPhoto(true);
    setError(null);

    try {
      const extension = file.name.split(".").pop();
      const chemin = `${eleveId}/photo.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("photos-eleves")
        .upload(chemin, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("photos-eleves")
        .getPublicUrl(chemin);

      setPhotoUrl(`${publicUrlData.publicUrl}?t=${Date.now()}`);
    } catch (err: any) {
      setError(err.message || "Erreur lors du téléversement de la photo.");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  async function enregistrerFiche() {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/chef/modifier-eleve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eleveId,
        adresse,
        photoUrl,
        statut,
        dateNaissance,
        lieuNaissance,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Erreur lors de la mise à jour."); return; }
    setMessage("Fiche mise à jour.");
  }

  async function lierParent() {
    if (!parentChoisi) return;
    setError(null);
    const { error: linkError } = await supabase.from("parents_eleves").insert({
      parent_id: parentChoisi,
      eleve_id: eleveId,
      lien_parente: lienChoisi || null,
      responsable_financier: false,
      contact_principal: false,
    });
    if (linkError) { setError(linkError.message.includes("duplicate") ? "Ce parent est déjà lié." : linkError.message); return; }
    setParentChoisi("");
    setLienChoisi("");
    charger();
  }

  async function delierParent(parentId: string) {
    if (!window.confirm("Retirer ce lien parent-élève ?")) return;
    await supabase.from("parents_eleves").delete().eq("parent_id", parentId).eq("eleve_id", eleveId);
    charger();
  }

  async function toggleFlag(parentId: string, champ: "responsable_financier" | "contact_principal", valeur: boolean) {
    await supabase.from("parents_eleves").update({ [champ]: !valeur }).eq("parent_id", parentId).eq("eleve_id", eleveId);
    charger();
  }

  async function ajouterContact() {
    if (!nouveauContact.nom || !nouveauContact.prenom || !nouveauContact.lien || !nouveauContact.telephone) {
      setError("Nom, prénom, lien et téléphone sont obligatoires pour un contact d'urgence.");
      return;
    }
    setError(null);
    const { error: insertError } = await supabase.from("contacts_urgence").insert({
      eleve_id: eleveId,
      ...nouveauContact,
      adresse: nouveauContact.adresse || null,
    });
    if (insertError) { setError(insertError.message); return; }
    setNouveauContact({ nom: "", prenom: "", lien: "", telephone: "", adresse: "" });
    charger();
  }

  async function supprimerContact(id: string) {
    if (!window.confirm("Supprimer ce contact d'urgence ?")) return;
    await supabase.from("contacts_urgence").delete().eq("id", id);
    charger();
  }

  if (loading) return <main className="p-8">Chargement...</main>;
  if (!identite) return <main className="p-8">Élève introuvable.</main>;

  return (
    <main className="p-6 sm:p-8 max-w-2xl mx-auto pb-16 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold mb-1">{identite.prenom} {identite.nom}</h1>
        <p className="text-neutral-500 text-sm">{identite.matricule} · {identite.classe_nom}</p>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
      {message && <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">{message}</div>}

      {/* Fiche */}
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold">Informations</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Date de naissance</label>
            <input
              type="date"
              value={dateNaissance}
              onChange={(e) => setDateNaissance(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Lieu de naissance</label>
            <input
              type="text"
              value={lieuNaissance}
              onChange={(e) => setLieuNaissance(e.target.value)}
              placeholder="Ex: Abidjan"
              className="w-full border rounded-lg p-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-neutral-500 mb-1">Adresse</label>
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
        </div>

        <div>
          <label className="block text-xs text-neutral-500 mb-1">Photo</label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg bg-neutral-100 border overflow-hidden flex items-center justify-center shrink-0">
              {photoUrl ? (
                <img src={photoUrl} alt="Photo élève" className="w-full h-full object-cover" />
              ) : (
                <span className="text-neutral-300 text-xs">Aucune</span>
              )}
            </div>
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                disabled={uploadingPhoto}
                className="text-xs w-full"
              />
              {uploadingPhoto && <p className="text-xs text-neutral-400 mt-1">Téléversement en cours...</p>}
              {photoUrl && !uploadingPhoto && (
                <button
                  onClick={() => setPhotoUrl("")}
                  className="text-red-600 text-xs hover:underline mt-1"
                  type="button"
                >
                  Retirer la photo
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-neutral-500 mb-1">Statut</label>
          <select value={statut} onChange={(e) => setStatut(e.target.value)} className="w-full border rounded-lg p-2 text-sm">
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
            <option value="transfere">Transféré</option>
            <option value="diplome">Diplômé</option>
            <option value="abandon">Abandon</option>
          </select>
        </div>

        <button onClick={enregistrerFiche} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium">
          Enregistrer
        </button>
      </section>

      {/* Historique inscriptions */}
      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold mb-3">Historique du parcours scolaire</h2>
        {inscriptions.length === 0 ? (
          <p className="text-sm text-neutral-400">Aucun historique.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {inscriptions.map((i) => (
              <li key={i.id} className="flex justify-between items-center bg-neutral-50 rounded-lg px-3 py-2">
                <div>
                  <p className="font-medium">{i.classe_nom} — {i.annee_scolaire}</p>
                  <p className="text-xs text-neutral-400">
                    Depuis le {new Date(i.date_inscription).toLocaleDateString("fr-FR")}
                    {i.date_sortie && ` · Sorti le ${new Date(i.date_sortie).toLocaleDateString("fr-FR")}`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  i.statut === "active" ? "bg-green-50 text-green-700" : "bg-neutral-200 text-neutral-600"
                }`}>
                  {i.statut}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Parents liés */}
      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold mb-3">Parents / responsables</h2>
        {parentsLies.length === 0 ? (
          <p className="text-sm text-neutral-400 mb-3">Aucun parent lié.</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {parentsLies.map((p) => (
              <li key={p.parent_id} className="bg-neutral-50 rounded-lg px-3 py-2">
                <div className="flex justify-between items-center mb-1">
                  <p className="font-medium text-sm">{p.prenom} {p.nom} {p.lien_parente && `(${p.lien_parente})`}</p>
                  <button onClick={() => delierParent(p.parent_id)} className="text-red-600 text-xs hover:underline">
                    Retirer
                  </button>
                </div>
                <p className="text-xs text-neutral-400 mb-2">{p.telephone ?? "—"}</p>
                <div className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={p.responsable_financier} onChange={() => toggleFlag(p.parent_id, "responsable_financier", p.responsable_financier)} />
                    Responsable financier
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={p.contact_principal} onChange={() => toggleFlag(p.parent_id, "contact_principal", p.contact_principal)} />
                    Contact principal
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <select value={parentChoisi} onChange={(e) => setParentChoisi(e.target.value)} className="border rounded-lg p-1.5 text-sm">
            <option value="">Choisir un parent...</option>
            {parentsDisponibles.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
          </select>
          <input
            value={lienChoisi}
            onChange={(e) => setLienChoisi(e.target.value)}
            placeholder="Lien (père, mère, tuteur...)"
            className="border rounded-lg p-1.5 text-sm"
          />
          <button onClick={lierParent} className="bg-black text-white rounded-lg px-3 py-1.5 text-sm font-medium">
            + Lier
          </button>
        </div>
      </section>

      {/* Contacts d'urgence */}
      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold mb-3">Contacts d'urgence</h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-neutral-400 mb-3">Aucun contact d'urgence enregistré.</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {contacts.map((c) => (
              <li key={c.id} className="flex justify-between items-center bg-neutral-50 rounded-lg px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{c.prenom} {c.nom} ({c.lien})</p>
                  <p className="text-xs text-neutral-400">{c.telephone}{c.adresse && ` · ${c.adresse}`}</p>
                </div>
                <button onClick={() => supprimerContact(c.id)} className="text-red-600 text-xs hover:underline">
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input placeholder="Nom" value={nouveauContact.nom} onChange={(e) => setNouveauContact({ ...nouveauContact, nom: e.target.value })} className="border rounded-lg p-2 text-sm" />
          <input placeholder="Prénom" value={nouveauContact.prenom} onChange={(e) => setNouveauContact({ ...nouveauContact, prenom: e.target.value })} className="border rounded-lg p-2 text-sm" />
          <input placeholder="Lien (oncle, voisin...)" value={nouveauContact.lien} onChange={(e) => setNouveauContact({ ...nouveauContact, lien: e.target.value })} className="border rounded-lg p-2 text-sm" />
          <input placeholder="Téléphone" value={nouveauContact.telephone} onChange={(e) => setNouveauContact({ ...nouveauContact, telephone: e.target.value })} className="border rounded-lg p-2 text-sm" />
          <input placeholder="Adresse (optionnel)" value={nouveauContact.adresse} onChange={(e) => setNouveauContact({ ...nouveauContact, adresse: e.target.value })} className="border rounded-lg p-2 text-sm col-span-2" />
        </div>
        <button onClick={ajouterContact} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium">
          + Ajouter le contact
        </button>
      </section>
    </main>
  );
        }
