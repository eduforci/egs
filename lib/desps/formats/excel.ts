import * as XLSX from 'xlsx';

export function generateExcel(data: any): Buffer {
  // Préparer les données pour Excel
  const rows = [
    ['Niveau', 'Garçons', 'Filles', 'Total']
  ];

  data.effectifs.forEach((row: any) => {
    rows.push([row.niveau, row.garcons, row.filles, row.total]);
  });

  rows.push(['TOTAL', data.totalGeneral.garcons, data.totalGeneral.filles, data.totalGeneral.total]);

  // Créer le workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'DESPS');

  // Générer le buffer
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer);
}
