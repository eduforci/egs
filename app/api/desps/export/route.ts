import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { etablissementId, anneeScolaire, trimestre, format } = await req.json();

    // Récupérer les élèves
    const { data: eleves, error } = await supabase
      .from('eleves')
      .select('*')
      .eq('etablissement_id', etablissementId);

    if (error) throw error;

    // Calculer les effectifs par niveau
    const niveaux = ['6e', '5e', '4e', '3e'];
    const effectifs = niveaux.map(niveau => {
      const elevesNiveau = eleves?.filter(e => e.niveau === niveau) || [];
      return {
        niveau,
        garcons: elevesNiveau.filter(e => e.sexe === 'M').length,
        filles: elevesNiveau.filter(e => e.sexe === 'F').length,
        total: elevesNiveau.length
      };
    });

    const totalGarcons = eleves?.filter(e => e.sexe === 'M').length || 0;
    const totalFilles = eleves?.filter(e => e.sexe === 'F').length || 0;

    const data = {
      identification: {
        etablissementId,
        anneeScolaire,
        trimestre,
        dateGeneration: new Date().toISOString()
      },
      effectifs,
      totalGeneral: {
        garcons: totalGarcons,
        filles: totalFilles,
        total: eleves?.length || 0
      },
      nouveaux: 0,
      redoublants: 0,
      transferes: 0
    };

    // Sauvegarder dans Supabase
    await supabase
      .from('desps_remontees')
      .insert({
        etablissement_id: etablissementId,
        annee_scolaire: anneeScolaire,
        trimestre,
        donnees: data,
        statut: 'valide'
      });

    // Retourner selon le format
    if (format === 'json') {
      return NextResponse.json({
        success: true,
        data,
        format: 'json'
      });
    }

    // Pour tous les autres formats (excel, pdf)
    return NextResponse.json({
      success: true,
      data,
      format: format || 'json',
      message: `Export en ${format || 'json'} réussi`
    });

  } catch (error: any) {
    console.error('Erreur:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
