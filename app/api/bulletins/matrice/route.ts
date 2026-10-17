import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tableau des moyennes d'une classe pour un trimestre : une ligne par élève, une colonne par matière.
// Chaque ligne vient de generer_bulletin (même calcul que le bulletin officiel).
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const { data: profil } = await supabase.from('profiles').select('role, etablissement_id').eq('id', user.id).single();
  if (!profil || ['parent', 'eleve'].includes(String(profil.role)))
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const url = new URL(req.url);
  const classeId = url.searchParams.get('classeId') || '';
  const trimestre = Number(url.searchParams.get('trimestre'));
  if (!classeId || ![1, 2, 3].includes(trimestre))
    return NextResponse.json({ error: 'Classe ou trimestre invalide.' }, { status: 400 });

  const { data: classe } = await supabase.from('classes').select('id, nom, etablissement_id').eq('id', classeId).single();
  if (!classe) return NextResponse.json({ error: 'Classe introuvable.' }, { status: 404 });
  if (profil.role !== 'super_admin' && classe.etablissement_id !== profil.etablissement_id)
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });

  const { data: etab } = await supabase
    .from('etablissements').select('nom, annee_scolaire_active').eq('id', classe.etablissement_id).single();
  const annee = etab?.annee_scolaire_active ?? '';

  const { data: elevesBruts } = await supabase.from('eleves').select('id, matricule').eq('classe_id', classeId);
  const ids = (elevesBruts ?? []).map((e: any) => e.id as string);
  const { data: profils } = ids.length
    ? await supabase.from('profiles').select('id, nom, prenom').in('id', ids)
    : { data: [] as any[] };
  const parId = new Map((profils ?? []).map((p: any) => [p.id, p]));

  const lignes: any[] = [];
  for (let i = 0; i < ids.length; i += 8) {
    const lot = await Promise.all(
      (elevesBruts ?? []).slice(i, i + 8).map(async (e: any) => {
        const { data } = await supabase.rpc('generer_bulletin', {
          p_eleve_id: e.id, p_trimestre: trimestre, p_annee_scolaire: annee,
        });
        const b: any = data ?? null;
        const p: any = parId.get(e.id);
        return {
          id: e.id as string,
          matricule: (e.matricule ?? '') as string,
          nom: (p?.nom ?? '') as string,
          prenom: (p?.prenom ?? '') as string,
          moyenne: (b?.totaux?.moyenne_generale ?? null) as number | null,
          rang: (b?.totaux?.rang ?? null) as number | null,
          mention: (b?.totaux?.mention ?? null) as string | null,
          decision: (b?.totaux?.decision ?? null) as string | null,
          matieres: ((b?.matieres ?? []) as any[]).map((m) => ({
            matiere: m.matiere as string, moyenne: m.moyenne as number | null,
            coefficient: Number(m.coefficient) || 0, groupe: (m.groupe_bilan ?? null) as string | null,
          })),
        };
      })
    );
    lignes.push(...lot);
  }

  // Colonnes : toutes les matières rencontrées, dans l'ordre du bulletin
  const colonnes: { matiere: string; coefficient: number; groupe: string | null }[] = [];
  for (const l of lignes)
    for (const m of l.matieres)
      if (!colonnes.some((c) => c.matiere === m.matiere))
        colonnes.push({ matiere: m.matiere, coefficient: m.coefficient, groupe: m.groupe });

  lignes.sort((a, b) =>
    (a.rang ?? 9999) - (b.rang ?? 9999) || `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));

  // Statistiques de la classe, matière par matière et en général
  const stat = (vals: number[]) => vals.length
    ? { moyenne: vals.reduce((s, v) => s + v, 0) / vals.length, mini: Math.min(...vals), maxi: Math.max(...vals), nb: vals.length }
    : { moyenne: null, mini: null, maxi: null, nb: 0 };
  const parMatiere = colonnes.map((c) =>
    stat(lignes.map((l) => l.matieres.find((m: any) => m.matiere === c.matiere)?.moyenne)
      .filter((v: any) => typeof v === 'number') as number[]));
  const general = stat(lignes.map((l) => l.moyenne).filter((v: any) => typeof v === 'number') as number[]);
  const admis = lignes.filter((l) => typeof l.moyenne === 'number' && l.moyenne >= 10).length;

  return NextResponse.json({
    classe: classe.nom, ecole: etab?.nom ?? '', annee, trimestre,
    colonnes, parMatiere, general, admis, lignes,
  });
}
