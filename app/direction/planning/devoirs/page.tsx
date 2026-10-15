'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { JOURS, JOURS_LABEL } from '@/lib/planning';

const NIVEAUX: { code: string; label: string }[] = [
  { code: '6e', label: '6e' },
  { code: '5e', label: '5e' },
  { code: '4e', label: '4e' },
  { code: '3e', label: '3e' },
  { code: '2nde', label: '2nde' },
  { code: '1ere', label: '1ère' },
  { code: 'term', label: 'Tle' },
];

type Fenetre = { debut: string; fin: string };
const FENETRES_DEFAUT: Fenetre[] = [{ debut: '07:00', fin: '10:00' }, { debut: '16:00', fin: '18:00' }];
type Devoir = { jour: string; debut: string; fin: string; niveaux: string[] };

export default function DevoirsNiveauPage() {
  const supabase = createClient();
  const [etablissementId, setEtablissementId] = useState('');
  const [devoirs, setDevoirs] = useState<Devoir[]>([]);
  const [fenetres, setFenetres] = useState<Fenetre[]>(FENETRES_DEFAUT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const charger = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data: profil } = await supabase.from('profiles').select('etablissement_id').eq('id', u.user.id).single();
      if (!profil?.etablissement_id) return;
      setEtablissementId(profil.etablissement_id);
      const { data, error } = await supabase
        .from('planning_parametres')
        .select('devoirs')
        .eq('etablissement_id', profil.etablissement_id)
        .maybeSingle();
      if (error) {
        setMessage({ type: 'error', text: "Exécutez d'abord le script SQL « planning_v4 » dans Supabase." });
      } else if (data && Array.isArray((data as any).devoirs)) {
        setDevoirs(
          ((data as any).devoirs as any[]).map((d) => ({
            jour: String(d.jour ?? 'lundi'),
            debut: String(d.debut ?? '14:00'),
            fin: d.fin ? String(d.fin) : '',
            niveaux: Array.isArray(d.niveaux) ? d.niveaux.map(String) : [],
          }))
        );
      }
      const eps: { data: any; error: any } = await supabase
        .from('planning_parametres')
        .select('eps_fenetres')
        .eq('etablissement_id', profil.etablissement_id)
        .maybeSingle();
      if (!eps.error && Array.isArray(eps.data?.eps_fenetres)) {
        setFenetres(eps.data.eps_fenetres.map((w: any) => ({ debut: String(w.debut ?? ''), fin: String(w.fin ?? '') })));
      }
      setLoading(false);
    };
    charger();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const maj = (i: number, p: Partial<Devoir>) => setDevoirs((l) => l.map((d, k) => (k === i ? { ...d, ...p } : d)));
  const basculer = (i: number, code: string) =>
    setDevoirs((l) =>
      l.map((d, k) =>
        k !== i ? d : { ...d, niveaux: d.niveaux.includes(code) ? d.niveaux.filter((x) => x !== code) : [...d.niveaux, code] }
      )
    );

  const enregistrer = async () => {
    setMessage(null);
    const propres = devoirs.filter((d) => d.niveaux.length > 0);
    setSaving(true);
    const { error } = await supabase
      .from('planning_parametres')
      .upsert(
        {
          etablissement_id: etablissementId,
          devoirs: propres.map((d) => ({ jour: d.jour, debut: d.debut || '14:00', fin: d.fin || null, niveaux: d.niveaux })),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'etablissement_id' }
      );
    if (error) {
      setSaving(false);
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setDevoirs(propres);
    const valides = fenetres.filter((w) => w.debut && w.fin && w.debut < w.fin);
    const r2 = await supabase
      .from('planning_parametres')
      .upsert({ etablissement_id: etablissementId, eps_fenetres: valides, updated_at: new Date().toISOString() }, { onConflict: 'etablissement_id' });
    setSaving(false);
    if (r2.error) setMessage({ type: 'error', text: "Devoirs enregistrés, mais pas les heures d'EPS : exécutez le script SQL « planning_v5 »." });
    else {
      setFenetres(valides);
      setMessage({ type: 'success', text: 'Enregistré. Valable à la prochaine génération.' });
    }
  };

  if (loading) return <div className="p-4 text-sm">Chargement…</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Link href="/direction/planning" className="text-sm text-blue-600">← Planning</Link>
      <div>
        <h1 className="text-2xl font-bold">Devoirs de niveau</h1>
        <p className="text-sm text-gray-500">
          Choisissez un jour et une heure de début pour les devoirs d&apos;un ou plusieurs niveaux (par exemple les 3e le lundi à
          partir de 14:00, les Tle le vendredi). Ces classes n&apos;auront aucun cours sur ce créneau. Laissez « jusqu&apos;à » vide
          pour bloquer jusqu&apos;à la fin de la journée.
        </p>
      </div>

      {message && (
        <div className={`text-sm p-2 rounded border ${message.type === 'error' ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
          {message.text}
        </div>
      )}

      {devoirs.length === 0 && <p className="text-sm text-gray-500">Aucun devoir de niveau défini.</p>}

      {devoirs.map((d, i) => (
        <div key={i} className="border rounded-xl p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select value={d.jour} onChange={(e) => maj(i, { jour: e.target.value })} className="border rounded p-1.5">
              {JOURS.map((j) => (
                <option key={j} value={j}>{JOURS_LABEL[j]}</option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              à partir de
              <input type="time" value={d.debut} onChange={(e) => maj(i, { debut: e.target.value })} className="border rounded p-1" />
            </label>
            <label className="flex items-center gap-1">
              jusqu&apos;à
              <input type="time" value={d.fin} onChange={(e) => maj(i, { fin: e.target.value })} className="border rounded p-1" />
            </label>
            <button onClick={() => setDevoirs((l) => l.filter((_, k) => k !== i))} className="ml-auto px-2 py-1 border rounded text-red-600">
              Supprimer
            </button>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {NIVEAUX.map((n) => (
              <label key={n.code} className="flex items-center gap-1">
                <input type="checkbox" checked={d.niveaux.includes(n.code)} onChange={() => basculer(i, n.code)} />
                {n.label}
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="border rounded-xl p-3 space-y-2">
        <div className="font-semibold">EPS en plein air</div>
        <p className="text-xs text-gray-500">
          L&apos;EPS n&apos;est placée que dans ces plages (soleil). Une séance de 2 h doit y tenir en entier : de 7h à 10h elle peut être 7h-9h ou 8h-10h.
          Supprimez toutes les plages pour ne mettre aucune limite.
        </p>
        {fenetres.map((w, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            de
            <input type="time" value={w.debut} onChange={(e) => setFenetres((l) => l.map((x, k) => (k === i ? { ...x, debut: e.target.value } : x)))} className="border rounded p-1" />
            à
            <input type="time" value={w.fin} onChange={(e) => setFenetres((l) => l.map((x, k) => (k === i ? { ...x, fin: e.target.value } : x)))} className="border rounded p-1" />
            <button onClick={() => setFenetres((l) => l.filter((_, k) => k !== i))} className="px-2 py-1 border rounded text-red-600">Supprimer</button>
          </div>
        ))}
        <button onClick={() => setFenetres((l) => [...l, { debut: '07:00', fin: '10:00' }])} className="px-2 py-1 border rounded text-sm">+ Ajouter une plage</button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setDevoirs((l) => [...l, { jour: 'lundi', debut: '14:00', fin: '', niveaux: [] }])}
          className="px-3 py-2 border rounded text-sm"
        >
          + Ajouter un créneau de devoirs
        </button>
        <button onClick={enregistrer} disabled={saving} className="px-3 py-2 rounded bg-green-600 text-white text-sm disabled:opacity-50">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
