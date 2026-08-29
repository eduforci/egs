import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/AdminShell";
import { marquerToutesNotificationsLues } from "./actions";

const roleLabels: Record<string, string> = {
  super_admin: "Super Administrateur",
  chef: "Chef d'établissement",
  directeur_etudes: "Directeur des études",
  enseignant: "Enseignant",
  comptable: "Comptable",
  caissier: "Caissier",
  secretaire: "Secrétaire",
  educateur: "Éducateur",
  parent: "Parent",
  eleve: "Élève",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: trimestreRecent },
    { data: notifications },
    { count: notificationsNonLues },
    { data: messages },
    { count: messagesNonLus },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("prenom, nom, role")
      .eq("id", user?.id ?? "")
      .maybeSingle(),

    supabase
      .from("trimestres")
      .select("annee_scolaire")
      .order("date_debut", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("notifications")
      .select("id, titre, contenu, lien, lu, created_at")
      .eq("destinataire_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(6),

    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("destinataire_id", user?.id ?? "")
      .eq("lu", false),

    supabase
      .from("messages_support")
      .select("id, sujet, statut, created_at, etablissement_id")
      .order("created_at", { ascending: false })
      .limit(6),

    supabase
      .from("messages_support")
      .select("id", { count: "exact", head: true })
      .eq("statut", "nouveau"),
  ]);

  const etablissementIds = Array.from(
    new Set((messages ?? []).map((m) => m.etablissement_id).filter(Boolean))
  );

  const { data: etablissements } =
    etablissementIds.length > 0
      ? await supabase.from("etablissements").select("id, nom").in("id", etablissementIds)
      : { data: [] as { id: string; nom: string }[] };

  const etablissementMap = new Map((etablissements ?? []).map((e) => [e.id, e.nom]));

  const messagesAvecNom = (messages ?? []).map((m) => ({
    ...m,
    etablissement_nom: etablissementMap.get(m.etablissement_id) ?? "—",
  }));

  const fullName =
    `${profile?.prenom ?? ""} ${profile?.nom ?? ""}`.trim() || "Utilisateur";

  const roleLabel = profile?.role ? roleLabels[profile.role] ?? profile.role : "";

  return (
    <AdminShell
      fullName={fullName}
      roleLabel={roleLabel}
      anneeScolaire={trimestreRecent?.annee_scolaire ?? null}
      notifications={notifications ?? []}
      notificationsNonLues={notificationsNonLues ?? 0}
      messages={messagesAvecNom}
      messagesNonLus={messagesNonLus ?? 0}
      marquerToutesNotificationsLues={marquerToutesNotificationsLues}
    >
      {children}
    </AdminShell>
  );
}
