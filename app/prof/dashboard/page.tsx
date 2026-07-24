import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const JOURS: Record<number, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

export default async function ProfDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- Profil de l'enseignant connecté ----
  const { data: profile } = await supabase
    .from("profiles")
    .select("nom, prenom, identifiant, etablissement_id")
    .eq("id", user?.id)
    .single();

  // ---- Établissement (identité visuelle) ----
  const { data: etablissement } = profile?.etablissement_id
    ? await supabase
        .from("etablissements")
        .select("nom, logo_url, annee_scolaire_active, devise")
        .eq("id", profile.etablissement_id)
        .single()
    : { data: null };

  // ---- Classes / matières affectées (section existante, inchangée) ----
  const { data: affectations } = await supabase
    .from("affectations_enseignant")
    .select(
      `id, classes ( id, nom, niveau, annee_scolaire ), matieres ( id, nom, coefficient_defaut )`
    )
    .eq("enseignant_id", user?.id);

  const disciplines = Array.from(
    new Set((affectations ?? []).map((a: any) => a.matieres?.nom).filter(Boolean))
  );

  // ---- Emploi du temps ----
  const { data: emploiDuTemps } = await supabase
    .from("emplois_du_temps")
    .select(`id, jour_semaine, heure_debut, heure_fin, salle, classes ( nom ), matieres ( nom )`)
    .eq("enseignant_id", user?.id)
    .order("jour_semaine", { ascending: true })
    .order("heure_debut", { ascending: true });

  // ---- Notifications / messages de la direction ----
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, titre, contenu, created_at, destinataire_role")
    .or(
      `destinataire_id.eq.${user?.id},and(destinataire_role.eq.enseignant,etablissement_id.eq.${profile?.etablissement_id}),and(destinataire_id.is.null,destinataire_role.is.null,etablissement_id.eq.${profile?.etablissement_id})`
    )
    .order("created_at", { ascending: false })
    .limit(5);

  // ---- Bulletins en attente (parmi les élèves de l'enseignant) ----
  const classeIds = Array.from(
    new Set((affectations ?? []).map((a: any) => a.classes?.id).filter(Boolean))
  );

  let bulletinsEnAttente = 0;
  if (classeIds.length > 0) {
    const { data: eleves } = await supabase
      .from("eleves")
      .select("id")
      .in("classe_id", classeIds);

    const eleveIds = (eleves ?? []).map((e) => e.id);

    if (eleveIds.length > 0) {
      const { count } = await supabase
        .from("bulletins")
        .select("id", { count: "exact", head: true })
        .in("eleve_id", eleveIds)
        .is("valide_at", null);

      bulletinsEnAttente = count ?? 0;
    }
  }

  return (
    <main className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Identité de l'établissement */}
      {etablissement && (
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          {etablissement.logo_url ? (
            <img
              src={etablissement.logo_url}
              alt={etablissement.nom}
              className="w-8 h-8 rounded-full object-cover border"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-role-prof/10 flex items-center justify-center text-role-prof font-display font-semibold text-xs">
              {etablissement.nom?.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="font-medium text-chalk">{etablissement.nom}</span>
          {etablissement.annee_scolaire_active && (
            <span>· Année {etablissement.annee_scolaire_active}</span>
          )}
          {etablissement.devise && (
            <span className="italic hidden sm:inline">· « {etablissement.devise} »</span>
          )}
        </div>
      )}

      {/* En-tête enseignant */}
      <div>
        <h1 className="font-display text-3xl font-semibold">
          Bonjour {profile?.prenom ?? ""} {profile?.nom ?? ""}
        </h1>
        <p className="text-neutral-500 mt-1">
          {profile?.identifiant && <>Matricule : {profile.identifiant} · </>}
          {disciplines.length > 0
            ? `Enseignant${disciplines.length > 1 ? "e" : ""} de ${disciplines.join(", ")}`
            : "Aucune discipline affectée pour le moment"}
        </p>
      </div>

      {/* Cartes résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Emploi du temps */}
        <div className="bg-white border rounded-xl p-4">
          <h2 className="font-display text-base font-semibold mb-3">
            Emploi du temps
          </h2>
          {emploiDuTemps && emploiDuTemps.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {emploiDuTemps.map((c: any) => (
                <li key={c.id} className="flex justify-between border-b last:border-0 pb-2 last:pb-0">
                  <span>
                    <span className="font-medium">{JOURS[c.jour_semaine] ?? c.jour_semaine}</span>{" "}
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

        {/* Notifications / messages de la direction */}
        <div className="bg-white border rounded-xl p-4">
          <h2 className="font-display text-base font-semibold mb-3">
            Messages &amp; notifications
          </h2>
          {notifications && notifications.length > 0 ? (
            <ul className="space-y-3 text-sm">
              {notifications.map((n: any) => (
                <li key={n.id} className="border-b last:border-0 pb-2 last:pb-0">
                  <p className="font-medium">{n.titre}</p>
                  {n.contenu && <p className="text-neutral-500">{n.contenu}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">Aucun message pour le moment.</p>
          )}
        </div>
      </div>

      {/* Bulletins en attente */}
      {bulletinsEnAttente > 0 && (
        <div className="bg-role-prof/5 border border-role-prof/20 rounded-xl p-4 text-sm">
          <span className="font-medium text-role-prof">
            {bulletinsEnAttente} bulletin{bulletinsEnAttente > 1 ? "s" : ""}
          </span>{" "}
          en attente de validation parmi vos élèves.
        </div>
      )}

      {/* Mes classes — section existante, inchangée */}
      <div>
        <h2 className="font-display text-xl font-semibold mb-1">Mes classes</h2>
        <p className="text-neutral-500 mb-4 text-sm">
          {affectations?.length ?? 0} affectation(s) enregistrée(s)
        </p>

        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-3">Classe</th>
                <th className="p-3">Niveau</th>
                <th className="p-3">Matière</th>
                <th className="p-3">Coefficient</th>
                <th className="p-3">Année scolaire</th>
              </tr>
            </thead>
            <tbody>
              {affectations?.map((a: any) => (
                <tr key={a.id} className="border-t hover:bg-neutral-50">
                  <td className="p-0" colSpan={5}>
                    <Link
                      href={`/prof/classe/${a.classes?.id}/matiere/${a.matieres?.id}`}
                      className="grid grid-cols-5 p-3 gap-0"
                    >
                      <span>{a.classes?.nom}</span>
                      <span>{a.classes?.niveau}</span>
                      <span>{a.matieres?.nom}</span>
                      <span>{a.matieres?.coefficient_defaut}</span>
                      <span>{a.classes?.annee_scolaire}</span>
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
          
