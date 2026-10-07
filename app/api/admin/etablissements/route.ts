import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { journaliser } from "@/lib/audit";

const STATUTS = ["actif", "en_attente", "suspendu", "expire"];

async function verifierSuperAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "super_admin") {
    return { erreur: NextResponse.json({ error: "Accès réservé à l'administrateur de la plateforme." }, { status: 403 }) };
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return { admin, userId: user.id };
}

export async function GET() {
  const v = await verifierSuperAdmin();
  if (v.erreur) return v.erreur;

  const { data, error } = await v.admin!
    .from("etablissements")
    .select("id, nom, ville, code_etablissement, code_drena, statut, date_debut_abonnement, date_fin_abonnement, created_at")
    .order("nom");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ etablissements: data ?? [] });
}

export async function POST(request: Request) {
  const v = await verifierSuperAdmin();
  if (v.erreur) return v.erreur;

  const { id, statut, dateFin, dateDebut } = await request.json();
  if (!id) return NextResponse.json({ error: "Établissement manquant." }, { status: 400 });

  const { data: avant } = await v.admin!
    .from("etablissements")
    .select("nom, statut, date_fin_abonnement")
    .eq("id", id)
    .maybeSingle();

  const maj: Record<string, string | null> = {};

  if (statut !== undefined) {
    if (!STATUTS.includes(statut)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }
    maj.statut = statut;
  }
  if (dateFin !== undefined) maj.date_fin_abonnement = dateFin || null;
  if (dateDebut !== undefined) maj.date_debut_abonnement = dateDebut || null;

  if (Object.keys(maj).length === 0) {
    return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
  }

  const { data, error } = await v.admin!
    .from("etablissements")
    .update(maj)
    .eq("id", id)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Établissement introuvable." }, { status: 500 });
  }
  if (avant) {
    if (statut !== undefined && avant.statut !== statut) {
      await journaliser(v.admin!, {
        etablissementId: id,
        acteurId: v.userId,
        action: "abonnement.statut",
        cibleType: "etablissement",
        cibleId: id,
        cibleLibelle: avant.nom,
        details: { statut: { avant: avant.statut, apres: statut } },
      });
    }
    if (dateFin !== undefined && (avant.date_fin_abonnement ?? null) !== (dateFin || null)) {
      await journaliser(v.admin!, {
        etablissementId: id,
        acteurId: v.userId,
        action: "abonnement.date_fin",
        cibleType: "etablissement",
        cibleId: id,
        cibleLibelle: avant.nom,
        details: { date_fin: { avant: avant.date_fin_abonnement ?? null, apres: dateFin || null } },
      });
    }
  }

  return NextResponse.json({ success: true });
}
