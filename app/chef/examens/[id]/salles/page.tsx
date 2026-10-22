'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  anneeCourte, genererNumeros, prefixeExamen, repartirSalles,
} from '@/lib/examens-salles';

type Cand = {
  id: string; eleve_id: string; nom: string; prenom: string; matricule: string | null;
  serie: string | null; classe_nom: string | null;
  numero_table: string | null; salle: number | null; salle_serie: string | null;
};
type Col = { m: string; h: string };
type ColsParSalle = Record<string, Col[]>;

function serieDe(nomClasse: string | null, serieClasse: string | null, serieExamen: string | null): string | null {
  if (serieClasse && serieClasse.trim()) return serieClasse.trim().toUpperCase();
  const m = (nomClasse ?? '').toUpperCase().match(/\b(A1|A2|A|B|C|D|E|F\d?|G\d?)\b/);
  if (m) return m[1];
  return serieExamen ? serieExamen.toUpperCase() : null;
}

export default function SallesExamenPage() {
  const params = useParams();
  const examenId = params?.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [examen, setExamen] = useState<any>(null);
  const [etab, setEtab] = useState('');
  const [cands, setCands] = useState<Cand[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [cols, setCols] = useState<ColsParSalle>({});
  const [modifie, setModifie] = useState(false);
  const [vue, setVue] = useState<'liste' | 'salles' | 'emargement' | 'etiquettes'>('liste');
  const [salleSel, setSalleSel] = useState<number | 'toutes'>('toutes');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [colonnesOk, setColonnesOk] = useState(true);
  // Nombre de candidats par salle, choisi librement par l'école (champ vide tant qu'aucun choix n'est enregistré)
  const [parSalle, setParSalle] = useState('');

  const charger = useCallback(async () => {
    setLoading(true); setErreur(null);
    try {
      const { data: ex, error: e1 } = await supabase.from('examens').select('*').eq('id', examenId).single();
      if (e1) throw new Error(e1.message);
      setExamen(ex);
      setParSalle(ex.candidats_par_salle ? String(ex.candidats_par_salle) : '');
      const { data: et } = await supabase.from('etablissements').select('nom').eq('id', ex.etablissement_id).single();
      setEtab(et?.nom ?? '');

      // candidats (pagination 1000)
      let brut: any[] = [];
      let avecSerie = true;
      for (let d = 0; ; d += 1000) {
        let r: { data: any[] | null; error: any } = await supabase
          .from('examens_candidats')
          .select('id, eleve_id, numero_table, salle, salle_serie, eleves(matricule, classes(nom, serie))')
          .eq('examen_id', examenId).range(d, d + 999);
        if (r.error) {
          avecSerie = false;
          r = await supabase.from('examens_candidats')
            .select('id, eleve_id, eleves(matricule, classes(nom))')
            .eq('examen_id', examenId).range(d, d + 999);
          setColonnesOk(false);
        }
        if (r.error) throw new Error(r.error.message);
        brut = brut.concat(r.data ?? []);
        if ((r.data ?? []).length < 1000) break;
      }
      void avecSerie;

      const ids = brut.map((b) => b.eleve_id);
      const profils = new Map<string, any>();
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('profiles').select('id, nom, prenom').in('id', ids.slice(i, i + 100));
        (data ?? []).forEach((p: any) => profils.set(p.id, p));
      }
      const liste: Cand[] = brut.map((b) => {
        const el = Array.isArray(b.eleves) ? b.eleves[0] : b.eleves;
        const cl = el?.classes ? (Array.isArray(el.classes) ? el.classes[0] : el.classes) : null;
        const p = profils.get(b.eleve_id);
        return {
          id: b.id, eleve_id: b.eleve_id, nom: p?.nom ?? 'Inconnu', prenom: p?.prenom ?? '',
          matricule: el?.matricule ?? null, classe_nom: cl?.nom ?? null,
          serie: serieDe(cl?.nom ?? null, cl?.serie ?? null, ex.serie ?? null),
          numero_table: b.numero_table ?? null, salle: b.salle ?? null, salle_serie: b.salle_serie ?? null,
        };
      });
      liste.sort((a, b) => (a.numero_table ?? 'ZZ').localeCompare(b.numero_table ?? 'ZZ') || a.nom.localeCompare(b.nom));
      setCands(liste);

      const { data: ep } = await supabase.from('examens_matieres').select('nom').eq('examen_id', examenId);
      const noms: string[] = Array.from(new Set<string>((ep ?? []).map((x: any) => String(x.nom).replace(/\s*(écrit|ecrit|oral|pratique)\s*$/i, '').trim()).filter(Boolean)));
      setSuggestions(noms);
      const o = ex.ordre_emargement;
      const base: ColsParSalle = {};
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        for (const k of Object.keys(o)) {
          base[k] = (Array.isArray(o[k]) ? o[k] : []).map((x: any) => ({ m: String(x?.m ?? ''), h: String(x?.h ?? '') }));
        }
      }
      setCols(base); setModifie(false);
    } catch (e: any) {
      setErreur(e.message ?? 'Erreur de chargement');
    } finally { setLoading(false); }
  }, [supabase, examenId]);

  useEffect(() => { charger(); }, [charger]);

  const estBac = /bac/i.test(`${examen?.type ?? ''} ${examen?.nom ?? ''}`);
  const prefixe = prefixeExamen(examen?.nom ?? '', examen?.type);

  async function generer() {
    const taille = Math.floor(Number(parSalle));
    if (!Number.isFinite(taille) || taille < 1) {
      setErreur('Indiquez d’abord le nombre de candidats par salle (1 ou plus).');
      return;
    }
    if (cands.some((c) => c.numero_table) &&
      !window.confirm('Recalculer les N° de table et les salles ? Les anciennes valeurs seront remplacées.')) return;
    setBusy(true); setErreur(null); setInfo(null);
    try {
      // On garde le choix de l'école pour cet examen
      const rs = await supabase.from('examens').update({ candidats_par_salle: taille }).eq('id', examenId);
      if (rs.error) throw new Error(rs.error.message);

      const nums = genererNumeros(cands.map((c) => ({ ...c })), prefixe, anneeCourte(examen?.annee_scolaire));
      const aff = repartirSalles(cands.map((c) => ({ ...c })), nums, estBac, taille);
      const r0 = await supabase.from('examens_candidats')
        .update({ numero_table: null, salle: null, salle_serie: null }).eq('examen_id', examenId);
      if (r0.error) throw new Error(r0.error.message + ' — avez-vous exécuté le SQL examens_tables ?');
      for (let i = 0; i < aff.length; i += 20) {
        const lot = aff.slice(i, i + 20);
        const res = await Promise.all(lot.map((a) => supabase.from('examens_candidats')
          .update({ numero_table: nums.get(a.id), salle: a.salle, salle_serie: a.salle_serie }).eq('id', a.id)));
        const bad = res.find((x) => x.error);
        if (bad?.error) throw new Error(bad.error.message);
      }
      setInfo(`${aff.length} candidats répartis en ${new Set(aff.map((a) => a.salle)).size} salle(s) de ${taille} candidats maximum.`);
      await charger();
    } catch (e: any) { setErreur(e.message); } finally { setBusy(false); }
  }

  function colsDe(n: number): Col[] { return cols[String(n)] ?? []; }
  function majCols(n: number, f: (l: Col[]) => Col[]) {
    setCols((c) => ({ ...c, [String(n)]: f(c[String(n)] ?? []) })); setModifie(true);
  }
  function copierVersToutes(n: number) {
    if (!window.confirm('Copier ces matières dans toutes les autres salles ?')) return;
    const src = colsDe(n).map((c) => ({ ...c }));
    setCols((c) => { const r: ColsParSalle = { ...c };
      salles.forEach((x) => { r[String(x.n)] = src.map((y) => ({ ...y })); }); return r; });
    setModifie(true);
  }
  async function enregistrerCols() {
    setErreur(null); setInfo(null);
    const r = await supabase.from('examens').update({ ordre_emargement: cols }).eq('id', examenId);
    if (r.error) setErreur('Non enregistré (SQL examens_tables à exécuter ?) : ' + r.error.message);
    else { setModifie(false); setInfo('Matières d’émargement enregistrées.'); }
  }

  const salles = useMemo(() => {
    const m = new Map<number, Cand[]>();
    cands.filter((c) => c.salle != null).forEach((c) => {
      if (!m.has(c.salle!)) m.set(c.salle!, []);
      m.get(c.salle!)!.push(c);
    });
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0])
      .map(([n, l]) => ({ n, serie: l[0].salle_serie, liste: l.sort((a, b) => (a.numero_table ?? '').localeCompare(b.numero_table ?? '')) }));
  }, [cands]);

  const sallesAff = salleSel === 'toutes' ? salles : salles.filter((s) => s.n === salleSel);
  const sansNum = cands.filter((c) => !c.numero_table).length;

  if (loading) return <div className="p-4 text-sm">Chargement…</div>;

  const entete = (titre: string, s?: { n: number; serie: string | null }) => (
    <div className="mb-3 text-center">
      <div className="text-xs">{etab}</div>
      <div className="font-bold">{titre} — {examen?.nom} {examen?.annee_scolaire ?? ''}</div>
      {s && <div className="text-sm">Salle {s.n}{s.serie ? ` — Série ${s.serie}` : ''}</div>}
    </div>
  );

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <style>{`@media print { .no-print{display:none!important} .saut{page-break-after:always} @page{size:A4 landscape;margin:10mm} .etq{height:42mm!important;font-size:30pt!important} }
        .etq{height:70px;border:1.5px dashed #444;display:flex;align-items:center;justify-content:center;font-weight:800;font-family:monospace;font-size:clamp(14px,4.6vw,24px);white-space:nowrap;break-inside:avoid;background:#fff}
        .etqgrille{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
        @media print{.etqgrille{grid-template-columns:repeat(4,1fr)}}`}</style>
      <div className="no-print">
        <Link href={`/chef/examens/${examenId}`} className="text-sm text-blue-600">← Retour à l&apos;examen</Link>
        <h1 className="text-xl font-bold my-2">N° de table, salles et émargement</h1>
        <p className="text-xs text-gray-600 mb-3">
          N° de table = {prefixe} + année + 4 derniers chiffres du matricule + lettre finale.
          {estBac ? ' Séries jamais mélangées dans une même salle.' : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
          <label htmlFor="par-salle" className="font-medium">Candidats par salle (maximum)</label>
          <input id="par-salle" type="number" inputMode="numeric" min={1} step={1}
            value={parSalle} placeholder="ex. 20"
            onChange={(e) => setParSalle(e.target.value)}
            className="border rounded p-1.5 w-24" />
          <span className="text-xs text-gray-500">Choix libre de l’école, enregistré pour cet examen.</span>
        </div>
        {!colonnesOk && <div className="bg-amber-50 border border-amber-300 text-sm p-2 rounded mb-2">Exécutez d&apos;abord le SQL « examens_tables » dans Supabase.</div>}
        {erreur && <div className="bg-red-50 border border-red-300 text-sm p-2 rounded mb-2">{erreur}</div>}
        {info && <div className="bg-green-50 border border-green-300 text-sm p-2 rounded mb-2">{info}</div>}
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={generer} disabled={busy || cands.length === 0}
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50">
            {busy ? 'Calcul…' : sansNum > 0 ? 'Générer N° de table et salles' : 'Régénérer'}
          </button>
          <button onClick={() => window.print()} className="px-3 py-2 rounded border text-sm">Imprimer</button>
        </div>
        <div className="flex gap-1 mb-3 text-sm">
          {(['liste', 'salles', 'emargement', 'etiquettes'] as const).map((v) => (
            <button key={v} onClick={() => setVue(v)}
              className={`px-3 py-1.5 rounded border ${vue === v ? 'bg-gray-800 text-white' : ''}`}>
              {v === 'liste' ? 'Liste candidats' : v === 'salles' ? 'Salles' : v === 'emargement' ? 'Émargement' : 'Étiquettes'}
            </button>
          ))}
        </div>
        {vue !== 'liste' && (
          <select className="border rounded p-1.5 text-sm mb-3" value={String(salleSel)}
            onChange={(e) => setSalleSel(e.target.value === 'toutes' ? 'toutes' : Number(e.target.value))}>
            <option value="toutes">Toutes les salles</option>
            {salles.map((s) => <option key={s.n} value={s.n}>Salle {s.n}{s.serie ? ` (${s.serie})` : ''} — {s.liste.length}</option>)}
          </select>
        )}
        {vue === 'emargement' && (
          <div className="border rounded p-2 mb-3 text-sm">
            <datalist id="matieres-sugg">{suggestions.map((m) => <option key={m} value={m} />)}</datalist>
            <div className="font-medium mb-1">Matières à faire signer (par salle)</div>
            <p className="text-xs text-gray-600 mb-2">Ajoutez, dans l&apos;ordre du chronogramme, les matières composées, avec le jour/heure si vous voulez. Vous pouvez corriger, déplacer ou supprimer.</p>
            {salles.length === 0 && <div className="text-gray-500">Générez d&apos;abord les salles.</div>}
            {sallesAff.map((s) => (
              <div key={s.n} className="border rounded p-2 mb-2">
                <div className="font-medium">Salle {s.n}{s.serie ? ` — Série ${s.serie}` : ''}</div>
                {colsDe(s.n).map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1 py-1">
                    <span className="w-5 text-xs">{i + 1}.</span>
                    <input list="matieres-sugg" value={c.m} placeholder="Matière"
                      onChange={(e) => majCols(s.n, (l) => l.map((x, k) => k === i ? { ...x, m: e.target.value } : x))}
                      className="border rounded p-1 w-36" />
                    <input value={c.h} placeholder="Jour / heure"
                      onChange={(e) => majCols(s.n, (l) => l.map((x, k) => k === i ? { ...x, h: e.target.value } : x))}
                      className="border rounded p-1 w-28" />
                    <button disabled={i === 0} className="px-2 border rounded disabled:opacity-30"
                      onClick={() => majCols(s.n, (l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>↑</button>
                    <button disabled={i === colsDe(s.n).length - 1} className="px-2 border rounded disabled:opacity-30"
                      onClick={() => majCols(s.n, (l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>↓</button>
                    <button className="px-2 border rounded text-red-600"
                      onClick={() => majCols(s.n, (l) => l.filter((_, k) => k !== i))}>✕</button>
                  </div>
                ))}
                <div className="flex gap-2 mt-1">
                  <button className="px-2 py-1 border rounded" onClick={() => majCols(s.n, (l) => [...l, { m: '', h: '' }])}>+ Ajouter une matière</button>
                  <button className="px-2 py-1 border rounded" onClick={() => copierVersToutes(s.n)}>Copier vers toutes les salles</button>
                </div>
              </div>
            ))}
            <button onClick={enregistrerCols} disabled={!modifie}
              className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-40">Enregistrer</button>
            {modifie && <span className="ml-2 text-xs text-amber-700">Modifications non enregistrées</span>}
          </div>
        )}
      </div>

      {vue === 'liste' && (
        <div>
          {entete('Liste des candidats')}
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-gray-100">
              <th className="border p-1">N° Table</th><th className="border p-1 text-left">Nom et prénoms</th>
              <th className="border p-1">Matricule</th><th className="border p-1">Classe</th>
              {estBac && <th className="border p-1">Série</th>}<th className="border p-1">Salle</th>
            </tr></thead>
            <tbody>{cands.map((c) => (
              <tr key={c.id}>
                <td className="border p-1 font-mono text-center">{c.numero_table ?? '—'}</td>
                <td className="border p-1">{c.nom} {c.prenom}</td>
                <td className="border p-1 text-center">{c.matricule ?? '-'}</td>
                <td className="border p-1 text-center">{c.classe_nom ?? '-'}</td>
                {estBac && <td className="border p-1 text-center">{c.serie ?? '-'}</td>}
                <td className="border p-1 text-center">{c.salle ?? '—'}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}

      {vue === 'salles' && sallesAff.map((s) => (
        <div key={s.n} className="saut mb-6">
          {entete('Liste de salle', s)}
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-gray-100">
              <th className="border p-1 w-8">N°</th><th className="border p-1">N° Table</th>
              <th className="border p-1 text-left">Nom et prénoms</th><th className="border p-1">Matricule</th>
            </tr></thead>
            <tbody>{s.liste.map((c, i) => (
              <tr key={c.id}>
                <td className="border p-1 text-center">{i + 1}</td>
                <td className="border p-1 font-mono text-center">{c.numero_table}</td>
                <td className="border p-1">{c.nom} {c.prenom}</td>
                <td className="border p-1 text-center">{c.matricule ?? '-'}</td>
              </tr>))}
            </tbody>
          </table>
          <div className="text-xs mt-1">Effectif : {s.liste.length}</div>
        </div>
      ))}

      {vue === 'emargement' && sallesAff.map((s) => (
        <div key={s.n} className="saut mb-6">
          {entete('Liste d’émargement', s)}
          <table className="w-full text-xs border-collapse">
            <thead><tr className="bg-gray-100">
              <th className="border p-1 w-6">N°</th><th className="border p-1">N° Table</th>
              <th className="border p-1 text-left">Nom et prénoms</th>
              {colsDe(s.n).map((c, k) => <th key={k} className="border p-1">{c.m}{c.h ? <div className="font-normal">{c.h}</div> : null}</th>)}
            </tr></thead>
            <tbody>{s.liste.map((c, i) => (
              <tr key={c.id} style={{ height: 34 }}>
                <td className="border p-1 text-center">{i + 1}</td>
                <td className="border p-1 font-mono text-center">{c.numero_table}</td>
                <td className="border p-1">{c.nom} {c.prenom}</td>
                {colsDe(s.n).map((_, k) => <td key={k} className="border p-1" />)}
              </tr>))}
            </tbody>
          </table>
        </div>
      ))}

      {vue === 'etiquettes' && sallesAff.map((s) => (
        <div key={s.n} className="saut mb-6">
          <div className="text-xs text-gray-500 mb-1 no-print">Salle {s.n}{s.serie ? ` — Série ${s.serie}` : ''} — découpez le long des pointillés</div>
          <div className="etqgrille">
            {s.liste.map((c) => <div key={c.id} className="etq">{c.numero_table}</div>)}
          </div>
        </div>
      ))}

      {vue !== 'liste' && salles.length === 0 && (
        <div className="text-sm text-gray-600">Aucune salle : cliquez sur « Générer ».</div>
      )}
    </div>
  );
}