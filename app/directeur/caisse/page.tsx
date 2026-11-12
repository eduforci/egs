import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  NIVEAUX,
  REGLES_PAR_DEFAUT,
  dateHeure,
  fcfa,
  type AlerteCaisse,
  type ReglesAlerte,
} from "@/lib/alertes-caisse";
import { BoutonToutLire, BoutonsValidation, FormReglages } from "./actions";

export const dynamic = "force-dynamic";

type Depense = {
  id: string;
  libelle: string;
  fournisseur: string | null;
  montant: number;
  date_depense: string;
  justificatif: string | null;
  cree_par: string | null;
};

type SessionOuverte = {
  id: string;
  solde_initial: number;
  caisses: { nom: string } | { nom: string }[] | null;
};

type Mouvement = { type: string; montant: number; date_mouvement: string };

export default async function CaissePromoteurPage({
  searchParams,
}: {
  searchParams: { filtre?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: moi } = user
    ? await supabase.from("profiles").select("role, etablissement_id").eq("id", user.id).single()
    : { data: null };

  if (!moi || moi.role !== "administration" || !moi.etablissement_id) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-bold">Caisse et alertes</h1>
        <p className="mt-3 text-sm text-neutral-600">
          Cette page est réservée au compte administration de l'école (le promoteur).
        </p>
      </main>
    );
  }

  const etablissementId = moi.etablissement_id as string;
  const seulementNonLues = searchParams.filtre === "non_lues";

  // ---- Règles ----
  const { data: reglesLues } = await supabase
    .from("regles_alerte_caisse")
    .select(
      "seuil_sortie, seuil_justificatif, seuil_validation, alerte_sans_justificatif, alerte_ecart_cloture, alerte_modification, envoyer_sms"
    )
    .eq("etablissement_id", etablissementId)
    .maybeSingle();

  const regles: ReglesAlerte = reglesLues
    ? {
        seuil_sortie: Number(reglesLues.seuil_sortie),
        seuil_justificatif: Number(reglesLues.seuil_justificatif),
        seuil_validation: reglesLues.seuil_validation === null ? null : Number(reglesLues.seuil_validation),
        alerte_sans_justificatif: !!reglesLues.alerte_sans_justificatif,
        alerte_ecart_cloture: !!reglesLues.alerte_ecart_cloture,
        alerte_modification: !!reglesLues.alerte_modification,
        envoyer_sms: !!reglesLues.envoyer_sms,
      }
    : REGLES_PAR_DEFAUT;

  // ---- Alertes ----
  let requeteAlertes = supabase
    .from("alertes_caisse")
    .select("id, type, niveau, titre, message, montant, cible_type, cible_id, acteur_nom, lue_le, cree_le")
    .eq("etablissement_id", etablissementId)
    .order("cree_le", { ascending: false })
    .limit(50);
  if (seulementNonLues) requeteAlertes = requeteAlertes.is("lue_le", null);

  const [{ data: alertesLues, error: erreurAlertes }, { count: nbNonLues }] = await Promise.all([
    requeteAlertes,
    supabase
      .from("alertes_caisse")
      .select("id", { count: "exact", head: true })
      .eq("etablissement_id", etablissementId)
      .is("lue_le", null),
  ]);

  if (erreurAlertes) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-bold">Caisse et alertes</h1>
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Les alertes de caisse ne sont pas encore activées pour votre école. Il faut d'abord exécuter le fichier{" "}
          <code>supabase/alertes-caisse.sql</code> dans Supabase (SQL Editor).
        </div>
      </main>
    );
  }
  const alertes = (alertesLues ?? []) as AlerteCaisse[];

  // ---- Caisses ouvertes : solde, entrées et sorties du jour ----
  const { data: sessionsLues } = await supabase
    .from("caisse_sessions")
    .select("id, solde_initial, caisses(nom)")
    .eq("statut", "ouverte");
  const sessions = (sessionsLues ?? []) as unknown as SessionOuverte[];

  let mouvements: Mouvement[] = [];
  if (sessions.length > 0) {
    const { data } = await supabase
      .from("caisse_mouvements")
      .select("type, montant, date_mouvement")
      .in(
        "caisse_session_id",
        sessions.map((s) => s.id)
      );
    mouvements = (data ?? []) as Mouvement[];
  }

  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0); // Abidjan = UTC+0
  const entreesTotal = mouvements.filter((m) => m.type === "entree").reduce((s, m) => s + Number(m.montant), 0);
  const sortiesTotal = mouvements.filter((m) => m.type === "sortie").reduce((s, m) => s + Number(m.montant), 0);
  const soldeInitial = sessions.reduce((s, x) => s + Number(x.solde_initial), 0);
  const solde = soldeInitial + entreesTotal - sortiesTotal;
  const duJour = mouvements.filter((m) => new Date(m.date_mouvement) >= debutJour);
  const entreesJour = duJour.filter((m) => m.type === "entree").reduce((s, m) => s + Number(m.montant), 0);
  const sortiesJour = duJour.filter((m) => m.type === "sortie").reduce((s, m) => s + Number(m.montant), 0);

  // ---- Dépenses à valider (seulement si un seuil d'accord est réglé) ----
  let aValider: Depense[] = [];
  const noms = new Map<string, string>();
  if (regles.seuil_validation !== null) {
    const { data } = await supabase
      .from("depenses")
      .select("id, libelle, fournisseur, montant, date_depense, justificatif, cree_par")
      .eq("etablissement_id", etablissementId)
      .eq("validee", false)
      .eq("refusee", false)
      .gte("montant", regles.seuil_validation)
      .order("date_depense", { ascending: false })
      .limit(20);
    aValider = (data ?? []) as Depense[];

    const ids = Array.from(new Set(aValider.map((d) => d.cree_par).filter((x): x is string => !!x)));
    if (ids.length > 0) {
      const { data: profils } = await supabase.from("profiles").select("id, nom, prenom").in("id", ids);
      (profils ?? []).forEach((p: { id: string; nom: string | null; prenom: string | null }) =>
        noms.set(p.id, `${p.prenom ?? ""} ${p.nom ?? ""}`.trim())
      );
    }
  }

  const caisseOuverte = sessions.length > 0;

  return (
    <main className="mx-auto max-w-xl space-y-5 p-4 pb-16 sm:p-6">
      <header>
        <p className="text-sm text-neutral-500">
          {new Date().toLocaleDateString("fr-FR", {
            timeZone: "Africa/Abidjan",
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="text-2xl font-bold">Caisse et alertes</h1>
      </header>

      {/* Solde */}
      <section className="rounded-2xl bg-emerald-800 p-5 text-white">
        <p className="text-sm text-emerald-100">Solde de caisse</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">
          {caisseOuverte ? fcfa(solde) : "—"} <span className="text-base font-medium text-emerald-100">FCFA</span>
        </p>
        {caisseOuverte ? (
          <>
            <p className="mt-1 text-sm text-emerald-100">Ouverture : {fcfa(soldeInitial)} FCFA</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/15 p-3">
                <p className="text-xs text-emerald-100">Entrées du jour</p>
                <p className="text-lg font-bold tabular-nums">+{fcfa(entreesJour)}</p>
              </div>
              <div className="rounded-xl bg-white/15 p-3">
                <p className="text-xs text-emerald-100">Sorties du jour</p>
                <p className="text-lg font-bold tabular-nums">−{fcfa(sortiesJour)}</p>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-emerald-100">Aucune caisse ouverte pour le moment.</p>
        )}
      </section>

      {/* À valider */}
      {regles.seuil_validation !== null && (
        <section aria-labelledby="titre-valider">
          <h2 id="titre-valider" className="mb-2 text-base font-bold">
            À valider {aValider.length > 0 && <span className="text-red-700">({aValider.length})</span>}
          </h2>
          {aValider.length === 0 ? (
            <p className="rounded-xl border bg-white p-4 text-sm text-neutral-500">
              Aucune dépense n'attend votre accord.
            </p>
          ) : (
            <div className="space-y-3">
              {aValider.map((d) => (
                <article key={d.id} className="rounded-2xl border-2 border-emerald-700 bg-white p-4">
                  <p className="inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                    ACCORD REQUIS
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums">{fcfa(d.montant)} FCFA</p>
                  <p className="text-base font-medium">{d.libelle}</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    {d.fournisseur ? `${d.fournisseur} · ` : ""}
                    {d.date_depense}
                    {d.cree_par && noms.get(d.cree_par) ? ` · saisi par ${noms.get(d.cree_par)}` : ""}
                  </p>
                  <p className={`mt-1 text-sm ${d.justificatif ? "text-neutral-600" : "font-semibold text-red-700"}`}>
                    {d.justificatif ? `Justificatif : ${d.justificatif}` : "Sans justificatif"}
                  </p>
                  <BoutonsValidation depenseId={d.id} />
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Alertes */}
      <section aria-labelledby="titre-alertes">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="titre-alertes" className="text-base font-bold">
            Alertes {nbNonLues ? <span className="text-red-700">({nbNonLues} non lues)</span> : null}
          </h2>
          {nbNonLues ? <BoutonToutLire /> : null}
        </div>

        <div className="mb-3 flex gap-2">
          <Link
            href="/directeur/caisse"
            className={`flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${
              !seulementNonLues ? "border-emerald-800 bg-emerald-800 text-white" : "bg-white"
            }`}
          >
            Toutes
          </Link>
          <Link
            href="/directeur/caisse?filtre=non_lues"
            className={`flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${
              seulementNonLues ? "border-emerald-800 bg-emerald-800 text-white" : "bg-white"
            }`}
          >
            Non lues
          </Link>
        </div>

        {alertes.length === 0 ? (
          <p className="rounded-xl border bg-white p-4 text-sm text-neutral-500">
            {seulementNonLues ? "Aucune alerte non lue." : "Aucune alerte pour le moment."}
          </p>
        ) : (
          <div className="space-y-3">
            {alertes.map((a) => {
              const niveau = NIVEAUX[a.niveau] ?? NIVEAUX.a_verifier;
              return (
                <article key={a.id} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${niveau.classes}`}>
                      {niveau.label}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                      {!a.lue_le && <span className="h-2 w-2 rounded-full bg-red-600" aria-label="Non lue" />}
                      {dateHeure(a.cree_le)}
                    </span>
                  </div>
                  <h3 className={`mt-2 text-base leading-snug ${a.lue_le ? "font-semibold" : "font-bold"}`}>{a.titre}</h3>
                  {a.message && <p className="mt-1 text-sm text-neutral-700">{a.message}</p>}
                  {a.acteur_nom && <p className="mt-1 text-xs text-neutral-500">Saisi par {a.acteur_nom}</p>}
                </article>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-neutral-500">
          Le détail de chaque opération est dans le{" "}
          <Link href="/directeur/journal" className="underline">
            journal d'audit
          </Link>
          .
        </p>
      </section>

      {/* Réglages */}
      <details className="rounded-2xl border bg-white">
        <summary className="flex min-h-[52px] cursor-pointer items-center px-4 text-base font-bold">
          Réglages des alertes
        </summary>
        <div className="border-t p-4">
          <FormReglages valeurs={regles} />
        </div>
      </details>
    </main>
  );
}
