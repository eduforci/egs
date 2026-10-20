'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Etudiant = { id: string; matricule: string | null; nom: string; prenoms: string; date_naissance: string | null; lieu_naissance: string | null };
const champ = 'w-full border rounded-md px-2 py-1.5 text-sm';

export default function EtudiantsPage() {
  const [liste, setListe] = useState<Etudiant[]>([]);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ matricule: '', nom: '', prenoms: '', date_naissance: '', lieu_naissance: '' });

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/universite/etudiants', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) setMsg(j.error || 'Erreur.'); else setListe(j.etudiants);
    } catch { setMsg('Erreur réseau.'); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const envoyer = async (corps: Record<string, unknown>) => {
    setMsg('');
    try {
      const r = await fetch('/api/universite/etudiants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || 'Échec.'); return false; }
      await charger();
      return true;
    } catch { setMsg('Erreur réseau.'); return false; }
  };

  return (
    <main className="max-w-xl mx-auto p-4 pb-16 space-y-4">
      <Link href="/direction/universite" className="text-sm text-blue-700">← Études universitaires</Link>
      <h1 className="text-xl font-bold">Étudiants</h1>
      <Link href="/direction/universite/etudiants/import" className="block border rounded-md py-2 text-sm text-center bg-white">📥 Importer une liste (Excel, CSV ou texte collé)</Link>
      {msg && <div className="text-sm rounded-md p-3 border bg-red-50 border-red-300 text-red-700">{msg}</div>}

      <section className="border rounded-lg p-3 space-y-2">
        <p className="font-medium text-sm">Nouvel étudiant</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={f.nom} placeholder="Nom" className={champ} onChange={(e) => setF({ ...f, nom: e.target.value })} />
          <input value={f.prenoms} placeholder="Prénoms" className={champ} onChange={(e) => setF({ ...f, prenoms: e.target.value })} />
          <input value={f.matricule} placeholder="Matricule" className={champ} onChange={(e) => setF({ ...f, matricule: e.target.value })} />
          <input type="date" value={f.date_naissance} className={champ} onChange={(e) => setF({ ...f, date_naissance: e.target.value })} />
        </div>
        <input value={f.lieu_naissance} placeholder="Lieu de naissance" className={champ} onChange={(e) => setF({ ...f, lieu_naissance: e.target.value })} />
        <button className="w-full rounded-md py-2 text-sm bg-blue-600 text-white"
          onClick={async () => { if (await envoyer({ action: 'ajouter', ...f })) setF({ matricule: '', nom: '', prenoms: '', date_naissance: '', lieu_naissance: '' }); }}>Ajouter</button>
      </section>

      <section className="space-y-2">
        {liste.length === 0 && <p className="text-sm text-gray-500">Aucun étudiant pour le moment.</p>}
        {liste.map((e) => (
          <div key={e.id} className="border rounded-lg p-3 flex items-center justify-between gap-2">
            <div className="text-sm">
              <p className="font-medium">{e.nom} {e.prenoms}</p>
              <p className="text-xs text-gray-500">{e.matricule || 'Sans matricule'}</p>
            </div>
            <div className="flex gap-2 text-xs">
              <Link href={`/direction/universite/etudiants/${e.id}`} className="border rounded-md px-2 py-1.5 bg-white">Notes</Link>
              <Link href={`/direction/universite/releve/${e.id}`} className="border rounded-md px-2 py-1.5 bg-white">Relevé</Link>
              <button className="text-red-700 px-1" onClick={() => { if (window.confirm(`Supprimer ${e.nom} et toutes ses notes ?`)) envoyer({ action: 'supprimer', id: e.id }); }}>✕</button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
