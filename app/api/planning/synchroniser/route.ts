import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { synchroniserAffectations } from '@/lib/planning-affectations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROLES = ['administration', 'chef', 'directeur', 'directeur_etudes', 'super_admin'];

// Rattache aux classes les matières et les enseignants qui figurent dans les emplois du temps.
// Sans classeIds : toutes les classes de l'école.
export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil || !ROLES.includes(String(profil.role)) || !profil.etablissement_id)
    return NextResponse.json({ error: "Accès réservé à la direction de l'école." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const demandees: string[] = Array.isArray(body.classeIds) ? body.classeIds.filter((x: unknown) => typeof x === 'string') : [];

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    // on ne touche qu'aux classes de cette école
    let classes: string[] | undefined;
    if (demandees.length > 0) {
      const { data } = await admin.from('classes').select('id').eq('etablissement_id', profil.etablissement_id).in('id', demandees);
      const trouvees: string[] = (data ?? []).map((c: any) => c.id as string);
      if (trouvees.length === 0) return NextResponse.json({ ok: true, matieresAjoutees: 0, affectationsAjoutees: 0, affectationsRemplacees: 0 });
      classes = trouvees;
    }
    const bilan = await synchroniserAffectations(admin, profil.etablissement_id as string, classes);
    return NextResponse.json({ ok: true, ...bilan });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 });
  }
}
