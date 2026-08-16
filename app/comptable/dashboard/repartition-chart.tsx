'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type Donnee = { nom: string; valeur: number; couleur: string };

export default function RepartitionFinanciereChart({ data }: { data: Donnee[] }) {
  const total = data.reduce((sum, d) => sum + d.valeur, 0);

  if (total === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-gray-400">
        Aucune donnée financière disponible.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="valeur"
          nameKey="nom"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.couleur} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => value.toLocaleString('fr-FR') + ' F'} />
        <Legend verticalAlign="bottom" height={36} />
      </PieChart>
    </ResponsiveContainer>
  );
}
