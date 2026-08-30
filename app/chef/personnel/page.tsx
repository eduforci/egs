import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = {
  enseignant: "Enseignant",
  directeur_etudes: "Directeur des études",
  comptable: "Comptable",
  secretaire: "Secrétaire",
  educateur: "Éducateur",
  caissier: "Caissier",
};

const roleStyles: Record<string, string> = {
  enseignant: "bg-violet-50 text-violet-700 border-violet-200",
  directeur_etudes: "bg-blue-50 text-blue-700 border-blue-200",
  comptable: "bg-teal-50 text-teal-700 border-teal-200",
  secretaire: "bg-pink-50 text-pink-700 border-pink-200",
  educateur: "bg-orange-50 text-orange-700 border-orange-200",
  caissier: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
        roleStyles[role] ?? "bg-neutral-100 text-neutral-600 border-neutral-200"
      }`}
    >
      {roleLabels[role] ?? role}
    </span>
  );
}

type Staff = {
  id: string;
  role: string;
  nom: string;
  prenom: string;
  identifiant: string | null;
};

type Metric = { label: string; value: number };

export default async function PersonnelSupervision() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: chefProfil } = await supabase
    .from("profiles")
    .select("etablissement_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const etablissementId = chefProfil?.etablissement_id;

  // Trimestre en cours : date_debut <= aujourd'hui <= date_fin
  const today = new Date().toISOString().slice(0, 10);

  const { data: trimestreActif } = await supabase
    .from("trimestres")
    .select("id, nom, annee_scolaire, date_debut, date_fin")
    .eq("etablissement_id", etablissementId ?? "")
    .lte("date_debut", today)
    .gte("date_fin", today)
    .maybeSingle();

  // Si aucun trimestre actif trouvé (entre deux trimestres), on prend le plus récent comme repli
  const { data: trimestreRepli } = trimestreActif
    ? { data: null }
    : await supabase
        .from("trimestres")
        .select("id, nom, annee_scolaire, date_debut, date_fin")
        .eq("etablissement_id", etablissementId ?? "")
        .order("date_debut", { ascending: false })
        .limit(1)
        .maybeSingle();

  const trimestre = trimestreActif ?? trimestreRepli;
  const depuisIso = trimestre?.date_debut
    ? new Date(trimestre.date_debut).toISOString()
    : new Date(new Date().getFullYear(), 0, 1).toISOString();

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, role, nom, prenom, identifiant")
    .eq("etablissement_id", etablissementId ?? "")
    .in("role", [
      "enseignant",
      "directeur_etudes",
      "comptable",
      "secretaire",
      "educateur",
      "caissier",
    ])
    .order("role")
    .order("nom");

  const staffIds = (staff ?? []).map((s) => s.id);

  const [
    { data: notes },
    { data: absencesSaisies },
    { data: absencesValidees },
    { data: depensesCreees },
    { data: depensesValidees },
    { data: recettesCreees },
    { data: paiementsTraites },
    { data: documentsGeneres },
  ] = await Promise.all([
    staffIds.length
      ? supabase.from("notes").select("enseignant_id").in("enseignant_id", staffIds).gte("created_at", depuisIso)
      : Promise.resolve({ data: [] as { enseignant_id: string }[] }),

    staffIds.length
      ? supabase.from("absences").select("enseignant_id").in("enseignant_id", staffIds).gte("created_at", depuisIso)
      : Promise.resolve({ data: [] as { enseignant_id: string }[] }),

    staffIds.length
      ? supabase.from("absences").select("valide_par").in("valide_par", staffIds).gte("created_at", depuisIso)
      : Promise.resolve({ data: [] as { valide_par: string }[] }),

    staffIds.length
      ? supabase.from("depenses").select("cree_par").eq("etablissement_id", etablissementId ?? "").in("cree_par", staffIds).gte("created_at", depuisIso)
      : Promise.resolve({ data: [] as { cree_par: string }[] }),

    staffIds.length
      ? supabase.from("depenses").select("validee_par").eq("etablissement_id", etablissementId ?? "").in("validee_par", staffIds).gte("created_at", depuisIso)
      : Promise.resolve({ data: [] as { validee_par: string }[] }),

    staffIds.length
      ? supabase.from("recettes").select("cree_par").eq("etablissement_id", etablissementId ?? "").in("cree_par", staffIds).gte("created_at", depuisIso)
      : Promise.resolve({ data: [] as { cree_par: string }[] }),

    staffIds.length
      ? supabase.from("paiements").select("caissier_id").eq("etablissement_id", etablissementId ?? "").in("caissier_id", staffIds).gte("created_at", depuisIso)
      : Promise.resolve({ data: [] as { caissier_id: string }[] }),

    staffIds.length
      ? supabase.from("documents_administratifs").select("genere_par").in("genere_par", staffIds).gte("created_at", depuisIso)
      : Promise.resolve({ data: [] as { genere_par: string }[] }),
  ]);

  const countBy = <T extends Record<string, string>>(
    rows: T[] | null,
    key: keyof T
  ) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const id = row[key];
      if (!id) continue;
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  };

  const notesParEnseignant = countBy(notes, "enseignant_id");
  const absencesSaisiesParEnseignant = countBy(absencesSaisies, "enseignant_id");
  const absencesValideesParUser = countBy(absencesValidees, "valide_par");
  const depensesCreeesParUser = countBy(depensesCreees, "cree_par");
  const depensesValideesParUser = countBy(depensesValidees, "validee_par");
  const recettesCreeesParUser = countBy(recettesCreees, "cree_par");
  const paiementsParCaissier = countBy(paiementsTraites, "caissier_id");
  const documentsGeneresParUser = countBy(documentsGeneres, "genere_par");

  function metriquesPourStaff(s: Staff): Metric[] {
    switch (s.role) {
      case "enseignant":
        return [
          { label: "Notes saisies", value: notesParEnseignant.get(s.id) ?? 0 },
          { label: "Absences enregistrées", value: absencesSaisiesParEnseignant.get(s.id) ?? 0 },
        ];
      case "directeur_etudes":
        return [
          { label: "Absences validées", value: absencesValideesParUser.get(s.id) ?? 0 },
          { label: "Dépenses validées", value: depensesValideesParUser.get(s.id) ?? 0 },
        ];
      case "comptable":
        return [
          { label: "Dépenses créées", value: depensesCreeesParUser.get(s.id) ?? 0 },
          { label: "Recettes créées", value: recettesCreeesParUser.get(s.id) ?? 0 },
        ];
      case "caissier":
        return [{ label: "Paiements traités", value: paiementsParCaissier.get(s.id) ?? 0 }];
      case "secretaire":
        return [{ label: "Documents générés", value: documentsGeneresParUser.get(s.id) ?? 0 }];
      case "educateur":
        return [{ label: "Absences validées", value: absencesValideesParUser.get(s.id) ?? 0 }];
      default:
        return [];
    }
  }

  const groupes = ["enseignant", "directeur_etudes", "comptable", "caissier", "secretaire", "educateur"]
    .map((role) => ({
      role,
      membres: (staff ?? []).filter((s) => s.role === role),
    }))
    .filter((g) => g.membres.length > 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
              Supervision du personnel
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              Activité du{" "}
              {trimestre?.nom
                ? `${trimestre.nom} (${trimestre.annee_scolaire})`
                : "trimestre en cours"}
              .
            </p>
          </div>

          <Link
            href="/chef/personnel/nouveau"
            className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            + Nouveau membre
          </Link>
        </header>

        {groupes.length === 0 && (
          <p className="rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-500">
            Aucun membre du personnel enregistré pour le moment.
          </p>
        )}

        <div className="space-y-6">
          {groupes.map((groupe) => (
            <div
              key={groupe.role}
              className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
            >
              <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-3">
                <RoleBadge role={groupe.role} />
                <span className="text-xs text-neutral-500">
                  {groupe.membres.length} membre(s)
                </span>
              </div>

              <ul className="divide-y divide-neutral-100">
                {groupe.membres.map((s) => {
                  const metriques = metriquesPourStaff(s as Staff);
                  const initials = `${s.prenom?.charAt(0) ?? ""}${s.nom?.charAt(0) ?? ""}`.toUpperCase();

                  return (
                    <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">
                          {initials || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-900">
                            {s.prenom} {s.nom}
                          </p>
                          {s.identifiant && (
                            <p className="font-mono text-xs text-neutral-400">{s.identifiant}</p>
                          )}
                        </div>
                      </div>

                      {metriques.length > 0 ? (
                        <div className="flex shrink-0 gap-4">
                          {metriques.map((m) => (
                            <div key={m.label} className="text-right">
                              <p className="text-lg font-semibold text-neutral-900">{m.value}</p>
                              <p className="whitespace-nowrap text-xs text-neutral-400">{m.label}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="shrink-0 text-xs text-neutral-400">
                          Suivi non disponible
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
    }
