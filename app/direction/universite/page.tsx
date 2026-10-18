'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Parcours = { id: string; nom: string };
type Ue = { id: string; parcours_id: string; semestre: number; code: string | null; intitule: string; credits: number };
type Ec = { id: string; ue_id: string; intitule: string; coefficient: number };

const champ = 'w-full border rounded-md px-2 py-1.5 text-sm';

export default function UniversitePage() {
  const [parcours, setParcours] = useState<Parcours[]>([]);
  const [ues, setUes] = useState<Ue[]>([]);
  const [ecs, setEcs] = useState<Ec[]>([]);
  const [choix, setChoix] = useState('');
  const [msg, setMsg] = useState('');
  const [nomParcours, setNomParcours] = useState('');
  const [fUe, setFUe] = useState({ semestre: '1', code: '', intitule: '', credits: '' });
  const [fEc, setFEc] = useState<Record<string, { intitule: string; coefficient: string }>>({});

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/universite/structure', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || 'Erreur.'); return; }
      setParcours(j.parcours); setUes(j.ues); setEcs(j.ecs);
      setChoix((c) => c || j.parcours[0]?.id || '');
    } catch { setMsg('Erreur réseau.'); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const envoyer = async (corps: Record<string, unknown>) => {
    setMsg('');
    try {
      const r = await fetch('/api/universite/structure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || 'Échec.'); return false; }
      await charger();
      return true;
    } catch { setMsg('Erreur réseau.'); return false; }
  };

  const supprimer = (type: string, id: string, quoi: string) => {
    if (window.confirm(`Supprimer ${quoi} ? Les notes liées seront aussi supprimées.`)) envoyer({ action: 'supprimer', type, id });
  };

  const uesDuParcours = ues.filter((u) => u.parcours_id === choix);
  const semestres = Array.from(new Set<number>(uesDuParcours.map((u) => u.semestre))).sort((a, b) => a - b);

  return (
    <main className="max-w-xl mx-auto p-4 pb-16 space-y-4">
      <h1 className="text-xl font-bold">Études universitaires</h1>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/direction/universite/etudiants" className="border rounded-md py-2 text-sm text-center bg-white">👥 Étudiants et notes</Link>
        <Link href="/direction/universite/parametres" className="border rounded-md py-2 text-sm text-center bg-white">⚙️ Règles de validation</Link>
      </div>
      {msg && <div className="text-sm rounded-md p-3 border bg-red-50 border-red-300 text-red-700">{msg}</div>}

      <section className="border rounded-lg p-3 space-y-2">
        <p className="font-medium text-sm">Parcours (filière et niveau)</p>
        <div className="flex gap-2">
          <input value={nomParcours} onChange={(e) => setNomParcours(e.target.value)} placeholder="ex. Licence 1 Informatique" className={champ} />
          <button className="rounded-md px-3 text-sm bg-blue-600 text-white"
            onClick={async () => { if (await envoyer({ action: 'ajouter_parcours', nom: nomParcours })) setNomParcours(''); }}>Ajouter</button>
        </div>
        {parcours.length > 0 && (
          <div className="flex gap-2">
            <select value={choix} onChange={(e) => setChoix(e.target.value)} className={champ}>
              {parcours.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
            <button className="border rounded-md px-3 text-sm text-red-700" onClick={() => supprimer('parcours', choix, 'ce parcours et toute sa structure')}>Suppr.</button>
          </div>
        )}
      </section>

      {choix && (
        <>
          {semestres.map((s) => (
            <section key={s} className="space-y-2">
              <p className="font-semibold text-sm">
                Semestre {s} — {uesDuParcours.filter((u) => u.semestre === s).reduce((t, u) => t + Number(u.credits), 0)} crédits
              </p>
              {uesDuParcours.filter((u) => u.semestre === s).map((u) => {
                const f = fEc[u.id] ?? { intitule: '', coefficient: '1' };
                return (
                  <div key={u.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-medium">{u.code ? `${u.code} · ` : ''}{u.intitule} <span className="text-gray-500">({Number(u.credits)} crédits)</span></span>
                      <button className="text-red-700 text-xs" onClick={() => supprimer('ue', u.id, 'cette UE')}>Suppr.</button>
                    </div>
                    {ecs.filter((x) => x.ue_id === u.id).map((x) => (
                      <div key={x.id} className="flex justify-between text-xs text-gray-700 pl-2">
                        <span>{x.intitule} (coef. {Number(x.coefficient)})</span>
                        <button className="text-red-700" onClick={() => supprimer('ec', x.id, 'cette matière')}>✕</button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input value={f.intitule} placeholder="Matière" className={champ}
                        onChange={(e) => setFEc({ ...fEc, [u.id]: { ...f, intitule: e.target.value } })} />
                      <input value={f.coefficient} inputMode="decimal" className="w-16 border rounded-md px-2 py-1.5 text-sm" aria-label="Coefficient"
                        onChange={(e) => setFEc({ ...fEc, [u.id]: { ...f, coefficient: e.target.value } })} />
                      <button className="rounded-md px-3 text-sm bg-blue-600 text-white"
                        onClick={async () => { if (await envoyer({ action: 'ajouter_ec', ue_id: u.id, intitule: f.intitule, coefficient: f.coefficient })) setFEc({ ...fEc, [u.id]: { intitule: '', coefficient: '1' } }); }}>+</button>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}

          <section className="border rounded-lg p-3 space-y-2">
            <p className="font-medium text-sm">Ajouter une UE à ce parcours</p>
            <div className="grid grid-cols-3 gap-2">
              <input value={fUe.semestre} inputMode="numeric" placeholder="Semestre" className={champ} onChange={(e) => setFUe({ ...fUe, semestre: e.target.value })} />
              <input value={fUe.code} placeholder="Code (UE1)" className={champ} onChange={(e) => setFUe({ ...fUe, code: e.target.value })} />
              <input value={fUe.credits} inputMode="decimal" placeholder="Crédits" className={champ} onChange={(e) => setFUe({ ...fUe, credits: e.target.value })} />
            </div>
            <input value={fUe.intitule} placeholder="Intitulé de l'UE" className={champ} onChange={(e) => setFUe({ ...fUe, intitule: e.target.value })} />
            <button className="w-full rounded-md py-2 text-sm bg-blue-600 text-white"
              onClick={async () => { if (await envoyer({ action: 'ajouter_ue', parcours_id: choix, ...fUe })) setFUe({ ...fUe, code: '', intitule: '', credits: '' }); }}>Ajouter l'UE</button>
          </section>
        </>
      )}
    </main>
  );
}
