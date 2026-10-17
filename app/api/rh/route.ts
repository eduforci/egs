import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROLES = ['administration', 'chef', 'directeur', 'directeur_etudes', 'super_admin'];
const HORS_PERSONNEL = ['parent', 'eleve'];

async function contexte() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) };
  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil || !ROLES.includes(String(profil.role)) || !profil.etablissement_id)
    return { erreur: NextResponse.json({ error: "Accès réservé à la direction de l'école." }, { status: 403 }) };
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { admin, user, etab: profil.etablissement_id as string };
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const plusJours = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const TABLE_MANQUANTE = "Les tables RH n'existent pas encore : exécutez le fichier rh_v1.sql dans Supabase.";

export async function GET(req: Request) {
  const ctx = await contexte();
  if ('erreur' in ctx) return ctx.erreur;
  const { admin, etab } = ctx;
  const id = new URL(req.url).searchParams.get('id');

  if (id) {
    const { data: p } = await admin.from('profiles').select('id, nom, prenom, role, fonction, telephone, identifiant, actif, etablissement_id').eq('id', id).single();
    if (!p || p.etablissement_id !== etab || HORS_PERSONNEL.includes(String(p.role)))
      return NextResponse.json({ error: 'Personne introuvable.' }, { status: 404 });
    const d = await admin.from('rh_dossiers').select('*').eq('profile_id', id).maybeSingle();
    if (d.error) return NextResponse.json({ error: TABLE_MANQUANTE }, { status: 500 });
    const { data: conges } = await admin.from('rh_conges').select('*').eq('profile_id', id).order('date_debut', { ascending: false });
    return NextResponse.json({ personne: p, dossier: d.data ?? null, conges: conges ?? [] });
  }

  const { data: profs } = await admin.from('profiles')
    .select('id, nom, prenom, role, fonction, telephone, actif')
    .eq('etablissement_id', etab).not('role', 'in', '(parent,eleve)');
  const dos = await admin.from('rh_dossiers').select('profile_id, poste, type_contrat, date_embauche, date_fin_contrat').eq('etablissement_id', etab);
  if (dos.error) return NextResponse.json({ error: TABLE_MANQUANTE }, { status: 500 });
  const { data: conges } = await admin.from('rh_conges').select('id, profile_id, type, date_debut, date_fin, statut')
    .eq('etablissement_id', etab).gte('date_fin', aujourdhui());
  const parProfil = new Map((dos.data ?? []).map((d: any) => [d.profile_id, d]));
  const limite = plusJours(60);
  const personnel = (profs ?? []).map((p: any) => {
    const d: any = parProfil.get(p.id) ?? null;
    const siens = (conges ?? []).filter((c: any) => c.profile_id === p.id);
    return {
      ...p, dossier: d,
      enConge: siens.some((c: any) => c.statut === 'approuve' && c.date_debut <= aujourdhui() && c.date_fin >= aujourdhui()),
      demandes: siens.filter((c: any) => c.statut === 'demande').length,
      contratBientotFini: !!d?.date_fin_contrat && d.date_fin_contrat <= limite,
    };
  }).sort((a: any, b: any) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
  return NextResponse.json({ personnel });
}

export async function POST(req: Request) {
  const ctx = await contexte();
  if ('erreur' in ctx) return ctx.erreur;
  const { admin, user, etab } = ctx;
  const b = await req.json().catch(() => ({}));
  const echec = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  const verifierPersonne = async (pid: string) => {
    const { data } = await admin.from('profiles').select('etablissement_id, role').eq('id', pid).single();
    return !!data && data.etablissement_id === etab && !HORS_PERSONNEL.includes(String(data.role));
  };
  const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

  if (b.action === 'dossier') {
    if (!b.profileId || !(await verifierPersonne(b.profileId))) return echec('Personne introuvable.', 404);
    const contrats = ['cdi', 'cdd', 'vacataire', 'stagiaire', 'autre'];
    const salaire = Number(String(b.salaire_mensuel ?? '').replace(/\s/g, '').replace(',', '.'));
    const { error } = await admin.from('rh_dossiers').upsert({
      profile_id: b.profileId, etablissement_id: etab,
      poste: texte(b.poste), type_contrat: contrats.includes(b.type_contrat) ? b.type_contrat : null,
      date_embauche: date(b.date_embauche), date_fin_contrat: date(b.date_fin_contrat),
      salaire_mensuel: Number.isFinite(salaire) && salaire > 0 ? salaire : null,
      numero_cnps: texte(b.numero_cnps), diplome: texte(b.diplome),
      contact_urgence_nom: texte(b.contact_urgence_nom), contact_urgence_tel: texte(b.contact_urgence_tel),
      notes: texte(b.notes), mis_a_jour_le: new Date().toISOString(),
    }, { onConflict: 'profile_id' });
    if (error) return echec(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'conge_creer') {
    if (!b.profileId || !(await verifierPersonne(b.profileId))) return echec('Personne introuvable.', 404);
    const types = ['conge_annuel', 'maladie', 'maternite', 'permission', 'autre'];
    const debut = date(b.date_debut), fin = date(b.date_fin);
    if (!types.includes(b.type) || !debut || !fin || fin < debut) return echec('Type ou dates invalides.', 400);
    const { error } = await admin.from('rh_conges').insert({
      etablissement_id: etab, profile_id: b.profileId, type: b.type, date_debut: debut, date_fin: fin,
      motif: texte(b.motif), statut: 'approuve', decide_par: user.id,
    });
    if (error) return echec(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'conge_decider' || b.action === 'conge_supprimer') {
    const { data: c } = await admin.from('rh_conges').select('id, etablissement_id').eq('id', b.id).single();
    if (!c || c.etablissement_id !== etab) return echec('Congé introuvable.', 404);
    const r = b.action === 'conge_supprimer'
      ? await admin.from('rh_conges').delete().eq('id', b.id)
      : ['approuve', 'refuse'].includes(b.statut)
        ? await admin.from('rh_conges').update({ statut: b.statut, decide_par: user.id }).eq('id', b.id)
        : { error: { message: 'Statut invalide.' } };
    if (r.error) return echec(r.error.message);
    return NextResponse.json({ ok: true });
  }

  return echec('Action inconnue.', 400);
}
