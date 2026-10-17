'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Matiere = { id: string; nom: string; nbNotes: number; valide: boolean };
type EleveEtat = {
  id: string; matricule: string; nom: string; prenom: string;
  appreciation: string; mention: string; nonClasse: boolean; motif: string; decision: string; observation: string;
};
type Etat = { classe: string; annee: string; trimestre: number; cloture: { le: string } | null; matieres: Matiere[]; eleves: EleveEtat[] };
type Resultat = { moyenne: number | null; rang: number | null };

const MENTIONS = [
  { value: 'tableau_honneur_felicitations', label: 'Tabl. Honneur + Félicitations' },
  { value: 'tableau_honneur_encouragements', label: 'Tabl. Honneur + Encouragements' },
  { value: 'tableau_honneur', label: "Tableau d'Honneur" },
  { value: 'avertissement_travail', label: 'Avertissement travail' },
  { value: 'avertissement_conduite', label: 'Avertissement conduite' },
  { value: 'blame_travail', label: 'Blâme travail' },
  { value: 'blame_conduite', label: 'Blâme conduite' },
];
const DECISIONS = [
  { value: '', label: 'À décider' },
  { value: 'admis', label: 'Admis(e) en classe supérieure' },
  { value: 'redouble', label: 'Redouble' },
  { value: 'exclu', label: 'Exclu(e)' },
];
const fmt = (v: number | null | undefined) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '—');

