import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DespsEngine } from '@/lib/desps/engine';
import { generateExcel } from '@/lib/desps/formats/excel';
import { generatePDF } from '@/lib/desps/formats/pdf';

// Initialisation Supabase (côté serveur)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { etablissementId, anneeScolaire, trimestre, format } = await req.json();

    // 1. Le moteur calcule les statistiques
    const engine = new DespsEngine(supabase);
    const data = await engine.collectData({ etablissementId, anneeScolaire, trimestre });

    // 2. Sauvegarde dans Supabase
    const { data: remontee, error } = await supabase
      .from('desps_remontees')
      .insert({
        etablissement_id: etablissementId,
        annee_scolaire: anneeScolaire,
        trimestre: trimestre,
        donnees: data,
        statut: 'valide'
      })
      .select()
      .single();

    if (error) throw error;

    // 3. Génération du fichier selon le format
    let fileBuffer: Buffer;
    let fileName: string;
    let contentType: string;

    switch (format) {
      case 'json':
        fileBuffer = Buffer.from(JSON.stringify(data, null, 2));
        fileName = `KALAN_DESPS_${anneeScolaire}_T${trimestre}.json`;
        contentType = 'application/json';
        break;

      case 'excel':
        fileBuffer = await generateExcel(data);
        fileName = `KALAN_DESPS_${anneeScolaire}_T${trimestre}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;

      case 'pdf':
        fileBuffer = await generatePDF(data);
        fileName = `KALAN_DESPS_${anneeScolaire}_T${trimestre}.pdf`;
        contentType = 'application/pdf';
        break;

      default:
        throw new Error('Format non supporté');
    }

    // 4. Upload sur Supabase Storage
    const { data: upload, error: uploadError } = await supabase.storage
      .from('desps-files')
      .upload(`${remontee.id}/${fileName}`, fileBuffer, {
        contentType: contentType,
        cacheControl: '3600'
      });

    if (uploadError) throw uploadError;

    // 5. Renvoie l'URL du fichier
    const { data: urlData } = supabase.storage
      .from('desps-files')
      .getPublicUrl(`${remontee.id}/${fileName}`);

    return NextResponse.json({
      success: true,
      remonteeId: remontee.id,
      url: urlData.publicUrl,
      fileName: fileName
    });

  } catch (error: any) {
    console.error('Erreur export DESPS:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
