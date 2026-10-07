"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Etab = {
  id: string;
  nom: string;
  ville: string | null;
  code_etablissement: string | null;
  code_drena: string | null;
  statut: "actif" | "en_attente" | "suspendu" | "expire";
  date_debut_abonnement: string | null;
  date_fin_abonnement: string | null;
};

const LABELS: Record<Etab["statut"], string> = {
  actif: "Actif",
  en_attente: "En attente",
  suspendu: "Suspendu",
  expire: "Expiré",
};

const STYLES: Record<Etab["statut"], string> = {
  actif: "bg-green-50 text-green-700 border-green-200",
  en_attente: "bg-amber-50 text-amber-700 border-amber-200",
  suspendu: "bg-red-50 text-red-700 border-red-200",
  expire: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

export default function AbonnementsPage() {
  const [liste, setListe] = useState<Etab[]>([]);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<"tous" | Etab["statut"]>("tous");
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [datesFin, setDatesFin] = useState<Record<string, string>>({});

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const res = await fetch("/api/admin/etablissements");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de chargement.");
      setListe(data.etablissements);
      const d: Record<string, string> = {};
      for (const e of data.etablissements as Etab[]) d[e.id] = e.date_fin_abonnement ?? "";
      setDatesFin(d);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  async function modifier(id: string, corps: Record<string, unknown>, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setOccupe(id);
    setErreur(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/etablissements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...corps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur.");
      setInfo("Modification enregistrée.");
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setOccupe(null);
    }
  }

  const affichees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return liste.filter((e) => {
      if (filtre !== "tous" && e.statut !== filtre) return false;
      if (!q) return true;
      return [e.nom, e.ville, e.code_etablissement, e.code_drena]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [liste, recherche, filtre]);

  const compte = (s: Etab["statut"]) => liste.filter((e) => e.statut === s).length;

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Abonnements</h1>
          <p className="text-sm text-neutral-500">
            {liste.length} établissement(s) · {compte("actif")} actif(s) · {compte("suspendu")} suspendu(s)
          </p>
        </div>
        <Link
          href="/admin/etablissements/nouveau"
          className="shrink-0 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white"
        >
          + Nouveau
        </Link>
      </div>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher par code, nom ou ville…"
        className="mb-3 w-full rounded-lg border p-2.5 text-sm"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(["tous", "actif", "en_attente", "suspendu", "expire"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltre(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filtre === f ? "border-black bg-black text-white" : "bg-white text-neutral-700"
            }`}
          >
            {f === "tous" ? "Tous" : LABELS[f]}
          </button>
        ))}
      </div>

      {erreur && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</div>}
      {info && <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{info}</div>}
      {chargement && <p className="text-sm text-neutral-500">Chargement…</p>}

      {!chargement && affichees.length === 0 && (
        <p className="text-sm text-neutral-500">Aucun établissement trouvé.</p>
      )}

      <ul className="space-y-3">
        {affichees.map((e) => (
          <li key={e.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{e.nom}</p>
                <p className="text-xs text-neutral-500">
                  {e.ville ?? "—"}
                  {e.code_etablissement && <> · Code {e.code_etablissement}</>}
                  {e.code_drena && <> · DRENA {e.code_drena}</>}
                </p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${STYLES[e.statut]}`}>
                {LABELS[e.statut]}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {e.statut !== "actif" && (
                <button
                  type="button"
                  disabled={occupe === e.id}
                  onClick={() => modifier(e.id, { statut: "actif" }, `Activer l'abonnement de ${e.nom} ?`)}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Activer
                </button>
              )}
              {e.statut !== "en_attente" && (
                <button
                  type="button"
                  disabled={occupe === e.id}
                  onClick={() => modifier(e.id, { statut: "en_attente" })}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  Mettre en attente
                </button>
              )}
              {e.statut !== "suspendu" && (
                <button
                  type="button"
                  disabled={occupe === e.id}
                  onClick={() => modifier(e.id, { statut: "suspendu" }, `Suspendre l'abonnement de ${e.nom} ?`)}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50"
                >
                  Suspendre
                </button>
              )}
              {e.statut !== "expire" && (
                <button
                  type="button"
                  disabled={occupe === e.id}
                  onClick={() => modifier(e.id, { statut: "expire" }, `Marquer l'abonnement de ${e.nom} comme expiré ?`)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50"
                >
                  Expiré
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span>
                Début : {e.date_debut_abonnement ? new Date(e.date_debut_abonnement).toLocaleDateString("fr-FR") : "—"}
              </span>
              <span>· Fin :</span>
              <input
                type="date"
                value={datesFin[e.id] ?? ""}
                onChange={(ev) => setDatesFin((d) => ({ ...d, [e.id]: ev.target.value }))}
                className="rounded border p-1 text-xs"
              />
              <button
                type="button"
                disabled={occupe === e.id}
                onClick={() => modifier(e.id, { dateFin: datesFin[e.id] || null })}
                className="rounded border px-2 py-1 text-xs font-medium text-neutral-700 disabled:opacity-50"
              >
                Enregistrer la date
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
