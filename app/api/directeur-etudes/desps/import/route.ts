import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, etablissement_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'directeur_etudes') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { fichier_importe } = await req.json();

  if (!fichier_importe?.annee_scolaire || !fichier_importe?.trimestre || !fichier_importe?.niveaux) {
    return NextResponse.json({ error: 'Fichier invalide : champs manquants' }, { status: 400 });
  }

  const { data: statsActuelles, error: statsError } = await supabase.rpc('calculer_stats_desps', {
    p_etablissement_id: profile.etablissement_id,
    p_annee_scolaire: fichier_importe.annee_scolaire,
    p_trimestre: fichier_importe.trimestre,
  });

  if (statsError) {
    return NextResponse.json({ error: statsError.message }, { status: 500 });
  }

  const actuelsMap = new Map(
    (statsActuelles.niveaux || []).map((n: any) => [n.niveau, n])
  );
  const importesMap = new Map(
    fichier_importe.niveaux.map((n: any) => [n.niveau, n])
  );

  const tousNiveaux = new Set([...actuelsMap.keys(), ...importesMap.keys()]);
  const differences: any[] = [];

  for (const niveau of tousNiveaux) {
    const actuel = actuelsMap.get(niveau);
    const importe = importesMap.get(niveau);

    if (!actuel || !importe) {
      differences.push({ niveau, type: 'niveau_absent', actuel, importe });
      continue;
    }

    const champsACles = ['garcons', 'filles', 'total', 'nouveaux', 'redoublants'] as const;
    const ecarts = champsACles.filter((champ) => actuel[champ] !== importe[champ]);

    if (ecarts.length > 0) {
      differences.push({ niveau, type: 'ecart_valeurs', champs: ecarts, actuel, importe });
    }
  }

  return NextResponse.json({
    coherent: differences.length === 0,
    differences,
    statsActuelles,
    fichierImporte: fichier_importe,
  });
                              }
