'use client';

import { useEffect, useState } from 'react';
import { libellePeriode } from '@/lib/periodes';

export default function PeriodesPage() {
  const [nb, setNb] = useState<number | null>(null);
  const [choix, setChoix] = useState<number>(3);
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/periodes', { cache: 'no-store' });
      const j = await r.json().catch(() => ({ nb: 3 }));
      setNb(j.nb === 2 ? 2 : 3);
      setChoix(j.nb === 2 ? 2 : 3);
    })();
  }, []);

  const enregistrer = async () => {
    setOccupe(true);
    setMsg(null);
    try {
      const r = await fetch('/api/periodes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nb: choix }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Échec.');
      setNb(choix);
      setMsg({ ok: true, texte: 'Enregistré. Rechargez les autres pages pour voir les nouveaux libellés.' });
    } catch (e) {
      setMsg({ ok: false, texte: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setOccupe(false);
    }
  };

  const carte = (valeur: number, titre: string, detail: string) => (
    <button type="button" onClick={() => setChoix(valeur)}
      className={`text-left border rounded-lg p-3 w-full ${choix === valeur ? 'border-blue-600 bg-blue-50' : 'bg-white'}`}>
      <p className="font-medium text-sm">{titre}</p>
      <p className="text-xs text-gray-600">{detail}</p>
    </button>
  );

  return (
    <main className="max-w-xl mx-auto p-4 pb-16 space-y-4">
      <h1 className="text-xl font-bold">Périodes de l'année</h1>
      <p className="text-sm text-gray-600">
        Choisissez comment l'année est découpée dans votre école. Les notes, bulletins, clôtures et classements suivent ce choix.
        Les notes déjà saisies ne sont pas modifiées.
      </p>

      {nb === null ? <p className="text-sm text-gray-500">Chargement…</p> : (
        <>
          <div className="space-y-2">
            {carte(3, '3 trimestres', `${libellePeriode(3, 1)}, ${libellePeriode(3, 2)}, ${libellePeriode(3, 3)}`)}
            {carte(2, '2 semestres', `${libellePeriode(2, 1)}, ${libellePeriode(2, 2)}`)}
          </div>
          {nb !== choix && nb !== null && (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md p-2">
              Changez ce réglage en début d'année : si des notes existent déjà dans une période qui disparaît (le trimestre 3 par exemple),
              elles ne seront plus proposées dans les écrans.
            </p>
          )}
          <button disabled={occupe || nb === choix} onClick={enregistrer}
            className="w-full rounded-md py-2.5 text-sm bg-blue-600 text-white disabled:opacity-50">Enregistrer</button>
        </>
      )}

      {msg && (
        <div className={`text-sm rounded-md p-3 border ${msg.ok ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-700'}`}>{msg.texte}</div>
      )}
    </main>
  );
}
