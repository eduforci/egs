'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PARAMETRES_UNIV_PAR_DEFAUT, normaliserParametres, type ParametresUniv } from '@/lib/univ-calcul';

const champ = 'w-24 border rounded-md px-2 py-1.5 text-sm text-right';

export default function ParametresUnivPage() {
  const [p, setP] = useState<ParametresUniv | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/universite/parametres', { cache: 'no-store' });
        const j = await r.json();
        setP(normaliserParametres(j?.parametres));
      } catch { setP(PARAMETRES_UNIV_PAR_DEFAUT); }
    })();
  }, []);

  const num = (cle: keyof ParametresUniv, label: string) => (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <input inputMode="decimal" className={champ} value={String(p?.[cle] ?? '')}
        onChange={(e) => setP((x) => (x ? { ...x, [cle]: e.target.value as unknown as number } : x))} />
    </label>
  );

  const enregistrer = async () => {
    if (!p) return;
    setOccupe(true); setMsg(null);
    try {
      const r = await fetch('/api/universite/parametres', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parametres: p }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Échec.');
      setP(normaliserParametres(j.parametres));
      setMsg({ ok: true, texte: 'Règles enregistrées. Elles s\'appliquent à tous les relevés.' });
    } catch (e) { setMsg({ ok: false, texte: e instanceof Error ? e.message : 'Erreur inconnue' }); }
    finally { setOccupe(false); }
  };

  if (!p) return <main className="max-w-xl mx-auto p-4"><p className="text-sm text-gray-500">Chargement…</p></main>;

  return (
    <main className="max-w-xl mx-auto p-4 pb-16 space-y-4">
      <Link href="/direction/universite" className="text-sm text-blue-700">← Études universitaires</Link>
      <h1 className="text-xl font-bold">Règles de validation</h1>

      <section className="border rounded-lg p-3 space-y-2">
        <p className="font-medium text-sm">Validation des UE</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" checked={p.regle_validation === 'compensation'} onChange={() => setP({ ...p, regle_validation: 'compensation' })} />
          <span><b>Avec compensation</b> : une UE sous le seuil est « compensée » si la moyenne du semestre atteint le seuil du semestre.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" checked={p.regle_validation === 'sans_compensation'} onChange={() => setP({ ...p, regle_validation: 'sans_compensation' })} />
          <span><b>Sans compensation</b> : chaque UE doit atteindre le seuil, sinon ses crédits ne sont pas acquis.</span>
        </label>
        {num('seuil_ue', 'Seuil de validation d\'une UE (/20)')}
        {num('seuil_semestre', 'Seuil de validation du semestre (/20)')}
      </section>

      <section className="border rounded-lg p-3 space-y-2">
        <p className="font-medium text-sm">Mentions (moyenne minimale)</p>
        {num('seuil_passable', 'Passable')}
        {num('seuil_assez_bien', 'Assez bien')}
        {num('seuil_bien', 'Bien')}
        {num('seuil_tres_bien', 'Très bien')}
        <p className="text-xs text-gray-500">Une mention n'est donnée que si le semestre ou l'année est validé.</p>
      </section>

      <section className="border rounded-lg p-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={p.rattrapage} onChange={(e) => setP({ ...p, rattrapage: e.target.checked })} />
          <span><b>Session de rattrapage</b> : si elle existe, la meilleure des deux notes est retenue.</span>
        </label>
      </section>

      <div className="flex gap-2">
        <button disabled={occupe} onClick={enregistrer} className="flex-1 rounded-md py-2.5 text-sm bg-blue-600 text-white disabled:opacity-50">Enregistrer</button>
        <button disabled={occupe} onClick={() => setP(PARAMETRES_UNIV_PAR_DEFAUT)} className="border rounded-md px-3 py-2.5 text-sm bg-white disabled:opacity-50">Valeurs usuelles</button>
      </div>
      {msg && <div className={`text-sm rounded-md p-3 border ${msg.ok ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-700'}`}>{msg.texte}</div>}
    </main>
  );
}
