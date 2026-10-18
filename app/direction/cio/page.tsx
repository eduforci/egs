'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { abregerMatiere } from '@/lib/matieres-abrev';
import { OptionsPeriodes, usePeriodes } from '@/components/periodes';

type Ens = { id: string; nom: string; prenom: string };
type Case = { faits: number; enseignants: Ens[] } | null;
type Donnees = {
  annee: string; trimestre: number; maj: string;
  matieres: { id: string; nom: string }[];
  classes: { id: string; nom: string; effectif: number; cases: Record<string, Case> }[];
};
type Etat = 'rouge' | 'jaune' | 'vert' | 'vide';

const etatDe = (faits: number, eff: number): Etat => (eff === 0 ? 'vide' : faits <= 0 ? 'rouge' : faits >= eff ? 'vert' : 'jaune');
const COULEUR: Record<Etat, string> = {
  rouge: 'bg-red-500 text-white', jaune: 'bg-yellow-300 text-yellow-950', vert: 'bg-green-500 text-white', vide: 'bg-gray-100 text-gray-400',
};
const EMOJI: Record<Etat, string> = { rouge: '🔴', jaune: '🟡', vert: '🟢', vide: '⚪' };
const nomEns = (e: Ens) => `${e.prenom} ${e.nom}`.trim() || 'Enseignant';

