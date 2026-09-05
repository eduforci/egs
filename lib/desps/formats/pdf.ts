// Version simplifiée du générateur PDF (sans dépendances externes)

export async function generatePDF(data: any): Promise<Buffer> {
  // Construction du HTML pour le PDF
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Statistiques DESPS</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    h1 { text-align: center; color: #1a56db; }
    .info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1a56db; color: white; padding: 12px; text-align: center; }
    td { border: 1px solid #d1d5db; padding: 10px; text-align: center; }
    .total { background: #f3f4f6; font-weight: bold; }
    .footer { text-align: center; margin-top: 40px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <h1>📊 STATISTIQUES DESPS</h1>
  
  <div class="info">
    <p><strong>Établissement :</strong> ${data.identification?.etablissementId || 'N/A'}</p>
    <p><strong>Année scolaire :</strong> ${data.identification?.anneeScolaire || 'N/A'}</p>
    <p><strong>Trimestre :</strong> ${data.identification?.trimestre || 'N/A'}</p>
    <p><strong>Date de génération :</strong> ${new Date().toLocaleDateString()}</p>
  </div>

  <h2>Effectifs par niveau</h2>
  <table>
    <thead>
      <tr>
        <th>Niveau</th>
        <th>Garçons</th>
        <th>Filles</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${(data.effectifs || []).map((row: any) => `
        <tr>
          <td><strong>${row.niveau}</strong></td>
          <td>${row.garcons || 0}</td>
          <td>${row.filles || 0}</td>
          <td>${row.total || 0}</td>
        </tr>
      `).join('')}
      <tr class="total">
        <td><strong>TOTAL</strong></td>
        <td>${data.totalGeneral?.garcons || 0}</td>
        <td>${data.totalGeneral?.filles || 0}</td>
        <td>${data.totalGeneral?.total || 0}</td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top: 30px; padding: 15px; background: #f0fdf4; border-radius: 8px;">
    <p><strong>📌 Récapitulatif :</strong></p>
    <ul>
      <li>Total élèves : ${data.totalGeneral?.total || 0}</li>
      <li>Garçons : ${data.totalGeneral?.garcons || 0}</li>
      <li>Filles : ${data.totalGeneral?.filles || 0}</li>
      <li>Nouveaux élèves : ${data.nouveaux || 0}</li>
      <li>Redoublants : ${data.redoublants || 0}</li>
    </ul>
  </div>

  <div class="footer">
    <p>Document généré automatiquement par KALAN - ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;

  // Convertir en Buffer
  return Buffer.from(html);
}