export default function ClotureClassePage() {
  const supabase = createClient();
  const classeId = useParams()?.classeId as string;
  const [trimestre, setTrimestre] = useState(1);
  const [onglet, setOnglet] = useState<'cloture' | 'conseil' | 'annee'>('cloture');
  const [etat, setEtat] = useState<Etat | null>(null);
  const [eleves, setEleves] = useState<EleveEtat[]>([]);
  const [res, setRes] = useState<Record<string, Resultat>>({});
  const [annuel, setAnnuel] = useState<Record<string, number | null>>({});
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [classes, setClasses] = useState<{ id: string; nom: string; annee_scolaire: string }[]>([]);
  const [destAdmis, setDestAdmis] = useState('');
  const [destRedoub, setDestRedoub] = useState('');

  const charger = useCallback(async () => {
    setChargement(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/cloture?classeId=${classeId}&trimestre=${trimestre}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Chargement impossible.');
      setEtat(j as Etat);
      setEleves((j as Etat).eleves);
      // moyennes et rangs du trimestre (même calcul que les bulletins)
      const m = await fetch(`/api/bulletins/matrice?classeId=${classeId}&trimestre=${trimestre}`, { cache: 'no-store' });
      if (m.ok) {
        const mj = await m.json();
        const o: Record<string, Resultat> = {};
        (mj.lignes ?? []).forEach((l: any) => { o[l.id] = { moyenne: l.moyenne, rang: l.rang }; });
        setRes(o);
      }
    } catch (e) {
      setMsg({ ok: false, texte: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setChargement(false);
    }
  }, [classeId, trimestre]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: p } = await supabase.from('profiles').select('etablissement_id').eq('id', user?.id).single();
      if (!p?.etablissement_id) return;
      const { data } = await supabase.from('classes').select('id, nom, annee_scolaire').eq('etablissement_id', p.etablissement_id);
      setClasses(((data ?? []) as any[]).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true })));
    })();
  }, [supabase]);

  const appeler = async (corps: Record<string, unknown>, succes: string) => {
    setOccupe(true);
    setMsg(null);
    try {
      const r = await fetch('/api/cloture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classeId, trimestre, ...corps }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Échec.');
      setMsg({ ok: true, texte: typeof j.deplaces === 'number' ? `${succes} (${j.deplaces} élève(s) déplacé(s))` : succes });
      await charger();
    } catch (e) {
      setMsg({ ok: false, texte: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setOccupe(false);
    }
  };

  const modif = (id: string, champs: Partial<EleveEtat>) =>
    setEleves((l) => l.map((e) => (e.id === id ? { ...e, ...champs } : e)));

  const proposerMentions = () =>
    setEleves((l) => l.map((e) => {
      const m = res[e.id]?.moyenne;
      if (e.mention || typeof m !== 'number') return e;
      const mention = m >= 16 ? 'tableau_honneur_felicitations' : m >= 14 ? 'tableau_honneur_encouragements' : m >= 12 ? 'tableau_honneur' : m < 8.5 ? 'avertissement_travail' : '';
      return { ...e, mention };
    }));

  const calculerAnnuel = async () => {
    if (!etat) return;
    setOccupe(true);
    const o: Record<string, number | null> = {};
    for (let i = 0; i < eleves.length; i += 8) {
      await Promise.all(eleves.slice(i, i + 8).map(async (e) => {
        const { data } = await supabase.rpc('generer_bulletin_annuel', { p_eleve_id: e.id, p_annee_scolaire: etat.annee });
        const v = (data as any)?.annuel?.moyenne;
        o[e.id] = typeof v === 'number' ? v : null;
      }));
    }
    setAnnuel(o);
    setEleves((l) => l.map((e) => {
      const v = o[e.id];
      if (e.decision || typeof v !== 'number') return e;
      return { ...e, decision: v >= 10 ? 'admis' : 'redouble' };
    }));
    setOccupe(false);
  };

  const nonValidees = etat?.matieres.filter((m) => !m.valide) ?? [];
  const cloture = !!etat?.cloture;
  const nbDecides = eleves.filter((e) => e.decision).length;
  const autres = classes.filter((c) => c.id !== classeId);

  return (
    <main className="max-w-3xl mx-auto p-4 pb-16 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{etat?.classe ?? 'Classe'} — clôture et conseil</h1>
        <Link href="/direction/cloture" className="text-xs text-blue-600 underline whitespace-nowrap">← Classes</Link>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <select value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))} className="border rounded-md px-3 py-2 text-sm">
          <option value={1}>Trimestre 1</option>
          <option value={2}>Trimestre 2</option>
          <option value={3}>Trimestre 3</option>
        </select>
        {cloture && <span className="text-xs bg-gray-800 text-white px-2 py-1 rounded-full">🔒 Clôturé</span>}
      </div>

      <div className="flex gap-1 text-sm">
        {([['cloture', '1. Clôture'], ['conseil', '2. Conseil de classe'], ['annee', '3. Fin d\'année']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setOnglet(k)}
            className={`flex-1 border rounded-md py-2 ${onglet === k ? 'bg-blue-600 text-white' : 'bg-white'}`}>{l}</button>
        ))}
      </div>

      {msg && (
        <div className={`text-sm rounded-md p-3 border ${msg.ok ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-700'}`}>{msg.texte}</div>
      )}
      {chargement && <p className="text-sm text-gray-500">Chargement…</p>}

      {etat && !chargement && onglet === 'cloture' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-600">
            Clôturer le trimestre valide d'office toutes les matières de la classe : les enseignants ne peuvent plus modifier ni
            déverrouiller leurs notes. Vous pouvez rouvrir la période si une correction est nécessaire.
          </p>
          <div className="border rounded-lg divide-y">
            {etat.matieres.length === 0 && <p className="p-3 text-sm text-gray-400">Aucune note saisie ce trimestre.</p>}
            {etat.matieres.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{m.nom} <span className="text-xs text-gray-400">({m.nbNotes} notes)</span></span>
                <span className={m.valide ? 'text-green-700 text-xs' : 'text-orange-600 text-xs'}>{m.valide ? '🔒 Validée' : 'Pas encore validée'}</span>
              </div>
            ))}
          </div>
          {!cloture && nonValidees.length > 0 && (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md p-2">
              {nonValidees.length} matière(s) ne sont pas encore validées par leur enseignant. Elles seront validées automatiquement à la clôture.
            </p>
          )}
          {cloture ? (
            <button disabled={occupe} onClick={() => confirm('Rouvrir ce trimestre ? Les enseignants pourront à nouveau déverrouiller leurs notes.') && appeler({ action: 'rouvrir' }, 'Trimestre rouvert.')}
              className="w-full border rounded-md py-2.5 text-sm bg-white disabled:opacity-50">Rouvrir le trimestre</button>
          ) : (
            <button disabled={occupe || etat.matieres.length === 0} onClick={() => confirm('Clôturer ce trimestre pour cette classe ?') && appeler({ action: 'cloturer' }, 'Trimestre clôturé.')}
              className="w-full rounded-md py-2.5 text-sm bg-blue-600 text-white disabled:opacity-50">Clôturer le trimestre</button>
          )}
        </section>
      )}

      {etat && !chargement && onglet === 'conseil' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-600">
            Mention et appréciation de chaque élève pour le trimestre. Cochez « Non classé » pour un élève qui n'a pas assez de notes
            (arrivé en cours d'année, absent aux compositions…).
          </p>
          <div className="flex gap-2">
            <button onClick={proposerMentions} className="border rounded-md px-3 py-2 text-xs bg-white">Proposer les mentions d'après les moyennes</button>
          </div>
          <div className="space-y-2">
            {[...eleves].sort((a, b) => (res[a.id]?.rang ?? 9999) - (res[b.id]?.rang ?? 9999)).map((e) => (
              <div key={e.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium">{e.nom} {e.prenom}</div>
                  <div className="text-xs text-gray-600 whitespace-nowrap">
                    {e.nonClasse ? 'Non classé' : `${fmt(res[e.id]?.moyenne)}/20 · rang ${res[e.id]?.rang ?? '—'}`}
                  </div>
                </div>
                <select value={e.mention} onChange={(x) => modif(e.id, { mention: x.target.value })} className="w-full border rounded-md px-2 py-1.5 text-sm">
                  <option value="">Aucune mention</option>
                  {MENTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <textarea value={e.appreciation} onChange={(x) => modif(e.id, { appreciation: x.target.value })} rows={2}
                  placeholder="Appréciation du conseil de classe" className="w-full border rounded-md px-2 py-1.5 text-sm" />
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={e.nonClasse} onChange={(x) => modif(e.id, { nonClasse: x.target.checked })} /> Non classé
                </label>
                {e.nonClasse && (
                  <input value={e.motif} onChange={(x) => modif(e.id, { motif: x.target.value })} placeholder="Motif (facultatif)"
                    className="w-full border rounded-md px-2 py-1.5 text-sm" />
                )}
              </div>
            ))}
          </div>
          <button disabled={occupe} onClick={() => appeler({ action: 'conseil', eleves }, 'Conseil de classe enregistré.')}
            className="w-full rounded-md py-2.5 text-sm bg-blue-600 text-white disabled:opacity-50">Enregistrer le conseil de classe</button>
        </section>
      )}

      {etat && !chargement && onglet === 'annee' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-600">
            Décision de fin d'année pour chaque élève, puis passage dans les classes de l'année suivante. Ces décisions ne dépendent pas du trimestre choisi.
          </p>
          <button disabled={occupe} onClick={calculerAnnuel} className="border rounded-md px-3 py-2 text-xs bg-white disabled:opacity-50">
            Proposer d'après la moyenne annuelle (10/20 = admis)
          </button>
          <div className="space-y-2">
            {eleves.map((e) => (
              <div key={e.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium">{e.nom} {e.prenom}</div>
                  <div className="text-xs text-gray-600 whitespace-nowrap">
                    {e.id in annuel ? `Annuelle : ${fmt(annuel[e.id])}` : ''}
                  </div>
                </div>
                <select value={e.decision} onChange={(x) => modif(e.id, { decision: x.target.value })} className="w-full border rounded-md px-2 py-1.5 text-sm">
                  {DECISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <input value={e.observation} onChange={(x) => modif(e.id, { observation: x.target.value })} placeholder="Observation (facultatif)"
                  className="w-full border rounded-md px-2 py-1.5 text-sm" />
              </div>
            ))}
          </div>
          <button disabled={occupe} onClick={() => appeler({ action: 'decisions', eleves }, 'Décisions enregistrées.')}
            className="w-full rounded-md py-2.5 text-sm bg-blue-600 text-white disabled:opacity-50">Enregistrer les décisions</button>

          <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
            <p className="font-medium text-sm">Passage à l'année suivante</p>
            <p className="text-xs text-gray-600">
              Enregistrez d'abord les décisions. Les élèves « Admis » rejoignent la classe choisie, les redoublants la leur. Les exclus ne sont pas déplacés.
              {nbDecides < eleves.length ? ` ${eleves.length - nbDecides} élève(s) n'ont pas encore de décision : ils restent dans cette classe.` : ''}
            </p>
            <label className="block text-xs text-gray-600">Classe des admis</label>
            <select value={destAdmis} onChange={(e) => setDestAdmis(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm bg-white">
              <option value="">Ne pas déplacer</option>
              {autres.map((c) => <option key={c.id} value={c.id}>{c.nom} ({c.annee_scolaire})</option>)}
            </select>
            <label className="block text-xs text-gray-600">Classe des redoublants</label>
            <select value={destRedoub} onChange={(e) => setDestRedoub(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm bg-white">
              <option value="">Ne pas déplacer</option>
              {autres.map((c) => <option key={c.id} value={c.id}>{c.nom} ({c.annee_scolaire})</option>)}
            </select>
            <button disabled={occupe || (!destAdmis && !destRedoub)}
              onClick={() => confirm('Déplacer les élèves vers leurs nouvelles classes ? Les notes et bulletins de cette année restent conservés.') &&
                appeler({ action: 'passage', classeAdmis: destAdmis || undefined, classeRedoublants: destRedoub || undefined }, 'Passage effectué.')}
              className="w-full rounded-md py-2.5 text-sm bg-green-600 text-white disabled:opacity-50">Effectuer le passage</button>
          </div>
        </section>
      )}
    </main>
  );
}
