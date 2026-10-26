'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type CandSalle = { id: string; numero_table: string | null; salle: number | null; salle_serie: string | null };
type Col = { m: string; h: string };
type Salle = { n: number; serie: string | null; effectif: number; de: string; au: string };
type Feuille = { cle: string; salle: Salle; epreuve: string; heure: string };

// Champs communs à toutes les feuilles (en-tête)
type Glob = {
  dren: string; ecole: string; tel: string; email: string;
  annee: string; code: string; statut: string; titre: string;
};
// Champs propres à chaque feuille (salle + épreuve)
type Champs = {
  date: string; heure: string; epreuve: string; serie: string; de: string; au: string;
  salle: string; inscrits: string; absents: string; presents: string; copies: string;
};

const POINTILLES = '.'.repeat(90);

export default function PvEpreuvePage() {
  const params = useParams();
  const examenId = params?.id as string;
  const supabase = useMemo(() => createClient(), []);
  const cleStockage = `egs-pv-epreuve-${examenId}`;

  const [examen, setExamen] = useState<any>(null);
  const [globDef, setGlobDef] = useState<Glob | null>(null);
  const [gv, setGv] = useState<Partial<Glob>>({});
  const [fv, setFv] = useState<Record<string, Partial<Champs>>>({});
  const [cands, setCands] = useState<CandSalle[]>([]);
  const [cols, setCols] = useState<Record<string, Col[]>>({});
  const [salleSel, setSalleSel] = useState<number | 'toutes'>('toutes');
  const [epreuveSel, setEpreuveSel] = useState<string>('toutes');
  const [nbSurveillants, setNbSurveillants] = useState(3);
  const [nbCopies, setNbCopies] = useState(4);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const pret = useRef(false);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const { data: ex, error: e1 } = await supabase.from('examens').select('*').eq('id', examenId).single();
      if (e1) throw new Error(e1.message);
      setExamen(ex);

      const { data: et } = await supabase.from('etablissements').select('*').eq('id', ex.etablissement_id).single();
      setGlobDef({
        dren: et?.dren ?? '',
        ecole: et?.nom ?? '',
        tel: et?.telephone ?? '',
        email: et?.email ?? '',
        annee: ex.annee_scolaire ?? '',
        code: et?.code_etablissement ?? '',
        statut: et?.statut_juridique ?? '',
        titre: String(ex.nom ?? '').toUpperCase(),
      });

      let brut: CandSalle[] = [];
      for (let d = 0; ; d += 1000) {
        const r = await supabase
          .from('examens_candidats')
          .select('id, numero_table, salle, salle_serie')
          .eq('examen_id', examenId)
          .range(d, d + 999);
        if (r.error) throw new Error(r.error.message + ' — avez-vous exécuté le SQL examens_tables ?');
        brut = brut.concat((r.data ?? []) as CandSalle[]);
        if ((r.data ?? []).length < 1000) break;
      }
      setCands(brut);

      const o = ex.ordre_emargement;
      const base: Record<string, Col[]> = {};
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        for (const k of Object.keys(o)) {
          base[k] = (Array.isArray(o[k]) ? o[k] : [])
            .map((x: any) => ({ m: String(x?.m ?? '').trim(), h: String(x?.h ?? '').trim() }))
            .filter((x: Col) => x.m);
        }
      }
      setCols(base);

      // Corrections déjà saisies sur cet appareil
      try {
        const s = window.localStorage.getItem(cleStockage);
        if (s) {
          const p = JSON.parse(s);
          if (p && typeof p === 'object') {
            setGv(p.gv && typeof p.gv === 'object' ? p.gv : {});
            setFv(p.fv && typeof p.fv === 'object' ? p.fv : {});
          }
        }
      } catch { /* stockage indisponible : on continue sans */ }
      pret.current = true;
    } catch (e: any) {
      setErreur(e.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [supabase, examenId, cleStockage]);

  useEffect(() => { charger(); }, [charger]);

  // Sauvegarde automatique des corrections sur l'appareil
  useEffect(() => {
    if (!pret.current) return;
    try { window.localStorage.setItem(cleStockage, JSON.stringify({ gv, fv })); } catch { /* ignoré */ }
  }, [gv, fv, cleStockage]);

  const salles: Salle[] = useMemo(() => {
    const m = new Map<number, CandSalle[]>();
    cands.filter((c) => c.salle != null).forEach((c) => {
      if (!m.has(c.salle!)) m.set(c.salle!, []);
      m.get(c.salle!)!.push(c);
    });
    return Array.from(m.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([n, l]) => {
        const nums = l.map((c) => c.numero_table ?? '').filter(Boolean).sort();
        return { n, serie: l[0].salle_serie, effectif: l.length, de: nums[0] ?? '', au: nums[nums.length - 1] ?? '' };
      });
  }, [cands]);

  const epreuvesDispo = useMemo(() => {
    const s = new Set<string>();
    Object.values(cols).forEach((l) => l.forEach((c) => s.add(c.m)));
    return Array.from(s);
  }, [cols]);

  // Une feuille par salle et par épreuve ; sans épreuve saisie : une feuille à compléter ici
  const feuilles: Feuille[] = useMemo(() => {
    const out: Feuille[] = [];
    const sallesAff = salleSel === 'toutes' ? salles : salles.filter((s) => s.n === salleSel);
    for (const s of sallesAff) {
      const l = cols[String(s.n)] ?? [];
      if (l.length === 0) {
        if (epreuveSel === 'toutes') out.push({ cle: `${s.n}|`, salle: s, epreuve: '', heure: '' });
        continue;
      }
      for (const c of l) {
        if (epreuveSel !== 'toutes' && c.m !== epreuveSel) continue;
        out.push({ cle: `${s.n}|${c.m}`, salle: s, epreuve: c.m, heure: c.h });
      }
    }
    return out;
  }, [salles, cols, salleSel, epreuveSel]);

  if (loading) return <div className="p-4 text-sm">Chargement…</div>;
  if (!examen || !globDef) return <div className="p-4 text-sm text-red-600">{erreur ?? 'Examen introuvable.'}</div>;

  const g: Glob = { ...globDef, ...gv };
  const majGlob = (champ: keyof Glob, v: string) => setGv((x) => ({ ...x, [champ]: v }));

  const valeurs = (f: Feuille): Champs => {
    const def: Champs = {
      date: '', heure: f.heure, epreuve: f.epreuve, serie: f.salle.serie ?? '',
      de: f.salle.de, au: f.salle.au, salle: String(f.salle.n),
      inscrits: String(f.salle.effectif), absents: '', presents: '', copies: '',
    };
    return { ...def, ...(fv[f.cle] ?? {}) };
  };
  const majFeuille = (cle: string, champ: keyof Champs, v: string) =>
    setFv((x) => ({ ...x, [cle]: { ...(x[cle] ?? {}), [champ]: v } }));

  const nbCorrections = Object.keys(gv).length + Object.values(fv).reduce((t, o) => t + Object.keys(o).length, 0);
  function reinitialiser() {
    if (!window.confirm('Effacer toutes vos corrections et revenir aux valeurs automatiques ?')) return;
    setGv({}); setFv({});
  }

  const lignes = (n: number) => Array.from({ length: Math.max(1, n) }, (_, i) => i);

  // Champ de saisie : cadre pointillé à l'écran, texte simple à l'impression
  const champ = (valeur: string, onChange: (v: string) => void, largeur: number | string, extra?: string, ph?: string) => (
    <input
      value={valeur}
      placeholder={ph ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={`pv-in ${extra ?? ''}`}
      style={{ width: largeur }}
    />
  );

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .pv-feuille { page-break-after: always; break-after: page; border: none !important; padding: 0 !important; margin: 0 !important; }
          .pv-feuille:last-child { page-break-after: auto; break-after: auto; }
          .pv-in { border-bottom: none !important; background: transparent !important; }
          .pv-in::placeholder { color: transparent !important; }
          @page { size: A4 portrait; margin: 10mm; }
        }
        .pv-feuille { background: #fff; color: #000; }
        .pv-cadre td, .pv-cadre th { border: 1px solid #000; padding: 4px 6px; }
        .pv-pointilles { white-space: nowrap; overflow: hidden; letter-spacing: 1px; color: #444; line-height: 1.3; }
        .pv-in { font: inherit; font-weight: 700; color: #000; background: #f3f8ff; border: none; border-bottom: 1px dotted #555; padding: 1px 3px; max-width: 100%; border-radius: 0; outline: none; }
        .pv-in:focus { background: #fffbe0; border-bottom: 1px solid #1d4ed8; }
        .pv-in::placeholder { color: #9aa3b0; font-weight: 400; }
      `}</style>

      <div className="no-print">
        <Link href={`/chef/examens/${examenId}`} className="text-sm text-blue-600">← Retour à l&apos;examen</Link>
        <h1 className="text-xl font-bold my-2">PV de l&apos;épreuve — surveillance</h1>
        <p className="text-xs text-gray-600 mb-3">
          Une feuille par salle et par épreuve. Les cases sur fond bleu sont pré-remplies mais <strong>toutes modifiables</strong> :
          corrigez-les directement dans la feuille avant d&apos;imprimer. Vos corrections sont gardées sur cet appareil.
          Les épreuves viennent de l&apos;onglet « Émargement » de la page N° table / Salles.
        </p>

        {erreur && <div className="bg-red-50 border border-red-300 text-sm p-2 rounded mb-2">{erreur}</div>}

        {salles.length === 0 && (
          <div className="bg-amber-50 border border-amber-300 text-sm p-2 rounded mb-2">
            Aucune salle pour cet examen. Générez d&apos;abord les N° de table et les salles.{' '}
            <Link href={`/chef/examens/${examenId}/salles`} className="text-blue-600 underline">Aller aux salles</Link>
          </div>
        )}
        {salles.length > 0 && Object.keys(cols).length === 0 && (
          <div className="bg-amber-50 border border-amber-300 text-sm p-2 rounded mb-2">
            Aucune épreuve saisie dans l&apos;émargement : tapez l&apos;épreuve directement dans chaque feuille.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
          <select className="border rounded p-1.5" value={String(salleSel)}
            onChange={(e) => setSalleSel(e.target.value === 'toutes' ? 'toutes' : Number(e.target.value))}>
            <option value="toutes">Toutes les salles</option>
            {salles.map((s) => (
              <option key={s.n} value={s.n}>Salle {s.n}{s.serie ? ` (${s.serie})` : ''} — {s.effectif}</option>
            ))}
          </select>
          <select className="border rounded p-1.5" value={epreuveSel} onChange={(e) => setEpreuveSel(e.target.value)}>
            <option value="toutes">Toutes les épreuves</option>
            {epreuvesDispo.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <label className="flex items-center gap-1">Lignes surveillants
            <input type="number" min={1} max={10} value={nbSurveillants}
              onChange={(e) => setNbSurveillants(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              className="border rounded p-1 w-14" />
          </label>
          <label className="flex items-center gap-1">Lignes réception des copies
            <input type="number" min={1} max={10} value={nbCopies}
              onChange={(e) => setNbCopies(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              className="border rounded p-1 w-14" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => window.print()} disabled={feuilles.length === 0}
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50">
            Imprimer / Export PDF ({feuilles.length} feuille{feuilles.length > 1 ? 's' : ''})
          </button>
          {nbCorrections > 0 && (
            <button onClick={reinitialiser} className="px-3 py-2 rounded border text-sm">
              Effacer mes corrections ({nbCorrections})
            </button>
          )}
        </div>
      </div>

      {feuilles.map((f) => {
        const v = valeurs(f);
        const set = (c: keyof Champs) => (val: string) => majFeuille(f.cle, c, val);
        return (
          <div key={f.cle} className="pv-feuille border rounded p-4 mb-6 text-xs">
            {/* En-tête ministériel */}
            <div className="flex justify-between gap-3 mb-3">
              <div className="text-center" style={{ width: '48%' }}>
                <p className="font-bold uppercase">Ministère de l&apos;Éducation Nationale, de l&apos;Alphabétisation et de l&apos;Enseignement Technique</p>
                <div className="mt-1">{champ(g.dren, (x) => majGlob('dren', x), '100%', 'text-center uppercase', 'DRENAET')}</div>
                <div className="mt-2">{champ(g.ecole, (x) => majGlob('ecole', x), '100%', 'text-center uppercase', 'Nom de l’établissement')}</div>
                <div className="flex items-center justify-center gap-1 mt-1">Tél : {champ(g.tel, (x) => majGlob('tel', x), '60%', '', 'Téléphone')}</div>
                <div className="flex items-center justify-center gap-1 mt-1">Email : {champ(g.email, (x) => majGlob('email', x), '60%', '', 'Email')}</div>
              </div>
              <div className="text-center" style={{ width: '48%' }}>
                <p className="font-bold uppercase">République de Côte d&apos;Ivoire</p>
                <p className="italic">Union - Discipline - Travail</p>
                <div className="flex items-center justify-center gap-1 mt-2">Année scolaire : {champ(g.annee, (x) => majGlob('annee', x), '45%', 'text-center')}</div>
                <div className="flex items-center justify-center gap-1 mt-1">
                  Code : {champ(g.code, (x) => majGlob('code', x), '30%', 'text-center', '—')}
                  Statut : {champ(g.statut, (x) => majGlob('statut', x), '28%', 'text-center', '—')}
                </div>
              </div>
            </div>

            {/* Titre */}
            <div className="flex justify-center mb-3">
              <div className="border-2 border-black text-center px-4 py-1.5" style={{ width: '70%' }}>
                {champ(g.titre, (x) => majGlob('titre', x), '100%', 'text-center uppercase', 'Intitulé de l’examen')}
                <p className="font-bold">PROCÈS-VERBAL DE L&apos;ÉPREUVE</p>
              </div>
            </div>

            {/* Cadre d'identification */}
            <div className="overflow-x-auto mb-4">
              <table className="pv-cadre w-full border-collapse" style={{ border: '1px solid #000' }}>
                <tbody>
                  <tr>
                    <td colSpan={2}>DREN/DDEN : {champ(g.dren, (x) => majGlob('dren', x), '70%', '', 'DRENAET')}</td>
                  </tr>
                  <tr>
                    <td>Date : {champ(v.date, set('date'), '60%', '', 'jj/mm/aaaa')}</td>
                    <td>Heure : {champ(v.heure, set('heure'), '60%', '', 'ex. 8h-10h')}</td>
                  </tr>
                  <tr>
                    <td>Épreuve : {champ(v.epreuve, set('epreuve'), '65%', '', 'Matière')}</td>
                    <td>Série(s) : {champ(v.serie, set('serie'), '55%', '', 'Série')}</td>
                  </tr>
                  <tr>
                    <td>
                      Numéro de table : de N° {champ(v.de, set('de'), '28%')} au N° {champ(v.au, set('au'), '28%')}
                    </td>
                    <td>Salle N° : {champ(v.salle, set('salle'), '40%')}</td>
                  </tr>
                  <tr>
                    <td>Nombre de candidats inscrits : {champ(v.inscrits, set('inscrits'), 50, 'text-center')}</td>
                    <td>Nombre de candidats absents* : {champ(v.absents, set('absents'), 50, 'text-center', '…')}</td>
                  </tr>
                  <tr>
                    <td>Nombre de candidats présents : {champ(v.presents, set('presents'), 50, 'text-center', '…')}</td>
                    <td>Nombre de copies remises** : {champ(v.copies, set('copies'), 50, 'text-center', '…')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* A/ Observations des surveillants */}
            <p className="font-bold underline mb-2">A/ Observations des surveillants de la salle de composition</p>
            <p className="mb-1">• Numéros des candidats absents :</p>
            <div className="pv-pointilles mb-1">{POINTILLES}</div>
            <div className="pv-pointilles mb-2">{POINTILLES}</div>
            <p className="mb-1">• Observations sur le déroulement :</p>
            <div className="pv-pointilles mb-1">{POINTILLES}</div>
            <div className="pv-pointilles mb-1">{POINTILLES}</div>
            <div className="pv-pointilles mb-3">{POINTILLES}</div>

            <div className="overflow-x-auto mb-4">
              <table className="pv-cadre w-full border-collapse" style={{ border: '1px solid #000' }}>
                <thead>
                  <tr className="text-center">
                    <th style={{ width: 40 }}>N°</th>
                    <th>NOM ET PRÉNOMS DES SURVEILLANTS</th>
                    <th style={{ width: 150 }}>ÉTABLISSEMENT D&apos;ORIGINE</th>
                    <th style={{ width: 110 }}>SIGNATURE</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes(nbSurveillants).map((i) => (
                    <tr key={i} style={{ height: 30 }}>
                      <td className="text-center">{i + 1}</td><td></td><td></td><td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* B/ Observations du secrétaire */}
            <p className="font-bold underline mb-2">B/ Observations du secrétaire lors de la réception des copies</p>
            <div className="pv-pointilles mb-1">{POINTILLES}</div>
            <div className="pv-pointilles mb-1">{POINTILLES}</div>
            <div className="pv-pointilles mb-3">{POINTILLES}</div>

            <div className="overflow-x-auto mb-3">
              <table className="pv-cadre w-full border-collapse" style={{ border: '1px solid #000' }}>
                <thead>
                  <tr className="text-center">
                    <th style={{ width: 40 }}>N°</th>
                    <th>NOM ET PRÉNOMS</th>
                    <th style={{ width: 150 }}>ÉTABLISSEMENT D&apos;ORIGINE</th>
                    <th style={{ width: 110 }}>SIGNATURE</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes(nbCopies).map((i) => (
                    <tr key={i} style={{ height: 30 }}>
                      <td className="text-center">{i + 1}</td><td></td><td></td><td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ fontSize: 10 }}>
              * Remplir une feuille de copie pour chaque candidat absent (nom, prénoms et n° de table, n° matricule, code centre,
              matière) et y mentionner « ABSENT » obligatoirement. ** Les copies (y compris celles des absents) seront classées par
              ordre croissant des numéros de table.
            </p>
            <p style={{ fontSize: 10 }} className="mt-1">
              N.B. : Ce PV fait foi de la régularité des copies de la salle et engage la responsabilité des signataires.
            </p>
          </div>
        );
      })}

      {feuilles.length === 0 && salles.length > 0 && (
        <div className="text-sm text-gray-600">Aucune feuille pour ce filtre.</div>
      )}
    </div>
  );
}
