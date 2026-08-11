'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

type DonneeMois = { mois: string; montant: number };

export default function EvolutionChart({ data }: { data: DonneeMois[] }) {
  const total = data.reduce((sum, d) => sum + d.montant, 0);

  if (total === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-neutral-400">
        Aucune recette enregistrée sur cette période.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v.toString()}
        />
        <Tooltip formatter={(value: number) => value.toLocaleString('fr-FR') + ' F'} />
        <Line type="monotone" dataKey="montant" stroke="#171717" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
