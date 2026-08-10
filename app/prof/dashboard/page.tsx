import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const JOURS_LABEL: Record<string, string> = {
  lundi: "Lundi", mardi: "Mardi", mercredi: "Mercredi",
  jeudi: "Jeudi", vendredi: "Vendredi", samedi: "Samedi",
};

export default async function ProfDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("nom, prenom, identifiant, etablissement_id")
    .eq("id", user?.id)
    .single();

  const { data: etablissement } = profile?.etablissement_id
    ? await supabase
        .from("etablissements")
        .select("nom, logo_url, annee_scolaire_active, devise")
        .eq("id", profile.etablissement_id)
        .single()
    : { data: null };

  const { data: affectations } = await supabase
    .from("affectations_enseignant")
    .select(`id, classe_id, matiere_id, classes ( id, nom, niveau, annee_scolaire ), matieres ( id, nom, coefficient_defaut )`)
    .eq("enseignant_id", user?.id);

  const disciplines = Array.from(
    new Set((affectations ?? []).map((a: any) => a.matieres?.nom).filter(Boolean))
  );

  const classeIds = Array.from(
    new Set((affectations ?? []).map((a: any) => a.classes?.id).filter(Boolean))
  );

  let nbElevesTotal = 0;
  if (classeIds.length > 0) {
    const { count } = await supabase
      .from("eleves")
      .select("id", { count: "exact", head: true })
      .in("classe_id", classeIds);
    nbElevesTotal = count ?? 0;
  }

  const { data: emploiDuTemps } = await supabase
    .from("emploi_du_temps")
    .select(`id, jour, heure_debut, heure_fin, salle, classes ( nom ), matieres ( nom )`)
    .eq("enseignant_id", user?.id)
    .order("heure_debut", { ascending: true });

  const { data: complements } = user?.id
    ? await supabase
        .from("complement_service")
        .select("type, classes ( nom )")
        .eq("enseignant_id", user.id)
    : { data: [] };

  const classesPP = (complements ?? [])
    .filter((c: any) => c.type === "PP")
    .map((c: any) => c.classes?.nom)
    .filter(Boolean);

  return (
    <main className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      {etablissement && (
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          {etablissement.logo_url ? (
            <img
              src={etablissement.logo_url}
              alt={etablissement.nom}
              className="w-8 h-8 rounded-full object-cover border"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 font-semibold text-xs">
              {etablissement.nom?.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="font-medium">{etablissement.nom}</span>
          {etablissement.annee_scolaire_active && (
            <span>· Année {etablissement.annee_scolaire_active}</span>
          )}
        </div>
      )}

      <div>
        <h1 className="text-3xl font-semibold">
          Bonjour {profile?.prenom ?? ""} {profile?.nom ?? ""} 👋
        </h1>
        <p className="text-neutral-500 mt-1">
          {profile?.identifiant && <>Matricule : {profile.identifiant} · </>}
          {disciplines.length > 0
            ? `Enseignant${disciplines.length > 1 ? "e" : ""} de ${disciplines.join(", ")}`
            : "Aucune discipline affectée pour le moment"}
        </p>
        {classesPP.length > 0 && (
          <p className="text-sm text-blue-700 mt-1">
            Professeur principal : {classesPP.join(", ")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{classeIds.length}</div>
          <div className="text-xs text-neutral-500 mt-1">Classes</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{disciplines.length}</div>
          <div className="text-xs text-neutral-500 mt-1">Matières</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{nbElevesTotal}</div>
          <div className="text-xs text-neutral-500 mt-1">Élèves</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/enseignant/appel"
          className="bg-white border rounded-xl p-4 text-center hover:bg-neutral-50"
        >
          <div className="text-2xl">📋</div>
          <div className="text-sm font-medium mt-1">Cahier d'appel</div>
        </Link>
        <Link
          href="/enseignant/emploi-du-temps"
          className="bg-white border rounded-xl p-4 text-center hover:bg-neutral-50"
        >
          <div className="text-2xl">📅</div>
          <div className="text-sm font-medium mt-1">Emploi du temps</div>
        </Link>
      </div>

      <div className="bg-white border rounded-xl p-4">
        <h2 className="text-base font-semibold mb-3">Prochains cours</h2>
        {emploiDuTemps && emploiDuTemps.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {emploiDuTemps.slice(0, 5).map((c: any) => (
              <li key={c.id} className="flex justify-between border-b last:border-0 pb-2 last:pb-0">
                <span>
                  <span className="font-medium">{JOURS_LABEL[c.jour] ?? c.jour}</span>{" "}
                  {c.heure_debut?.slice(0, 5)}–{c.heure_fin?.slice(0, 5)}
                </span>
                <span className="text-neutral-500">
                  {c.matieres?.nom} · {c.classes?.nom}
                  {c.salle ? ` · ${c.salle}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">
            Aucun créneau renseigné pour le moment.
          </p>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-1">Mes classes</h2>
        <p className="text-neutral-500 mb-4 text-sm">
          {affectations?.length ?? 0} affectation(s) — cliquez pour saisir les notes
        </p>

        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-3">Classe</th>
                <th className="p-3">Matière</th>
                <th className="p-3">Coefficient</th>
              </tr>
            </thead>
            <tbody>
              {affectations?.map((a: any) => (
                <tr key={a.id} className="border-t hover:bg-neutral-50">
                  <td className="p-0" colSpan={3}>
                    <Link
                      href={`/prof/classe/${a.classes?.id}/matiere/${a.matieres?.id}`}
                      className="grid grid-cols-3 p-3 gap-0"
                    >
                      <span>{a.classes?.nom}</span>
                      <span>{a.matieres?.nom}</span>
                      <span>{a.matieres?.coefficient_defaut}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!affectations || affectations.length === 0) && (
            <p className="p-4 text-neutral-500 text-sm">
              Aucune classe ne vous a encore été affectée. Contactez votre chef d'établissement.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
