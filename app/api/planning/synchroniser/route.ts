import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { synchroniserAffectations, conflitLangue, auditerLangues, garderLangue } from '@/lib/planning-affectations';

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

  const admLangue = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Contrôle avant d'affecter un enseignant à une matière : une seule langue vivante par enseignant
  if (body.action === 'verifier') {
    if (!body.enseignantId || !body.matiereId) return NextResponse.json({ conflit: null });
    return NextResponse.json({ conflit: await conflitLangue(admLangue, body.enseignantId, body.matiereId) });
  }
  if (body.action === 'audit') {
    return NextResponse.json({ conflits: await auditerLangues(admLangue, profil.etablissement_id as string) });
  }
  if (body.action === 'garder_langue') {
    if (!body.enseignantId || !String(body.langue ?? '').startsWith('lv2_')) return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
    const { data: ens } = await admLangue.from('profiles').select('etablissement_id').eq('id', body.enseignantId).single();
    if (!ens || ens.etablissement_id !== profil.etablissement_id) return NextResponse.json({ error: 'Enseignant introuvable.' }, { status: 404 });
    return NextResponse.json({ ok: true, ...(await garderLangue(admLangue, profil.etablissement_id as string, body.enseignantId, body.langue)) });
  }

  // Un enseignant vient d'être choisi (ou retiré) pour une matière d'une classe : on met à jour ses cours déjà placés.
  if (body.action === 'creneaux') {
    const adm = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { classeId, matiereId } = body as { classeId?: string; matiereId?: string };
    const profId: string | null = typeof body.enseignantId === 'string' && body.enseignantId ? body.enseignantId : null;
    if (!classeId || !matiereId) return NextResponse.json({ error: 'Classe ou matière manquante.' }, { status: 400 });
    const { data: classe } = await adm.from('classes').select('etablissement_id').eq('id', classeId).single();
    if (!classe || classe.etablissement_id !== profil.etablissement_id) return NextResponse.json({ error: 'Classe introuvable.' }, { status: 404 });

    const { data: cibles } = await adm.from('emploi_du_temps').select('id, jour, heure_debut, heure_fin, enseignant_id')
      .eq('classe_id', classeId).eq('matiere_id', matiereId);
    const aTraiter = (cibles ?? []) as any[];
    if (profId) {
      const msg = await conflitLangue(adm, profId, matiereId);
      if (msg) return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (!profId) {
      const ids = aTraiter.filter((c) => c.enseignant_id).map((c) => c.id as string);
      if (ids.length > 0) await adm.from('emploi_du_temps').update({ enseignant_id: null }).in('id', ids);
      return NextResponse.json({ ok: true, misAJour: ids.length, conflits: 0 });
    }
    // créneaux où cet enseignant donne déjà un autre cours
    const { data: pris } = await adm.from('emploi_du_temps').select('id, jour, heure_debut, heure_fin')
      .eq('enseignant_id', profId).eq('etablissement_id', profil.etablissement_id);
    const ciblesIds = new Set(aTraiter.map((c) => c.id as string));
    const occupes = ((pris ?? []) as any[]).filter((x) => !ciblesIds.has(x.id));
    const chevauche = (a: any, b: any) => a.jour === b.jour && String(a.heure_debut) < String(b.heure_fin) && String(b.heure_debut) < String(a.heure_fin);
    const ok: string[] = [];
    let conflits = 0;
    for (const c of aTraiter) {
      if (c.enseignant_id === profId) continue;
      if (occupes.some((o) => chevauche(o, c))) { conflits++; continue; }
      ok.push(c.id);
    }
    if (ok.length > 0) {
      const { error } = await adm.from('emploi_du_temps').update({ enseignant_id: profId }).in('id', ok);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, misAJour: ok.length, conflits });
  }

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
