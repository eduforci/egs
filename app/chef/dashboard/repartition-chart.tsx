'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type DonneeRepartition = { nom: string; valeur: number; couleur: string };

export default function RepartitionChart({ data }: { data: DonneeRepartition[] }) {
  const total = data.reduce((sum, d) => sum + d.valeur, 0);

  if (total === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-neutral-400">
        Aucune donnée à afficher pour le moment.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="valeur"
          nameKey="nom"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.couleur} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => value.toLocaleString('fr-FR')} />
        <Legend verticalAlign="bottom" height={36} />
      </PieChart>
    </ResponsiveContainer>
  );
                    }
