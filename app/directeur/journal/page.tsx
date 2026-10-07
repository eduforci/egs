import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, string> = {
  "compte.cree": "Compte créé",
  "compte.modifie": "Compte modifié",
  "compte.bloque": "Accès bloqué",
  "compte.debloque": "Accès débloqué",
  "compte.mdp_reinitialise": "Mot de passe réinitialisé",
  "eleve.cree": "Élève inscrit",
  "eleve.modifie": "Fiche élève modifiée",
  "eleve.identite_modifiee": "Nom de l'élève modifié",
  "note.modifiee": "Note modifiée",
  "note.supprimee": "Note supprimée",
  "note.saisie": "Saisie de notes",
  "note.validees": "Notes validées",
  "note.devalidees": "Validation des notes retirée",
  "note.evaluation_creee": "Évaluation créée",
  "note.evaluation_supprimee": "Évaluation supprimée",
  "appel.enregistre": "Appel enregistré",
  "appel.modifie": "Appel modifié",
  "cahier.rempli": "Cahier de texte rempli",
  "cahier.modifie": "Cahier de texte modifié",
  "profil.modifie": "Profil modifié",
  "paiement.enregistre": "Paiement enregistré",
  "paiement.modifie": "Paiement modifié",
  "paiement.supprime": "Paiement supprimé",
  "abonnement.statut": "Abonnement : statut changé",
  "abonnement.date_fin": "Abonnement : date de fin changée",
};

const COULEURS: Record<string, string> = {
  compte: "bg-blue-50 text-blue-700 border-blue-200",
  eleve: "bg-violet-50 text-violet-700 border-violet-200",
  note: "bg-amber-50 text-amber-700 border-amber-200",
  appel: "bg-orange-50 text-orange-700 border-orange-200",
  cahier: "bg-pink-50 text-pink-700 border-pink-200",
  profil: "bg-neutral-100 text-neutral-700 border-neutral-200",
  paiement: "bg-teal-50 text-teal-700 border-teal-200",
  abonnement: "bg-red-50 text-red-700 border-red-200",
};

const ROLES: Record<string, string> = {
  super_admin: "EGS",
  administration: "Administration",
  chef: "Chef d'établissement",
  directeur_etudes: "Directeur des études",
  enseignant: "Enseignant",
  comptable: "Comptable",
  caissier: "Caissier",
  secretaire: "Secrétaire",
  educateur: "Éducateur",
};

const CATEGORIES = [
  { id: "", label: "Tout" },
  { id: "compte", label: "Comptes" },
  { id: "eleve", label: "Élèves" },
  { id: "note", label: "Notes" },
  { id: "appel", label: "Appels" },
  { id: "cahier", label: "Cahier de texte" },
  { id: "profil", label: "Profils" },
  { id: "paiement", label: "Paiements" },
  { id: "abonnement", label: "Abonnement" },
];

const PERIODES = [
  { id: "7", label: "7 jours" },
  { id: "30", label: "30 jours" },
  { id: "tout", label: "Tout" },
];

const PAGE = 50;

function valeur(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "oui" : "non";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

function lignesDetails(details: unknown): string[] {
  if (!details || typeof details !== "object") return [];
  const out: string[] = [];
  for (const [cle, v] of Object.entries(details as Record<string, unknown>)) {
    if (cle === "id" || cle.endsWith("_id")) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && "avant" in (v as object)) {
      const d = v as { avant: unknown; apres: unknown };
      out.push(`${cle.replace(/_/g, " ")} : ${valeur(d.avant)} → ${valeur(d.apres)}`);
    } else {
      out.push(`${cle.replace(/_/g, " ")} : ${valeur(v)}`);
    }
  }
  return out;
}

function lien(params: { cat?: string; periode?: string; q?: string; n?: number }) {
  const p = new URLSearchParams();
  if (params.cat) p.set("cat", params.cat);
  if (params.periode && params.periode !== "30") p.set("periode", params.periode);
  if (params.q) p.set("q", params.q);
  if (params.n && params.n > PAGE) p.set("n", String(params.n));
  const s = p.toString();
  return `/directeur/journal${s ? `?${s}` : ""}`;
}

