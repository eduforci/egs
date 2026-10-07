'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Classe = { id: string; nom: string; niveau: string };
type Jour = { label: string; date: string; total: number };

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function DashboardEducateur() {
  const [classes, setClasses] = useState<Classe[]>([]);
  const [appelsFaits, setAppelsFaits] = useState<number | null>(null);
  const [jours, setJours] = useState<Jour[]>([]);
  const [totalAbs, setTotalAbs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function charger() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Non authentifié.");

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('etablissement_id')
          .eq('id', user.id)
          .single();

        if (profileError) throw new Error(`Erreur profil : ${profileError.message}`);

        const { data: classesData, error: classesError } = await supabase
          .from('classes')
          .select('id, nom, niveau')
          .eq('etablissement_id', profile.etablissement_id)
          .order('niveau', { ascending: true });

        if (classesError) throw new Error(`Erreur classes : ${classesError.message}`);

        setClasses(classesData ?? []);

        // Résumé des appels du jour (non bloquant)
        const aujourdhui = new Date().toISOString().slice(0, 10);
        const { count } = await supabase
          .from('appels_journaliers')
          .select('id', { count: 'exact', head: true })
          .eq('etablissement_id', profile.etablissement_id)
          .eq('date', aujourdhui);
        setAppelsFaits(count ?? 0);

        // Absences des 7 derniers jours (non bloquant)
        const base: Jour[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          base.push({ label: JOURS[d.getDay()], date: d.toISOString().slice(0, 10), total: 0 });
        }
        const { data: abs } = await supabase
          .from('absences')
          .select('date')
          .eq('etablissement_id', profile.etablissement_id)
          .eq('type', 'absence')
          .gte('date', base[0].date)
          .lte('date', base[6].date);
        (abs ?? []).forEach((a: { date: string }) => {
          const j = base.find((b) => b.date === String(a.date).slice(0, 10));
          if (j) j.total += 1;
        });
        setJours(base);
        setTotalAbs(base.reduce((n, j) => n + j.total, 0));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    }
    charger();
  }, []);

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Espace Éducateur</h1>
      <p className="text-sm text-gray-500 mb-4">Suivi des appels et saisie des notes de conduite</p>

      <Link
        href="/educateur/appels"
        className="block border-2 border-neutral-900 rounded-xl p-4 mb-6 hover:bg-gray-50"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">📋 Point des appels</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Voir quelles classes ont fait l'appel, les absents et les retards
            </div>
          </div>
          {appelsFaits !== null && classes.length > 0 && (
            <div className="text-right shrink-0">
              <div className="text-lg font-bold">
                {appelsFaits}/{classes.length}
              </div>
              <div className="text-[11px] text-gray-500">faits aujourd'hui</div>
            </div>
          )}
        </div>
      </Link>

      {jours.length > 0 && (() => {
        const max = Math.max(5, ...jours.map((j) => j.total));
        const haut = 120;
        return (
          <div className="border rounded-xl p-4 mb-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Absences — 7 derniers jours</h2>
              <span className="text-xs text-gray-500">{totalAbs} au total</span>
            </div>
            <svg viewBox="0 0 280 150" className="w-full" role="img" aria-label="Absences des 7 derniers jours">
              {[0, 0.5, 1].map((p) => (
                <g key={p}>
                  <line x1="26" x2="276" y1={125 - p * haut} y2={125 - p * haut} stroke="#e5e7eb" strokeDasharray="3 3" />
                  <text x="22" y={129 - p * haut} fontSize="9" textAnchor="end" fill="#6b7280">
                    {Math.round(max * p)}
                  </text>
                </g>
              ))}
              {jours.map((j, i) => {
                const h = (j.total / max) * haut;
                const x = 34 + i * 35;
                return (
                  <g key={j.date}>
                    {j.total > 0 && <rect x={x} y={125 - h} width="24" height={h} rx="3" fill="#dc2626" />}
                    {j.total > 0 && (
                      <text x={x + 12} y={120 - h} fontSize="9" textAnchor="middle" fill="#374151">{j.total}</text>
                    )}
                    <text x={x + 12} y="142" fontSize="9" textAnchor="middle" fill="#6b7280">{j.label}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })()}

      <h2 className="text-sm font-semibold text-gray-700 mb-2">Notes de conduite par classe</h2>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}

      {!loading && !error && classes.length === 0 && (
        <p className="text-sm text-gray-500">Aucune classe trouvée pour cet établissement.</p>
      )}

      {!loading && !error && classes.length > 0 && (
        <ul className="space-y-2">
          {classes.map((c) => (
            <li key={c.id}>
              <Link
                href={`/educateur/classes/${c.id}/conduite`}
                className="block border rounded-lg p-3 hover:bg-gray-50"
              >
                <span className="font-medium">{c.nom}</span>
                <span className="text-gray-400 text-sm ml-2">{c.niveau}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
