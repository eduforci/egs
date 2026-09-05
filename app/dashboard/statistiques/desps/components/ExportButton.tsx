'use client';

import { useState } from 'react';

interface ExportButtonProps {
  etablissementId: string;
  anneeScolaire: string;
  trimestre: number;
}

export default function ExportButton({ 
  etablissementId, 
  anneeScolaire, 
  trimestre 
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState<'json' | 'excel' | 'pdf'>('excel');

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/desps/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etablissementId,
          anneeScolaire,
          trimestre,
          format
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Télécharger le fichier
        window.open(result.url, '_blank');
      } else {
        alert('Erreur lors de l\'export: ' + result.error);
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <select 
        value={format}
        onChange={(e) => setFormat(e.target.value as any)}
        className="px-3 py-2 border rounded-lg"
      >
        <option value="json">JSON</option>
        <option value="excel">Excel (.xlsx)</option>
        <option value="pdf">PDF</option>
      </select>
      
      <button
        onClick={handleExport}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Export en cours...' : 'Exporter'}
      </button>
    </div>
  );
}