export default async function JournalAudit({
  searchParams,
}: {
  searchParams: { cat?: string; periode?: string; q?: string; n?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: moi } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (moi?.role !== "administration") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Journal d'audit</h1>
        <p className="mt-3 text-sm text-neutral-600">
          Le journal d'audit est réservé au compte administration de l'école.
        </p>
      </main>
    );
  }

  const cat = CATEGORIES.some((c) => c.id === searchParams.cat) ? searchParams.cat ?? "" : "";
  const periode = PERIODES.some((p) => p.id === searchParams.periode) ? searchParams.periode! : "30";
  const q = (searchParams.q ?? "").replace(/[,()%*]/g, " ").trim().slice(0, 60);
  const n = Math.min(Math.max(parseInt(searchParams.n ?? "", 10) || PAGE, PAGE), 1000);

  let requete = supabase
    .from("journal_audit")
    .select("id, acteur_nom, acteur_role, action, cible_libelle, details, created_at")
    .order("created_at", { ascending: false })
    .limit(n + 1);

  if (cat) requete = requete.like("action", `${cat}.%`);
  if (periode !== "tout") {
    const depuis = new Date(Date.now() - parseInt(periode, 10) * 24 * 3600 * 1000).toISOString();
    requete = requete.gte("created_at", depuis);
  }
  if (q) requete = requete.or(`cible_libelle.ilike.%${q}%,acteur_nom.ilike.%${q}%`);

  const { data, error } = await requete;
  const lignes = (data ?? []).slice(0, n);
  const encore = (data ?? []).length > n;

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Journal d'audit</h1>
      <p className="mb-4 mt-1 text-sm text-neutral-500">
        Qui a fait quoi dans votre établissement. Ce journal ne peut être ni modifié ni effacé.
      </p>

      <form action="/directeur/journal" method="get" className="mb-3 flex gap-2">
        {cat && <input type="hidden" name="cat" value={cat} />}
        {periode !== "30" && <input type="hidden" name="periode" value={periode} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Rechercher une personne ou un nom…"
          className="min-w-0 flex-1 rounded-lg border p-2.5 text-sm"
        />
        <button type="submit" className="rounded-lg bg-black px-4 text-sm font-medium text-white">
          Chercher
        </button>
      </form>

      <div className="mb-2 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Link
            key={c.id || "tout"}
            href={lien({ cat: c.id, periode, q })}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              cat === c.id ? "border-black bg-black text-white" : "bg-white text-neutral-700"
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {PERIODES.map((p) => (
          <Link
            key={p.id}
            href={lien({ cat, periode: p.id, q })}
            className={`rounded-full border px-3 py-1 text-xs ${
              periode === p.id ? "border-neutral-900 font-semibold text-neutral-900" : "text-neutral-500"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Impossible de charger le journal : {error.message}
        </div>
      )}

      {!error && lignes.length === 0 && (
        <p className="rounded-xl border bg-white p-6 text-center text-sm text-neutral-500">
          Aucune action enregistrée pour ces critères.
        </p>
      )}

      <ul className="space-y-2">
        {lignes.map((l) => {
          const famille = l.action.split(".")[0];
          const details = lignesDetails(l.details);
          return (
            <li key={l.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    COULEURS[famille] ?? "bg-neutral-100 text-neutral-600 border-neutral-200"
                  }`}
                >
                  {ACTIONS[l.action] ?? l.action}
                </span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {new Date(l.created_at).toLocaleString("fr-FR", {
                    timeZone: "Africa/Abidjan",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {l.cible_libelle && (
                <p className="mt-2 text-sm font-semibold text-neutral-900">{l.cible_libelle}</p>
              )}
              <p className="mt-0.5 text-xs text-neutral-500">
                Par {l.acteur_nom || "Système"}
                {l.acteur_role && <> · {ROLES[l.acteur_role] ?? l.acteur_role}</>}
              </p>
              {details.length > 0 && (
                <ul className="mt-2 space-y-0.5 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600">
                  {details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {encore && (
        <div className="mt-4 text-center">
          <Link
            href={lien({ cat, periode, q, n: n + PAGE })}
            className="inline-block rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Voir plus
          </Link>
        </div>
      )}
    </main>
  );
}
