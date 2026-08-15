'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

type DonneeJour = { jour: string; absences: number };

export default function AbsencesChart({ data }: { data: DonneeJour[] }) {
  const total = data.reduce((sum, d) => sum + d.absences, 0);

  if (total === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-gray-400">
        Aucune absence sur les 7 derniers jours.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="jour" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="absences" fill="#dc2626" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
