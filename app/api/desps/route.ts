import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET : Récupérer les statistiques
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const etablissementId = url.searchParams.get('etablissementId');
    const anneeScolaire = url.searchParams.get('anneeScolaire') || '2026-2027';
    const trimestre = parseInt(url.searchParams.get('trimestre') || '1');

    if (!etablissementId) {
      return NextResponse.json(
        { error: 'etablissementId est requis' },
        { status: 400 }
      );
    }

    // Récupérer les élèves
    const { data: eleves, error } = await supabase
      .from('eleves')
      .select('*')
      .eq('etablissement_id', etablissementId);

    if (error) throw error;

    // Calculer les effectifs
    const niveaux = ['6e', '5e', '4e', '3e'];
    const effectifs = niveaux.map(niveau => {
      const list = eleves?.filter(e => e.niveau === niveau) || [];
      return {
        niveau,
        garcons: list.filter(e => e.sexe === 'M').length,
        filles: list.filter(e => e.sexe === 'F').length,
        total: list.length
      };
    });

    const totalGarcons = eleves?.filter(e => e.sexe === 'M').length || 0;
    const totalFilles = eleves?.filter(e => e.sexe === 'F').length || 0;
    const total = eleves?.length || 0;

    const data = {
      etablissementId,
      anneeScolaire,
      trimestre,
      effectifs,
      totalGarcons,
      totalFilles,
      total,
      dateGeneration: new Date().toISOString()
    };

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
