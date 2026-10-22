"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cleGrille, codesTarifEcole, formaterFCFA, libelleTranche, montantEcole, trancheDe, type Grille, type Tranche } from "@/lib/tarifs";

type Offre = { code: string; libelle: string };
type Ecole = { id: string; nom: string; statut: string; espaces_actifs: string[] | null; formule_secondaire?: string | null; effectif: number };

export default function TarifsPage() {
  const [offres, setOffres] = useState<Offre[]>([]);
  const [ecoles, setEcoles] = useState<Ecole[]>([]);
  const [limites, setLimites] = useState<string[]>([]); // effectif max de chaque tranche sauf la dernière
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/tarifs", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erreur de chargement.");
      setOffres(j.offres);
      setEcoles(j.ecoles);
      const tr = (j.tranches as Tranche[]).slice().sort((a, b) => a.ordre - b.ordre);
      setLimites(tr.slice(0, -1).map((t) => String(t.effectif_max ?? "")));
      const s: Record<string, string> = {};
      for (const g of j.grille as { code: string; ordre: number; prix_annuel: number | null }[])
        s[cleGrille(g.code, g.ordre)] = g.prix_annuel === null ? "" : String(g.prix_annuel);
      setSaisie(s);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur.");
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  // Tranches telles que saisies (pour les libellés et le calcul en direct)
  const tranches: Tranche[] = useMemo(
    () => [...limites.map((l, i) => ({ ordre: i + 1, effectif_max: Number(l) || 0 })), { ordre: limites.length + 1, effectif_max: null }],
    [limites]
  );

  async function enregistrer() {
    setOccupe(true); setErreur(null); setInfo(null);
    const grille = offres.flatMap((o) => tranches.map((t) => ({ code: o.code, ordre: t.ordre, prix: saisie[cleGrille(o.code, t.ordre)] ?? "" })));
    try {
      const r = await fetch("/api/admin/tarifs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limites, grille }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Échec.");
      setInfo("Tarifs enregistrés.");
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setOccupe(false);
    }
  }

  const grillePrix: Grille = {};
  for (const [k, v] of Object.entries(saisie) as [string, string][]) {
    const n = Number(v.replace(/\s/g, ""));
    grillePrix[k] = v.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : null;
  }
  const libelleOffre = (code: string) => offres.find((o) => o.code === code)?.libelle ?? code;

  const lignes = ecoles.map((e) => {
    const codes = codesTarifEcole(e.espaces_actifs, e.formule_secondaire);
    const tr = trancheDe(e.effectif, tranches);
    return { e, codes, tr, ...montantEcole(codes, grillePrix, tr ? tr.ordre : null) };
  });
  const totalPlateforme = lignes.filter((l) => l.e.statut === "actif").reduce((s, l) => s + l.total, 0);

  return (
    <main className="p-6 sm:p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold mb-1">Tarifs d'abonnement</h1>
        <p className="text-neutral-500 text-sm">
          Le prix dépend de l'offre (cycle ou formule) et du nombre d'élèves de l'école. Une école qui gère plusieurs cycles paie la somme de ses offres, au tarif de la tranche de son effectif total.
        </p>
      </div>

      {erreur && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{erreur}</div>}
      {info && <div className="bg-green-50 text-green-800 text-sm p-3 rounded-lg">{info}</div>}

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-medium">Tranches d'effectif</h2>
        <p className="text-xs text-neutral-500">Indique le nombre maximum d'élèves de chaque tranche. La dernière tranche n'a pas de limite.</p>
        {tranches.map((t, i) => (
          <div key={t.ordre} className="flex items-center justify-between gap-3 text-sm">
            <span>{libelleTranche(t.ordre, tranches)}</span>
            {i < limites.length ? (
              <input
                inputMode="numeric"
                value={limites[i]}
                onChange={(e) => setLimites(limites.map((l, j) => (j === i ? e.target.value : l)))}
                className="w-24 border rounded-lg px-2 py-1.5 text-right"
                aria-label={`Effectif maximum de la tranche ${t.ordre}`}
              />
            ) : (
              <span className="text-xs text-neutral-500">sans limite</span>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <button
            onClick={() => setLimites([...limites, String((Number(limites[limites.length - 1]) || 0) + 200)])}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            + Ajouter une tranche
          </button>
          {limites.length > 0 && (
            <button onClick={() => setLimites(limites.slice(0, -1))} className="border rounded-lg px-3 py-1.5 text-sm bg-white text-red-700">
              Retirer la dernière
            </button>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Prix par an (FCFA)</h2>
        {offres.map((o) => (
          <div key={o.code} className="bg-white border rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium">{o.libelle}</p>
            {tranches.map((t) => (
              <label key={t.ordre} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-600">{libelleTranche(t.ordre, tranches)}</span>
                <input
                  inputMode="numeric"
                  value={saisie[cleGrille(o.code, t.ordre)] ?? ""}
                  onChange={(e) => setSaisie({ ...saisie, [cleGrille(o.code, t.ordre)]: e.target.value })}
                  placeholder="Non défini"
                  className="w-36 border rounded-lg px-2 py-1.5 text-right"
                />
              </label>
            ))}
          </div>
        ))}
        <button onClick={enregistrer} disabled={occupe} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
          Enregistrer les tarifs
        </button>
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-medium">Ce que paie chaque école</h2>
          <p className="text-xs text-neutral-500">Écoles actives : {formaterFCFA(totalPlateforme)} par an</p>
        </div>
        <div className="divide-y">
          {lignes.map(({ e, codes, tr, total, complet }) => (
            <div key={e.id} className="py-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{e.nom}</span>
                <span className={complet ? "font-semibold" : "text-amber-700"}>
                  {codes.length === 0 ? "Aucun cycle" : complet ? formaterFCFA(total) : "Prix à définir"}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                {e.effectif} élève(s){tr ? ` · ${libelleTranche(tr.ordre, tranches)}` : ""}
                {" · "}
                {codes.length ? codes.map(libelleOffre).join(" + ") : "Aucun espace de travail coché"}
                {e.statut !== "actif" ? ` · ${e.statut}` : ""}
              </p>
            </div>
          ))}
          {lignes.length === 0 && <p className="text-sm text-neutral-500 py-2">Aucune école.</p>}
        </div>
      </section>
    </main>
  );
}
