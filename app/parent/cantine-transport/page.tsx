'use client';

import { useEffect, useState } from 'react';
import { formatMontant, dateLongue, heureCourte, SENS_TRANSPORT, PERIODICITES_CANTINE, PERIODICITES_TRANSPORT } from '@/lib/services-scolaires';

type Enfant = {
  id: string; nom: string; prenom: string; classe: string | null;
  cantine: null | {
    actif: boolean; regime: string | null; allergies: string | null;
    formule: null | { nom: string; montant: number; periodicite: string };
  };
  transport: null | {
    actif: boolean; sens: string;
    circuit: null | { nom: string; tarif: number; periodicite: string; heure_depart_matin: string | null; heure_depart_soir: string | null };
    arret: null | { nom: string; heure_passage: string | null };
  };
};
type Menu = { date_menu: string; entree: string | null; plat: string; dessert: string | null };

export default function CantineTransportParentPage() {
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/parent/cantine-transport', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur de chargement.');
        setEnfants(json.enfants ?? []);
        setMenus(json.menus ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-4">Cantine et transport</h1>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}

      <div className="space-y-3 mb-8">
        {enfants.length === 0 && !error && <p className="text-sm text-gray-400">Aucun enfant rattaché à votre compte.</p>}
        {enfants.map((e) => (
          <div key={e.id} className="border rounded-lg p-4 bg-white">
            <p className="font-semibold text-sm">{e.prenom} {e.nom}</p>
            {e.classe && <p className="text-xs text-gray-400 mb-3">{e.classe}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-neutral-50 rounded-md p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">🍽️ Cantine</p>
                {!e.cantine ? (
                  <p className="text-gray-400 text-xs">Non inscrit</p>
                ) : (
                  <>
                    <p>{e.cantine.formule?.nom ?? 'Inscrit'}{!e.cantine.actif && <span className="text-amber-600 text-xs"> (suspendu)</span>}</p>
                    {e.cantine.formule && (
                      <p className="text-xs text-gray-500">
                        {formatMontant(e.cantine.formule.montant)} {PERIODICITES_CANTINE[e.cantine.formule.periodicite] ?? ''}
                      </p>
                    )}
                    {(e.cantine.regime || e.cantine.allergies) && (
                      <p className="text-xs text-amber-700 mt-1">
                        {[e.cantine.regime, e.cantine.allergies && `Allergie : ${e.cantine.allergies}`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="bg-neutral-50 rounded-md p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">🚌 Transport</p>
                {!e.transport ? (
                  <p className="text-gray-400 text-xs">Non inscrit</p>
                ) : (
                  <>
                    <p>{e.transport.circuit?.nom ?? 'Inscrit'}{!e.transport.actif && <span className="text-amber-600 text-xs"> (suspendu)</span>}</p>
                    <p className="text-xs text-gray-500">{SENS_TRANSPORT[e.transport.sens]}</p>
                    {e.transport.arret && (
                      <p className="text-xs text-gray-500">
                        Arrêt : {e.transport.arret.nom}{e.transport.arret.heure_passage && ` (${heureCourte(e.transport.arret.heure_passage)})`}
                      </p>
                    )}
                    {e.transport.circuit && (
                      <p className="text-xs text-gray-500">
                        {formatMontant(e.transport.circuit.tarif)} {PERIODICITES_TRANSPORT[e.transport.circuit.periodicite] ?? ''}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-semibold text-sm mb-2">Menus des prochains jours</h2>
      {menus.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun menu publié pour le moment.</p>
      ) : (
        <div className="border rounded-lg divide-y bg-white">
          {menus.map((m) => (
            <div key={m.date_menu} className="px-4 py-3 text-sm">
              <p className="font-medium capitalize">{dateLongue(m.date_menu)}</p>
              <p className="text-gray-600">
                {[m.entree, m.plat, m.dessert].filter(Boolean).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
