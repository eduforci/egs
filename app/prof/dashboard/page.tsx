import PreparerHorsLigne from "./preparer-hors-ligne";
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

  // Cours de l'enseignant : ceux à son nom, et ceux sans nom d'enseignant qui
  // correspondent à une classe + matière qui lui sont affectées.
  const paires = new Set(
    (affectations ?? []).map((a: any) => `${a.classe_id}|${a.matiere_id}`)
  );
  let requeteEdt: any = supabase
    .from("emploi_du_temps")
    .select(
      `id, jour, heure_debut, heure_fin, salle, classe_id, matiere_id, enseignant_id, classes ( nom ), matieres ( nom )`
    )
    .order("heure_debut", { ascending: true });
  requeteEdt =
    classeIds.length > 0
      ? requeteEdt.or(
          `enseignant_id.eq.${user?.id},and(enseignant_id.is.null,classe_id.in.(${classeIds.join(",")}))`
        )
      : requeteEdt.eq("enseignant_id", user?.id);
  const { data: edtBrut } = await requeteEdt;
  const emploiDuTemps = ((edtBrut ?? []) as any[]).filter(
    (c) => c.enseignant_id === user?.id || paires.has(`${c.classe_id}|${c.matiere_id}`)
  );

  // Prochains cours à partir de maintenant (heure de la Côte d'Ivoire = heure UTC)
  const ORDRE_JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const maintenant = new Date();
  const jourActuel = maintenant.getUTCDay();
  const minutesActuelles = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
  const enMinutes = (h: string) => {
    const [hh, mm] = (h ?? "00:00").slice(0, 5).split(":").map(Number);
    return hh * 60 + mm;
  };
  const prochainsCours = emploiDuTemps
    .map((c: any) => {
      const idx = ORDRE_JOURS.indexOf(c.jour);
      if (idx < 0) return null;
      let ecartJours = (idx - jourActuel + 7) % 7;
      // Un cours d'aujourd'hui déjà terminé passe à la semaine suivante
      if (ecartJours === 0 && enMinutes(c.heure_fin) <= minutesActuelles) ecartJours = 7;
      return {
        ...c,
        ecartJours,
        tri: ecartJours * 1440 + enMinutes(c.heure_debut),
        enCours:
          ecartJours === 0 &&
          enMinutes(c.heure_debut) <= minutesActuelles &&
          enMinutes(c.heure_fin) > minutesActuelles,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.tri - b.tri)
    .slice(0, 5) as any[];
  const quand = (c: any) =>
    c.ecartJours === 0
      ? "Aujourd'hui"
      : c.ecartJours === 1
      ? "Demain"
      : JOURS_LABEL[c.jour] ?? c.jour;

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

      <div className="grid grid-cols-3 gap-3">
        <a
          href="/enseignant/appel"
          className="bg-white border rounded-xl p-4 text-center hover:bg-neutral-50"
        >
          <div className="text-2xl">📋</div>
          <div className="text-sm font-medium mt-1">Cahier d'appel</div>
        </a>
        <a
          href="/enseignant/cahier-texte"
          className="bg-white border rounded-xl p-4 text-center hover:bg-neutral-50"
        >
          <div className="text-2xl">📖</div>
          <div className="text-sm font-medium mt-1">Cahier de texte</div>
        </a>
        <a
          href="/enseignant/emploi-du-temps"
          className="bg-white border rounded-xl p-4 text-center hover:bg-neutral-50"
        >
          <div className="text-2xl">📅</div>
          <div className="text-sm font-medium mt-1">Emploi du temps</div>
        </a>
      </div>

      <div className="bg-white border rounded-xl p-4">
        <h2 className="text-base font-semibold mb-3">Prochains cours</h2>
        {prochainsCours.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {prochainsCours.map((c: any) => (
              <li key={c.id} className="flex justify-between gap-3 border-b last:border-0 pb-2 last:pb-0">
                <span>
                  <span className="font-medium">{quand(c)}</span>{" "}
                  {c.heure_debut?.slice(0, 5)}–{c.heure_fin?.slice(0, 5)}
                  {c.enCours && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      En cours
                    </span>
                  )}
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

      <PreparerHorsLigne
        cibles={(affectations ?? [])
          .filter((a: any) => a.classes?.id && a.matieres?.id)
          .map((a: any) => ({
            classeId: a.classes.id,
            matiereId: a.matieres.id,
            nom: `${a.classes.nom} · ${a.matieres.nom}`,
          }))}
      />

      <div>
        <h2 className="text-xl font-semibold mb-1">Mes classes</h2>
        <p className="text-neutral-500 mb-4 text-sm">
          {affectations?.length ?? 0} affectation(s) — touchez une carte pour saisir les notes
        </p>

        {/* MOBILE : cartes entièrement cliquables */}
        <div className="space-y-3 md:hidden">
          {affectations?.map((a: any) => (
            <div key={a.id} className="bg-white border rounded-xl overflow-hidden">
              <a
                href={`/prof/classe/${a.classes?.id}/matiere/${a.matieres?.id}`}
                className="flex items-center justify-between gap-3 p-4 active:bg-neutral-100"
              >
                <div>
                  <div className="text-lg font-semibold">{a.classes?.nom}</div>
                  <div className="text-sm text-neutral-600">{a.matieres?.nom}</div>
                  <div className="text-xs text-neutral-400 mt-0.5">
                    Coefficient {a.matieres?.coefficient_defaut}
                  </div>
                </div>
                <span className="text-sm font-medium text-blue-700 whitespace-nowrap">
                  Saisir les notes →
                </span>
              </a>
              <div className="grid grid-cols-2 border-t divide-x text-center text-sm">
                <a
                  href={`/prof/classes/${a.classes?.id}/matieres/${a.matieres?.id}/trimestre/1/liste-moyennes`}
                  className="py-3 text-blue-700 active:bg-blue-50"
                >
                  Liste des moyennes
                </a>
                <a
                  href={`/prof/classes/${a.classes?.id}/liste`}
                  className="py-3 text-blue-700 active:bg-blue-50"
                >
                  Liste de classe
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* ORDINATEUR / TABLETTE : tableau */}
        <div className="hidden md:block bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-3">Classe</th>
                <th className="p-3">Matière</th>
                <th className="p-3">Coefficient</th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {affectations?.map((a: any) => (
                <tr key={a.id} className="border-t hover:bg-neutral-50">
                  <td className="p-3">{a.classes?.nom}</td>
                  <td className="p-3">{a.matieres?.nom}</td>
                  <td className="p-3">{a.matieres?.coefficient_defaut}</td>
                  <td className="p-3">
                    <a
                      href={`/prof/classe/${a.classes?.id}/matiere/${a.matieres?.id}`}
                      className="inline-block border rounded-md px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                    >
                      Saisir les notes
                    </a>
                  </td>
                  <td className="p-3">
                    <a
                      href={`/prof/classes/${a.classes?.id}/matieres/${a.matieres?.id}/trimestre/1/liste-moyennes`}
                      className="inline-block border rounded-md px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                    >
                      Liste des moyennes
                    </a>
                  </td>
                  <td className="p-3">
                    <a
                      href={`/prof/classes/${a.classes?.id}/liste`}
                      className="inline-block border rounded-md px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                    >
                      Liste de classe
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(!affectations || affectations.length === 0) && (
          <p className="p-4 text-neutral-500 text-sm">
            Aucune classe ne vous a encore été affectée. Contactez votre chef d'établissement.
          </p>
        )}
      </div>
    </main>
  );
}
