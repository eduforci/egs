import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

export function formatMontant(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString('fr-FR') + ' F';
}

function cellValue(row: Record<string, any>, col: ReportColumn): string {
  const v = row[col.key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return formatMontant(v);
  return String(v);
}

export function exportToPDF(
  title: string,
  subtitle: string,
  columns: ReportColumn[],
  rows: Record<string, any>[],
  filename: string,
  etablissementNom?: string
) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });

  doc.setFontSize(14);
  doc.text(etablissementNom || '', 14, 15);
  doc.setFontSize(12);
  doc.text(title, 14, 23);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(subtitle, 14, 29);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 34);

  autoTable(doc, {
    startY: 40,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => cellValue(row, c))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, { halign: c.align || 'left' }])
    ),
  });

  doc.save(`${filename}.pdf`);
}

export function exportToExcel(
  columns: ReportColumn[],
  rows: Record<string, any>[],
  filename: string,
  sheetName = 'Rapport'
) {
  const data = [
    columns.map((c) => c.label),
    ...rows.map((row) =>
      columns.map((c) => {
        const v = row[c.key];
        return v === null || v === undefined ? '' : v;
      })
    ),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet['!cols'] = columns.map(() => ({ wch: 18 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
      }
