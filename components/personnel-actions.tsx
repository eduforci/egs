"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  fonction: string | null;
  actif: boolean;
  estMoi: boolean;
  peutGerer: boolean;
};

export default function PersonnelActions(p: Props) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState(p.nom);
  const [prenom, setPrenom] = useState(p.prenom);
  const [telephone, setTelephone] = useState(p.telephone ?? "");
  const [fonction, setFonction] = useState(p.fonction ?? "");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mdp, setMdp] = useState<string | null>(null);

  if (!p.peutGerer) return null;

  async function appeler(action: string, extra: Record<string, unknown> = {}) {
    setChargement(true);
    setErreur(null);
    setInfo(null);
    setMdp(null);
    try {
      const res = await fetch("/api/chef/personnel/gerer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cibleId: p.id, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error || "Erreur.");
        return;
      }
      if (data.motDePasseProvisoire) setMdp(data.motDePasseProvisoire);
      else setInfo("Enregistré.");
      router.refresh();
    } catch {
      setErreur("Connexion impossible. Réessayez.");
    } finally {
      setChargement(false);
    }
  }

  function bloquerOuDebloquer() {
    const msg = p.actif
      ? `Bloquer l'accès de ${p.prenom} ${p.nom} ? Cette personne ne pourra plus se connecter.`
      : `Débloquer l'accès de ${p.prenom} ${p.nom} ?`;
    if (!window.confirm(msg)) return;
    appeler(p.actif ? "bloquer" : "debloquer");
  }

  function reinitialiser() {
    if (!window.confirm(`Générer un nouveau mot de passe pour ${p.prenom} ${p.nom} ?`)) return;
    appeler("reinitialiser_mdp");
  }

  return (
    <div className="px-5 pb-4 -mt-1">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="text-xs font-medium text-neutral-700 underline underline-offset-2"
      >
        {ouvert ? "Fermer" : "Gérer"}
      </button>

      {ouvert && (
        <div className="mt-3 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          {erreur && <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{erreur}</div>}
          {info && <div className="rounded-lg bg-green-50 p-2 text-xs text-green-700">{info}</div>}
          {mdp && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Nouveau mot de passe provisoire (à transmettre à la personne) :
              <div className="mt-1 font-mono text-sm font-semibold">{mdp}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Nom</label>
              <input value={nom} onChange={(e) => setNom(e.target.value)} className="w-full rounded-lg border p-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Prénom</label>
              <input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="w-full rounded-lg border p-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Téléphone</label>
              <input value={telephone} onChange={(e) => setTelephone(e.target.value)} className="w-full rounded-lg border p-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Fonction (titre affiché)</label>
              <input value={fonction} onChange={(e) => setFonction(e.target.value)} className="w-full rounded-lg border p-2 text-sm" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={chargement}
              onClick={() => appeler("modifier", { nom, prenom, telephone, fonction })}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button
              type="button"
              disabled={chargement}
              onClick={reinitialiser}
              className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              Nouveau mot de passe
            </button>
            {!p.estMoi && (
              <button
                type="button"
                disabled={chargement}
                onClick={bloquerOuDebloquer}
                className={`rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50 ${
                  p.actif ? "border border-red-300 text-red-700" : "bg-green-600 text-white"
                }`}
              >
                {p.actif ? "Bloquer l'accès" : "Débloquer l'accès"}
              </button>
            )}
          </div>
          <p className="text-[11px] text-neutral-400">
            Départ ou décès : bloquez l'accès de la personne, puis créez le compte de son remplaçant avec « + Nouveau membre ».
          </p>
        </div>
      )}
    </div>
  );
}
