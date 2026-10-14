'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Salle = { id: string; nom: string; capacite: number | null; ordre: number };

export default function SallesPlanningPage() {
  const supabase = useMemo(() => createClient(), []);
  const [etabId, setEtabId] = useState<string | null>(null);
  const [salles, setSalles] = useState<Salle[]>([]);
  const [nom, setNom] = useState('');
  const [capacite, setCapacite] = useState('');
  const [nombre, setNombre] = useState('');
  const [prefixe, setPrefixe] = useState('Salle ');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profil } = await supabase.from('profiles').select('etablissement_id').eq('id', user.id).single();
    setEtabId(profil?.etablissement_id ?? null);
    const { data, error } = await supabase
      .from('planning_salles')
      .select('id, nom, capacite, ordre')
      .order('ordre')
      .order('nom');
    if (error) setMsg({ type: 'err', text: "Table des salles introuvable : exécutez d'abord le SQL planning_v3. (" + error.message + ')' });
    setSalles((data ?? []) as Salle[]);
    setChargement(false);
  }, [supabase]);

  useEffect(() => { charger(); }, [charger]);

  const ajouter = async () => {
    const n = nom.trim();
    if (!n || !etabId) return;
    const cap = capacite.trim() ? Number(capacite) : null;
    const { error } = await supabase.from('planning_salles').insert({
      etablissement_id: etabId, nom: n, capacite: cap, ordre: salles.length + 1,
    });
    if (error) setMsg({ type: 'err', text: error.message.includes('uniq') ? 'Cette salle existe déjà.' : error.message });
    else { setNom(''); setCapacite(''); setMsg(null); await charger(); }
  };

  const creerPlusieurs = async () => {
    const k = Math.floor(Number(nombre));
    if (!etabId || !(k >= 1 && k <= 100)) { setMsg({ type: 'err', text: 'Entrez un nombre de salles entre 1 et 100.' }); return; }
    const existants = new Set(salles.map((s) => s.nom.toLowerCase()));
    const lignes: any[] = [];
    let i = 1;
    while (lignes.length < k && i < 1000) {
      const n = `${prefixe}${i}`.trim();
      if (!existants.has(n.toLowerCase())) lignes.push({ etablissement_id: etabId, nom: n, ordre: salles.length + lignes.length + 1 });
      i++;
    }
    const { error } = await supabase.from('planning_salles').insert(lignes);
    if (error) setMsg({ type: 'err', text: error.message });
    else { setNombre(''); setMsg({ type: 'ok', text: `${lignes.length} salle(s) créée(s).` }); await charger(); }
  };

  const renommer = async (s: Salle, valeur: string, cap: string) => {
    const n = valeur.trim();
    if (!n) return;
    const { error } = await supabase.from('planning_salles').update({ nom: n, capacite: cap.trim() ? Number(cap) : null }).eq('id', s.id);
    if (error) setMsg({ type: 'err', text: error.message.includes('uniq') ? 'Ce nom existe déjà.' : error.message });
    else { setMsg({ type: 'ok', text: 'Modifié. Régénérez l’emploi du temps pour appliquer ce nom.' }); await charger(); }
  };

  const supprimer = async (s: Salle) => {
    if (!window.confirm(`Supprimer « ${s.nom} » ? Les emplois du temps déjà enregistrés gardent son nom.`)) return;
    const { error } = await supabase.from('planning_salles').delete().eq('id', s.id);
    if (error) setMsg({ type: 'err', text: error.message });
    else await charger();
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <Link href="/direction/planning" className="text-sm text-blue-600 underline">← Planning</Link>
        <h1 className="text-2xl font-bold mt-1">Salles de l&apos;école</h1>
        <p className="text-sm text-gray-500">
          Le logiciel place chaque cours dans une salle libre. Une salle ne reçoit jamais deux classes en même temps : s&apos;il n&apos;y a plus de salle libre à un créneau, le cours est placé à un autre moment.
        </p>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm border ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="border rounded-xl p-4 bg-white space-y-2">
        <p className="font-semibold text-sm">Créer plusieurs salles d&apos;un coup</p>
        <div className="flex gap-2">
          <input value={prefixe} onChange={(e) => setPrefixe(e.target.value)} className="border rounded-lg p-2 text-sm w-28" aria-label="Début du nom" />
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} inputMode="numeric" placeholder="Combien ?" className="border rounded-lg p-2 text-sm flex-1" />
          <button onClick={creerPlusieurs} className="bg-gray-800 text-white px-3 rounded-lg text-sm">Créer</button>
        </div>
        <p className="text-xs text-gray-500">Exemple : « Salle » + 12 crée Salle 1 … Salle 12.</p>
      </div>

      <div className="border rounded-xl p-4 bg-white space-y-2">
        <p className="font-semibold text-sm">Ajouter une salle</p>
        <div className="flex gap-2">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom (ex. Salle 7, Labo)" className="border rounded-lg p-2 text-sm flex-1" />
          <input value={capacite} onChange={(e) => setCapacite(e.target.value)} inputMode="numeric" placeholder="Places" className="border rounded-lg p-2 text-sm w-20" />
          <button onClick={ajouter} className="bg-gray-800 text-white px-3 rounded-lg text-sm">Ajouter</button>
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white space-y-2">
        <p className="font-semibold text-sm">{salles.length} salle(s)</p>
        {chargement && <p className="text-sm text-gray-500">Chargement...</p>}
        {salles.map((s) => <LigneSalle key={s.id + s.nom + s.capacite} s={s} onSave={renommer} onDelete={supprimer} />)}
        {!chargement && salles.length === 0 && <p className="text-sm text-gray-500">Aucune salle pour l&apos;instant.</p>}
      </div>
    </div>
  );
}

function LigneSalle({ s, onSave, onDelete }: { s: Salle; onSave: (s: Salle, n: string, c: string) => void; onDelete: (s: Salle) => void }) {
  const [n, setN] = useState(s.nom);
  const [c, setC] = useState(s.capacite ? String(s.capacite) : '');
  const change = n !== s.nom || c !== (s.capacite ? String(s.capacite) : '');
  return (
    <div className="flex gap-2 items-center">
      <input value={n} onChange={(e) => setN(e.target.value)} className="border rounded-lg p-1.5 text-sm flex-1" />
      <input value={c} onChange={(e) => setC(e.target.value)} inputMode="numeric" placeholder="Places" className="border rounded-lg p-1.5 text-sm w-20" />
      {change && <button onClick={() => onSave(s, n, c)} className="text-xs bg-green-700 text-white px-2 py-1.5 rounded-lg">OK</button>}
      <button onClick={() => onDelete(s)} className="text-xs text-red-600 border px-2 py-1.5 rounded-lg">✕</button>
    </div>
  );
}
