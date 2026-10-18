import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ROLES = ['administration', 'chef', 'directeur', 'directeur_etudes', 'super_admin'];

// Informations d'en-tête pour la fiche et le PV du conseil de classe :
// établissement, classe, professeur principal, sexe des élèves (pour les effectifs).
export async function GET(req: Request) {
  const classeId = new URL(req.url).searchParams.get('classeId') || '';
  if (!classeId) return NextResponse.json({ error: 'Classe manquante.' }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil || !ROLES.includes(String(profil.role)))
    return NextResponse.json({ error: "Accès réservé à la direction de l'école." }, { status: 403 });

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: classe } = await admin.from('classes')
    .select('id, nom, niveau, annee_scolaire, etablissement_id').eq('id', classeId).single();
  if (!classe) return NextResponse.json({ error: 'Classe introuvable.' }, { status: 404 });
  if (profil.role !== 'super_admin' && classe.etablissement_id !== profil.etablissement_id)
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const { data: etab } = await admin.from('etablissements')
    .select('nom, adresse, telephone, code_etablissement, dren, statut_juridique')
    .eq('id', classe.etablissement_id).single();

  // Professeur principal : complément de service de type PP pour cette classe et cette année
  let professeurPrincipal = '';
  const { data: pp } = await admin.from('complement_service').select('enseignant_id')
    .eq('classe_id', classeId).eq('type', 'PP').eq('annee_scolaire', classe.annee_scolaire).limit(1);
  const idPP = (pp ?? [])[0]?.enseignant_id as string | undefined;
  if (idPP) {
    const { data: p } = await admin.from('profiles').select('nom, prenom').eq('id', idPP).single();
    if (p) professeurPrincipal = `${p.nom ?? ''} ${p.prenom ?? ''}`.trim();
  }

  // Sexe des élèves (colonne facultative : on ignore l'erreur si elle n'existe pas)
  const sexes: Record<string, string> = {};
  const rs = await admin.from('eleves').select('id, sexe').eq('classe_id', classeId);
  if (!rs.error) (rs.data ?? []).forEach((e: any) => { if (e.sexe) sexes[e.id] = String(e.sexe); });

  return NextResponse.json({
    etablissement: etab ?? null,
    classe: { nom: classe.nom, niveau: classe.niveau ?? '', annee_scolaire: classe.annee_scolaire },
    professeurPrincipal,
    sexes,
  });
}
