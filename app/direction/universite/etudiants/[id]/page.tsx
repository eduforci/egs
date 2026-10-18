'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PARAMETRES_UNIV_PAR_DEFAUT, normaliserParametres, type ParametresUniv } from '@/lib/univ-calcul';

type Parcours = { id: string; nom: string };
type Ue = { id: string; parcours_id: string; semestre: number; code: string | null; intitule: string; credits: number };
type Ec = { id: string; ue_id: string; intitule: string; coefficient: number };

function anneeEnCours(): string {
  const d = new Date();
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

const champ = 'w-full border rounded-md px-2 py-1.5 text-sm';

export default function NotesEtudiantPage() {
  const { id } = useParams<{ id: string }>();
  const [parcours, setParcours] = useState<Parcours[]>([]);
  const [ues, setUes] = useState<Ue[]>([]);
  const [ecs, setEcs] = useState<Ec[]>([]);
  const [params, setParams] = useState<ParametresUniv>(PARAMETRES_UNIV_PAR_DEFAUT);
  const [nom, setNom] = useState('');
  const [annee, setAnnee] = useState(anneeEnCours());
  const [parcoursId, setParcoursId] = useState('');
  const [semestre, setSemestre] = useState(1);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, p] = await Promise.all([
          fetch('/api/universite/structure', { cache: 'no-store' }).then((r) => r.json()),
          fetch('/api/universite/parametres', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (s.error) { setMsg({ ok: false, texte: s.error }); return; }
        setParcours(s.parcours); setUes(s.ues); setEcs(s.ecs);
        setParcoursId(s.parcours[0]?.id ?? '');
        setParams(normaliserParametres(p?.parametres));
      } catch { setMsg({ ok: false, texte: 'Erreur réseau.' }); }
    })();
  }, []);

  const chargerNotes = useCallback(async () => {
    if (!/^\d{4}-\d{4}$/.test(annee)) { setValeurs({}); return; }
    try {
      const r = await fetch(`/api/universite/notes?etudiantId=${id}&annee=${annee}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setMsg({ ok: false, texte: j.error || 'Erreur.' }); return; }
      setNom(`${j.etudiant.nom} ${j.etudiant.prenoms}`);
      const v: Record<string, string> = {};
      for (const n of j.notes as { ec_id: string; session: string; valeur: number }[]) v[`${n.ec_id}|${n.session}`] = String(n.valeur);
      setValeurs(v);
    } catch { setMsg({ ok: false, texte: 'Erreur réseau.' }); }
  }, [id, annee]);
  useEffect(() => { chargerNotes(); }, [chargerNotes]);

  const uesAffichees = ues.filter((u) => u.parcours_id === parcoursId && u.semestre === semestre);
  const semestresDispo = Array.from(new Set<number>(ues.filter((u) => u.parcours_id === parcoursId).map((u) => u.semestre))).sort((a, b) => a - b);
  const ecsAffichees = ecs.filter((e) => uesAffichees.some((u) => u.id === e.ue_id));

  const enregistrer = async () => {
    setOccupe(true); setMsg(null);
    const notes: { ec_id: string; session: string; valeur: string }[] = [];
    for (const e of ecsAffichees) {
      notes.push({ ec_id: e.id, session: 'normale', valeur: valeurs[`${e.id}|normale`] ?? '' });
      if (params.rattrapage) notes.push({ ec_id: e.id, session: 'rattrapage', valeur: valeurs[`${e.id}|rattrapage`] ?? '' });
    }
    try {
      const r = await fetch('/api/universite/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etudiantId: id, annee, notes }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Échec.');
      setMsg({ ok: true, texte: 'Notes enregistrées.' });
      await chargerNotes();
    } catch (e) { setMsg({ ok: false, texte: e instanceof Error ? e.message : 'Erreur inconnue' }); }
    finally { setOccupe(false); }
  };

  return (
    <main className="max-w-xl mx-auto p-4 pb-16 space-y-4">
      <Link href="/direction/universite/etudiants" className="text-sm text-blue-700">← Étudiants</Link>
      <h1 className="text-xl font-bold">Notes — {nom}</h1>

      <section className="border rounded-lg p-3 space-y-2">
        <label className="block text-xs text-gray-600">Année scolaire
          <input value={annee} onChange={(e) => setAnnee(e.target.value.trim())} placeholder="2025-2026" className={champ} />
        </label>
        <label className="block text-xs text-gray-600">Parcours
          <select value={parcoursId} onChange={(e) => { setParcoursId(e.target.value); setSemestre(1); }} className={champ}>
            {parcours.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </label>
        <div className="flex gap-2 flex-wrap">
          {semestresDispo.map((s) => (
            <button key={s} onClick={() => setSemestre(s)}
              className={`px-3 py-1.5 rounded-md text-sm border ${s === semestre ? 'bg-blue-600 text-white' : 'bg-white'}`}>Semestre {s}</button>
          ))}
        </div>
        {parcours.length === 0 && <p className="text-sm text-gray-500">Créez d'abord un parcours avec ses UE.</p>}
      </section>

      {uesAffichees.map((u) => (
        <section key={u.id} className="border rounded-lg p-3 space-y-2">
          <p className="font-medium text-sm">{u.code ? `${u.code} · ` : ''}{u.intitule} <span className="text-gray-500">({Number(u.credits)} crédits)</span></p>
          <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 text-xs text-gray-500">
            <span>Matière</span><span>Normale</span><span>{params.rattrapage ? 'Rattrap.' : ''}</span>
          </div>
          {ecs.filter((e) => e.ue_id === u.id).map((e) => (
            <div key={e.id} className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 items-center">
              <span className="text-sm">{e.intitule} <span className="text-xs text-gray-500">×{Number(e.coefficient)}</span></span>
              <input inputMode="decimal" className="border rounded-md px-2 py-1.5 text-sm text-right" value={valeurs[`${e.id}|normale`] ?? ''}
                onChange={(ev) => setValeurs({ ...valeurs, [`${e.id}|normale`]: ev.target.value })} />
              {params.rattrapage ? (
                <input inputMode="decimal" className="border rounded-md px-2 py-1.5 text-sm text-right" value={valeurs[`${e.id}|rattrapage`] ?? ''}
                  onChange={(ev) => setValeurs({ ...valeurs, [`${e.id}|rattrapage`]: ev.target.value })} />
              ) : <span />}
            </div>
          ))}
        </section>
      ))}
      {uesAffichees.length === 0 && parcoursId && <p className="text-sm text-gray-500">Aucune UE pour ce semestre.</p>}

      {msg && <div className={`text-sm rounded-md p-3 border ${msg.ok ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-700'}`}>{msg.texte}</div>}
      <div className="flex gap-2">
        <button disabled={occupe || ecsAffichees.length === 0} onClick={enregistrer} className="flex-1 rounded-md py-2.5 text-sm bg-blue-600 text-white disabled:opacity-50">Enregistrer les notes</button>
        <Link href={`/direction/universite/releve/${id}`} className="border rounded-md px-3 py-2.5 text-sm bg-white">Relevé</Link>
      </div>
      <p className="text-xs text-gray-500">Laissez une case vide pour supprimer la note. Notes de 0 à 20, virgule acceptée.</p>
    </main>
  );
}
