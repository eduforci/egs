import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { corrigerGroupes, GROUPES_BILAN } from '@/lib/matieres-groupes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROLES = ['administration', 'chef', 'directeur', 'directeur_etudes', 'super_admin'];

// Matières d'une classe : modifier un coefficient, le groupe d'une matière (Lettres / Sciences / Autres),
// ou remettre d'aplomb les groupes de toutes les matières de l'école.
export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil || !ROLES.includes(String(profil.role)) || !profil.etablissement_id)
    return NextResponse.json({ error: "Accès réservé à la direction de l'école." }, { status: 403 });
  const etab = profil.etablissement_id as string;

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const b = await req.json().catch(() => ({}));
  const echec = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  if (b.action === 'coefficient') {
    const coef = Number(b.coefficient);
    if (!Number.isFinite(coef) || coef < 0 || coef > 20) return echec('Le coefficient doit être un nombre entre 0 et 20.', 400);
    const { data: ligne } = await admin.from('classes_matieres').select('id, classe_id').eq('id', b.classeMatiereId).single();
    if (!ligne) return echec('Matière de la classe introuvable.', 404);
    const { data: classe } = await admin.from('classes').select('etablissement_id').eq('id', ligne.classe_id).single();
    if (!classe || classe.etablissement_id !== etab) return echec('Accès refusé.', 403);
    const { error } = await admin.from('classes_matieres').update({ coefficient: coef }).eq('id', ligne.id);
    if (error) return echec(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'groupe') {
    if (!GROUPES_BILAN.includes(b.groupe)) return echec('Groupe invalide.', 400);
    const { data: m } = await admin.from('matieres').select('id, etablissement_id').eq('id', b.matiereId).single();
    if (!m || m.etablissement_id !== etab) return echec('Matière introuvable.', 404);
    const { error } = await admin.from('matieres').update({ groupe_bilan: b.groupe }).eq('id', m.id);
    if (error) return echec(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'corriger_groupes') {
    return NextResponse.json({ ok: true, corrigees: await corrigerGroupes(admin, etab) });
  }

  return echec('Action inconnue.', 400);
}
