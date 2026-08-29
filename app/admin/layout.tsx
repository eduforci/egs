import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/AdminShell";

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

  const [{ data: profile }, { data: trimestreRecent }] = await Promise.all([
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
  ]);

  const fullName =
    `${profile?.prenom ?? ""} ${profile?.nom ?? ""}`.trim() || "Utilisateur";

  const roleLabel = profile?.role
    ? roleLabels[profile.role] ?? profile.role
    : "";

  return (
    <AdminShell
      fullName={fullName}
      roleLabel={roleLabel}
      anneeScolaire={trimestreRecent?.annee_scolaire ?? null}
    >
      {children}
    </AdminShell>
  );
}
