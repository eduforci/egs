import { SupabaseClient } from '@supabase/supabase-js';

export class DespsEngine {
  constructor(private supabase: SupabaseClient) {}

  async collectData(params: {
    etablissementId: string;
    anneeScolaire: string;
    trimestre: number;
  }) {
    // 1. Récupérer tous les élèves de l'établissement
    const { data: eleves, error } = await this.supabase
      .from('eleves')
      .select(`
        id,
        nom,
        prenom,
        sexe,
        niveau,
        date_inscription,
        statut,
        classes:classe_id (
          id,
          nom
        )
      `)
      .eq('etablissement_id', params.etablissementId)
      .eq('annee_scolaire', params.anneeScolaire);

    if (error) throw error;

    // 2. Calculer les effectifs par niveau
    const niveaux = ['6e', '5e', '4e', '3e'];
    const effectifs = niveaux.map(niveau => {
      const elevesNiveau = eleves.filter(e => e.niveau === niveau);
      return {
        niveau,
        garcons: elevesNiveau.filter(e => e.sexe === 'M').length,
        filles: elevesNiveau.filter(e => e.sexe === 'F').length,
        total: elevesNiveau.length
      };
    });

    // 3. Calculer les nouveaux élèves
    const nouveaux = eleves.filter(e => {
      const dateInscription = new Date(e.date_inscription);
      // Vérifier si inscription dans le trimestre
      return dateInscription.getMonth() < 3; // Exemple simplifié
    }).length;

    // 4. Calculer les redoublants
    const redoublants = eleves.filter(e => e.statut === 'redoublant').length;

    // 5. Totaux généraux
    const totalGarcons = eleves.filter(e => e.sexe === 'M').length;
    const totalFilles = eleves.filter(e => e.sexe === 'F').length;

    return {
      identification: {
        etablissementId: params.etablissementId,
        anneeScolaire: params.anneeScolaire,
        trimestre: params.trimestre,
        dateGeneration: new Date().toISOString()
      },
      effectifs,
      nouveaux,
      redoublants,
      transferes: 0, // À calculer selon votre logique
      totalGeneral: {
        garcons: totalGarcons,
        filles: totalFilles,
        total: eleves.length
      }
    };
  }
}