export default function CioPage() {
  const { libelle } = usePeriodes();
  const [trimestre, setTrimestre] = useState(1);
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState('');
  const [premier, setPremier] = useState(true);
  const [manque, setManque] = useState(false);
  const [vue, setVue] = useState<'tableau' | 'enseignants'>('tableau');
  const [copie, setCopie] = useState(false);
  const enCours = useRef(false);

  const charger = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    try {
      const r = await fetch(`/api/cio?trimestre=${trimestre}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Chargement impossible.');
      setD(j as Donnees);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      enCours.current = false;
      setPremier(false);
    }
  }, [trimestre]);

  // mise à jour automatique : les couleurs changent seules quand une moyenne est ajoutée ou retirée
  useEffect(() => {
    setPremier(true);
    charger();
    const t = setInterval(() => { if (document.visibilityState === 'visible') charger(); }, 15000);
    const v = () => { if (document.visibilityState === 'visible') charger(); };
    document.addEventListener('visibilitychange', v);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); };
  }, [charger]);

  const resume = useMemo(() => {
    const r = { rouge: 0, jaune: 0, vert: 0 };
    d?.classes.forEach((c) => Object.values(c.cases).forEach((x) => { if (x) { const e = etatDe(x.faits, c.effectif); if (e !== 'vide') r[e]++; } }));
    return r;
  }, [d]);

  // retards regroupés par enseignant, pour le message WhatsApp
  type Retard = { nom: string; lignes: { classe: string; matiere: string; faits: number; eff: number; etat: Etat }[] };
  const retards = useMemo<Map<string, Retard>>(() => {
    const par = new Map<string, Retard>();
    if (!d) return par;
    const nomMat = new Map<string, string>(d.matieres.map((m) => [m.id, m.nom] as [string, string]));
    d.classes.forEach((c) => Object.entries(c.cases).forEach(([mid, x]) => {
      if (!x) return;
      const etat = etatDe(x.faits, c.effectif);
      if (etat === 'vert' || etat === 'vide') return;
      const profs = x.enseignants.length ? x.enseignants : [{ id: '_sans', nom: '', prenom: '' }];
      profs.forEach((p) => {
        const e = par.get(p.id) ?? { nom: p.id === '_sans' ? 'Sans enseignant affecté' : nomEns(p), lignes: [] };
        e.lignes.push({ classe: c.nom, matiere: nomMat.get(mid) ?? '', faits: x.faits, eff: c.effectif, etat });
        par.set(p.id, e);
      });
    }));
    return par;
  }, [d]);

  const message = useMemo(() => {
    if (!d) return '';
    const quand = new Date(d.maj).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const blocs = (Array.from(retards.entries()) as [string, Retard][])
      .sort((a, b) => (a[0] === '_sans' ? 1 : b[0] === '_sans' ? -1 : a[1].nom.localeCompare(b[1].nom, 'fr')))
      .map(([id, e]) => `${id === '_sans' ? '⚠️' : '👤'} *${e.nom}*\n` +
        e.lignes.map((l) => `• ${l.classe} – ${l.matiere} : ${l.faits}/${l.eff} ${EMOJI[l.etat]}`).join('\n'));
    if (blocs.length === 0) return `✅ ${libelle(d.trimestre)} : toutes les moyennes ont été remontées (${quand}). Merci à tous !`;
    return `📊 *Moyennes du ${libelle(d.trimestre).toLowerCase()}* (point du ${quand})\n🔴 aucune moyenne remontée · 🟡 en cours\n\n${blocs.join('\n\n')}\n\nMerci de remonter les moyennes manquantes au plus vite.`;
  }, [d, retards]);

  const copier = async () => {
    try { await navigator.clipboard.writeText(message); setCopie(true); setTimeout(() => setCopie(false), 2500); }
    catch { window.prompt('Copiez le message :', message); }
  };

  const classesAffichees = d ? d.classes.filter((c) => !manque || Object.values(c.cases).some((x) => x && ['rouge', 'jaune'].includes(etatDe(x.faits, c.effectif)))) : [];

  return (
    <main className="max-w-full mx-auto p-3 pb-16 space-y-3">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } body { background: #fff; } }`}</style>

      <div className="print:hidden space-y-3">
        <div>
          <h1 className="text-xl font-bold">Suivi des moyennes remontées</h1>
          <p className="text-xs text-gray-500">
            Chaque case montre le nombre d'élèves dont la moyenne est remontée sur l'effectif de la classe. Mise à jour automatique toutes les 15 secondes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))} className="border rounded-md px-3 py-2 text-sm">
            <OptionsPeriodes />
          </select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={manque} onChange={(e) => setManque(e.target.checked)} /> Seulement les classes en retard</label>
          <button onClick={() => window.print()} className="border rounded-md px-3 py-2 text-sm bg-white">Imprimer</button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-red-500 text-white">Rouge : aucune moyenne ({resume.rouge})</span>
          <span className="px-2 py-1 rounded bg-yellow-300 text-yellow-950">Jaune : en cours ({resume.jaune})</span>
          <span className="px-2 py-1 rounded bg-green-500 text-white">Vert : complet ({resume.vert})</span>
        </div>

        <div className="flex gap-1 text-sm">
          <button onClick={() => setVue('tableau')} className={`flex-1 border rounded-md py-2 ${vue === 'tableau' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Tableau des classes</button>
          <button onClick={() => setVue('enseignants')} className={`flex-1 border rounded-md py-2 ${vue === 'enseignants' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Message WhatsApp</button>
        </div>

        {erreur && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3">{erreur}</div>}
        {premier && <p className="text-sm text-gray-500">Chargement…</p>}
        {d && <p className="text-[11px] text-gray-400">Dernière mise à jour : {new Date(d.maj).toLocaleTimeString('fr-FR')}</p>}
      </div>

      {d && vue === 'tableau' && (
        <div className="overflow-x-auto border rounded-lg print:border-0">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-1 text-left sticky left-0 bg-gray-100 z-10">Classe</th>
                {d.matieres.map((m) => <th key={m.id} className="border px-1.5 py-1 min-w-[56px]" title={m.nom}>{abregerMatiere(m.nom)}</th>)}
              </tr>
            </thead>
            <tbody>
              {classesAffichees.map((c) => (
                <tr key={c.id}>
                  <td className="border px-2 py-1 font-medium whitespace-nowrap sticky left-0 bg-white z-10">
                    {c.nom} <span className="text-[10px] text-gray-400">({c.effectif})</span>
                  </td>
                  {d.matieres.map((m) => {
                    const x = c.cases[m.id];
                    if (!x) return <td key={m.id} className="border px-1 py-1 text-center text-gray-300">—</td>;
                    const e = etatDe(x.faits, c.effectif);
                    return (
                      <td key={m.id} className={`border px-1 py-1 text-center ${COULEUR[e]}`} title={x.enseignants.map(nomEns).join(', ') || 'Aucun enseignant affecté'}>
                        <div className="font-semibold">{x.faits}/{c.effectif}</div>
                        <div className="text-[9px] opacity-90 truncate max-w-[64px]">{x.enseignants[0]?.nom || '—'}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {classesAffichees.length === 0 && <tr><td className="p-3 text-gray-400" colSpan={d.matieres.length + 1}>Aucune classe à afficher.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {d && vue === 'enseignants' && (
        <div className="space-y-3 print:hidden">
          <p className="text-sm text-gray-600">
            Message prêt à envoyer dans le groupe WhatsApp des enseignants : il liste, pour chaque enseignant, les classes dont les moyennes manquent.
          </p>
          <textarea readOnly value={message} rows={14} className="w-full border rounded-md p-2 text-sm font-mono bg-gray-50" />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copier} className="rounded-md py-2.5 text-sm border bg-white">{copie ? 'Copié ✓' : 'Copier le message'}</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
              className="rounded-md py-2.5 text-sm bg-green-600 text-white text-center">Envoyer sur WhatsApp</a>
          </div>
          <p className="text-[11px] text-gray-500">WhatsApp s'ouvre avec le message : choisis le groupe des enseignants, puis envoie.</p>
        </div>
      )}
    </main>
  );
}
