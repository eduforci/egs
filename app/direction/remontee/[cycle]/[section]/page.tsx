'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { inferCycle } from '@/lib/espaces';

// Remontée officielle : maternelle, primaire et CEPE.
// Les menus et l'accès à ces pages sont limités à l'espace concerné (voir lib/menus-espaces.ts).
// Les fichiers exportés reprennent les données de l'école en colonnes standard :
// le format exact exigé par les structures officielles (AGCP, DECO...) reste à confirmer.

type Section = { cle: string; label: string };
type Def = { label: string; classeCycle: 'maternelle' | 'primaire'; niveau?: RegExp; sections: Section[] };

const CYCLES: Record<string, Def> = {
  maternelle: {
    label: 'Maternelle',
    classeCycle: 'maternelle',
    sections: [
      { cle: 'eleves', label: 'Données des élèves' },
      { cle: 'effectifs', label: 'Effectifs' },
      { cle: 'export', label: 'Export des données' },
    ],
  },
  primaire: {
    label: 'Primaire',
    classeCycle: 'primaire',
    sections: [
      { cle: 'fichier-national', label: 'Fichier National des Élèves' },
      { cle: 'matricules', label: 'Matricules AGCP' },
      { cle: 'eleves', label: 'Données élèves' },
      { cle: 'moyennes-trimestrielles', label: 'Moyennes trimestrielles' },
      { cle: 'moyennes-annuelles', label: 'Moyennes annuelles' },
      { cle: 'transferts', label: 'Transferts' },
      { cle: 'recherche', label: 'Recherche matricule' },
      { cle: 'export', label: 'Export AGCP' },
    ],
  },
  cepe: {
    label: 'CEPE',
    classeCycle: 'primaire',
    niveau: /cm\s*2/i,
    sections: [
      { cle: 'candidats', label: 'Liste des candidats' },
      { cle: 'verification', label: 'Vérification des matricules' },
      { cle: 'donnees', label: 'Données candidats' },
      { cle: 'export', label: 'Export DECO' },
    ],
  },
};

type Eleve = { id: string; matricule: string; nom: string; prenom: string; sexe: string; naissance: string; lieu: string; classeId: string; classe: string; niveau: string };
type Bulletin = { eleve_id: string; trimestre: number; moyenne_generale: number | null };
type Cell = string | number | null;

const lots = <T,>(l: T[], n: number) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));
const moy = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(2).replace('.', ','));
const cmp = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

async function lireTout(requete: (de: number, a: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let d = 0; d < 50000; d += 1000) {
    const { data, error } = await requete(d, d + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

function telecharger(nom: string, entetes: string[], lignes: Cell[][]) {
  // Les cellules qui commencent par = + - @ sont neutralisées (protection des tableurs)
  const esc = (v: any) => {
    let t = String(v ?? '');
    if (/^[=+\-@]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = "'" + t;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const txt = '\uFEFF' + [entetes, ...lignes].map((l) => l.map(esc).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = nom;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Tableau({ entetes, lignes }: { entetes: string[]; lignes: Cell[][] }) {
  return (
    <div className="overflow-x-auto border rounded-xl bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
          <tr>{entetes.map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-t">
              {l.map((c, j) => <td key={j} className="px-3 py-2 whitespace-nowrap">{c === null || c === '' ? '—' : c}</td>)}
            </tr>
          ))}
          {lignes.length === 0 && (
            <tr><td colSpan={entetes.length} className="px-3 py-6 text-center text-neutral-400">Aucune donnée.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Cartes({ items }: { items: [string, number][] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map(([l, n]) => (
        <div key={l} className="border rounded-xl p-4 text-center bg-white">
          <div className="text-2xl font-bold">{n}</div>
          <div className="text-xs text-neutral-500">{l}</div>
        </div>
      ))}
    </div>
  );
}

function BoutonCsv({ fichier, entetes, lignes }: { fichier: string; entetes: string[]; lignes: Cell[][] }) {
  return (
    <button
      onClick={() => telecharger(fichier, entetes, lignes)}
      disabled={lignes.length === 0}
      className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
    >
      Exporter en CSV
    </button>
  );
}

export default function RemonteePage() {
  const { cycle: cycleCle, section } = useParams<{ cycle: string; section: string }>();
  const def = CYCLES[cycleCle];
  const supabase = createClient();

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [ecole, setEcole] = useState('');
  const [annee, setAnnee] = useState('');
  const [classes, setClasses] = useState<{ id: string; nom: string; niveau: string }[]>([]);
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [transferts, setTransferts] = useState<any[]>([]);
  const [recherche, setRecherche] = useState('');

  const besoinBulletins = ['moyennes-trimestrielles', 'moyennes-annuelles', 'export'].includes(section) && cycleCle === 'primaire';
  const besoinTransferts = section === 'transferts';

  useEffect(() => {
    if (!def) return;
    (async () => {
      setChargement(true);
      setErreur('');
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data: profil } = await supabase.from('profiles').select('etablissement_id').eq('id', u.user.id).single();
      if (!profil?.etablissement_id) { setErreur('Établissement introuvable pour ce compte.'); setChargement(false); return; }
      const etabId = profil.etablissement_id;

      const { data: etab } = await supabase.from('etablissements').select('nom, annee_scolaire_active').eq('id', etabId).single();
      setEcole(etab?.nom || '');
      const anneeActive = (etab as any)?.annee_scolaire_active || '';
      setAnnee(anneeActive);

      const { data: toutes } = await supabase.from('classes').select('id, nom, niveau, cycle, annee_scolaire').eq('etablissement_id', etabId);
      let cl = (toutes || []).filter((c: any) => ((c.cycle || inferCycle(c.niveau || '')) as string) === def.classeCycle);
      if (def.niveau) cl = cl.filter((c: any) => def.niveau!.test(c.niveau || '') || def.niveau!.test(c.nom || ''));
      const delAnnee = cl.filter((c: any) => !anneeActive || c.annee_scolaire === anneeActive);
      if (delAnnee.length > 0) cl = delAnnee;
      cl.sort((a: any, b: any) => cmp(String(a.nom), String(b.nom)));
      setClasses(cl.map((c: any) => ({ id: c.id, nom: c.nom, niveau: c.niveau })));
      const parClasse = new Map(cl.map((c: any) => [c.id, c]));

      const lignes = await lireTout((d, a) =>
        supabase.from('eleves').select('id, matricule, sexe, date_naissance, lieu_naissance, classe_id').eq('etablissement_id', etabId).order('id').range(d, a)
      );
      const dansCycle = lignes.filter((e: any) => parClasse.has(e.classe_id));
      const ids = dansCycle.map((e: any) => e.id);

      const noms = new Map<string, { nom: string; prenom: string }>();
      for (const lot of lots(ids, 150)) {
        const { data } = await supabase.from('profiles').select('id, nom, prenom').in('id', lot);
        (data || []).forEach((p: any) => noms.set(p.id, { nom: p.nom || '', prenom: p.prenom || '' }));
      }
      setEleves(
        dansCycle
          .map((e: any) => {
            const c: any = parClasse.get(e.classe_id);
            return {
              id: e.id, matricule: e.matricule || '', nom: noms.get(e.id)?.nom || '', prenom: noms.get(e.id)?.prenom || '',
              sexe: e.sexe || '', naissance: e.date_naissance || '', lieu: e.lieu_naissance || '',
              classeId: e.classe_id, classe: c?.nom || '', niveau: c?.niveau || '',
            } as Eleve;
          })
          .sort((a: Eleve, b: Eleve) => cmp(a.classe, b.classe) || a.nom.localeCompare(b.nom, 'fr'))
      );

      if (besoinBulletins) {
        const res: Bulletin[] = [];
        for (const lot of lots(ids, 150)) {
          let q = supabase.from('bulletins').select('eleve_id, trimestre, moyenne_generale, annee_scolaire').in('eleve_id', lot);
          if (anneeActive) q = q.eq('annee_scolaire', anneeActive);
          const { data } = await q;
          (data || []).forEach((b: any) => res.push({ eleve_id: b.eleve_id, trimestre: b.trimestre, moyenne_generale: b.moyenne_generale }));
        }
        setBulletins(res);
      }

      if (besoinTransferts) {
        const res: any[] = [];
        for (const lot of lots(ids, 150)) {
          const { data } = await supabase.from('demandes_transfert').select('*').eq('etablissement_id', etabId).in('eleve_id', lot);
          (data || []).forEach((t: any) => res.push(t));
        }
        setTransferts(res);
      }
      setChargement(false);
    })().catch((e) => { setErreur(e?.message || 'Erreur de chargement.'); setChargement(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleCle, besoinBulletins, besoinTransferts]);

  const parId = useMemo(() => new Map(eleves.map((e) => [e.id, e])), [eleves]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return eleves;
    return eleves.filter((e) => `${e.nom} ${e.prenom} ${e.matricule} ${e.classe}`.toLowerCase().includes(q));
  }, [eleves, recherche]);

  const effectifs = useMemo(() => {
    const lignes = classes.map((c) => {
      const l = eleves.filter((e) => e.classeId === c.id);
      return [c.nom, l.length, l.filter((e) => e.sexe === 'M').length, l.filter((e) => e.sexe === 'F').length] as Cell[];
    });
    const somme = (i: number) => lignes.reduce((s, l) => s + (l[i] as number), 0);
    return { lignes, total: ['Total', somme(1), somme(2), somme(3)] as Cell[] };
  }, [classes, eleves]);

  // Moyennes issues des bulletins
  const moyennes = useMemo(() => {
    const m = new Map<string, Map<number, number>>();
    bulletins.forEach((b) => {
      if (b.moyenne_generale === null || b.moyenne_generale === undefined) return;
      if (!m.has(b.eleve_id)) m.set(b.eleve_id, new Map());
      m.get(b.eleve_id)!.set(b.trimestre, Number(b.moyenne_generale));
    });
    const lignes = eleves.map((e) => {
      const t = m.get(e.id);
      const vals = [1, 2, 3].map((n) => (t?.has(n) ? (t.get(n) as number) : null));
      return { e, vals, annuelle: moy(vals.filter((v): v is number => v !== null)) };
    });
    // Rang dans la classe (à égalité, même rang)
    const rangs = new Map<string, number>();
    classes.forEach((c) => {
      const l = lignes.filter((x) => x.e.classeId === c.id && x.annuelle !== null).sort((a, b) => (b.annuelle as number) - (a.annuelle as number));
      l.forEach((x, i) => rangs.set(x.e.id, i > 0 && x.annuelle === l[i - 1].annuelle ? (rangs.get(l[i - 1].e.id) as number) : i + 1));
    });
    return { lignes, rangs };
  }, [eleves, bulletins, classes]);

  if (!def) return <p className="p-6 text-red-600">Section introuvable.</p>;
  const sectionDef = def.sections.find((s) => s.cle === section);
  if (!sectionDef) return <p className="p-6 text-red-600">Section introuvable.</p>;

  const fichier = (x: string) => `${def.label.toLowerCase()}-${x}-${annee || 'annee'}.csv`.replace(/\s+/g, '-');

  const enteteEleves = ['Matricule', 'Nom', 'Prénom', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Classe'];
  const ligneEleve = (e: Eleve): Cell[] => [e.matricule, e.nom, e.prenom, e.sexe, e.naissance, e.lieu, e.classe];

  const enteteFne = [...enteteEleves, 'Niveau', 'Matricule'];
  const ligneFne = (e: Eleve): Cell[] => [...ligneEleve(e), e.niveau, e.matricule.trim() ? 'Renseigné' : 'Manquant'];

  // Matricules : manquants et doublons
  const comptes = new Map<string, number>();
  eleves.forEach((e) => e.matricule && comptes.set(e.matricule, (comptes.get(e.matricule) || 0) + 1));
  const sansMatricule = eleves.filter((e) => !e.matricule.trim());
  const doublons = eleves.filter((e) => e.matricule && (comptes.get(e.matricule) || 0) > 1);
  const enteteAnomalies = [...enteteEleves, 'Anomalie'];
  const anomalies: Cell[][] = [...sansMatricule.map((e) => [...ligneEleve(e), 'Matricule manquant']), ...doublons.map((e) => [...ligneEleve(e), 'Matricule en double'])];

  // Moyennes
  const enteteTrim = ['Classe', 'Nom', 'Prénom', 'Matricule', 'Trimestre 1', 'Trimestre 2', 'Trimestre 3'];
  const ligneTrim = (x: (typeof moyennes.lignes)[number]): Cell[] => [x.e.classe, x.e.nom, x.e.prenom, x.e.matricule, ...x.vals.map(fmt)];
  const enteteAnn = ['Classe', 'Nom', 'Prénom', 'Matricule', 'Moyenne annuelle', 'Rang dans la classe'];
  const ligneAnn = (x: (typeof moyennes.lignes)[number]): Cell[] => [x.e.classe, x.e.nom, x.e.prenom, x.e.matricule, fmt(x.annuelle), moyennes.rangs.get(x.e.id) ?? null];

  // Transferts
  const enteteTransferts = ['Matricule', 'Nom', 'Prénom', 'Classe', 'Type', 'Établissement partenaire', 'Motif', 'Statut', 'Date'];
  const lignesTransferts: Cell[][] = transferts.map((t) => {
    const e = parId.get(t.eleve_id);
    return [e?.matricule || '', e?.nom || '', e?.prenom || '', e?.classe || '', t.type === 'sortant' ? 'Sortant' : t.type === 'entrant' ? 'Entrant' : t.type || '', t.etablissement_partenaire || '', t.motif || '', t.statut || '', String(t.cree_le || '').slice(0, 10)];
  });

  // Recherche de matricule
  const trouves = recherche.trim() ? filtres : [];

  // CEPE : vérification des dossiers des candidats
  const enteteVerif = [...enteteEleves, 'Anomalies'];
  const lignesVerif: Cell[][] = eleves.map((e) => {
    const p: string[] = [];
    if (!e.matricule.trim()) p.push('Matricule manquant');
    else if ((comptes.get(e.matricule) || 0) > 1) p.push('Matricule en double');
    if (!e.naissance) p.push('Date de naissance manquante');
    if (!e.lieu.trim()) p.push('Lieu de naissance manquant');
    if (!e.sexe) p.push('Sexe manquant');
    return [...ligneEleve(e), p.join(' ; ')];
  });
  const avecAnomalie = lignesVerif.filter((l) => l[l.length - 1]);

  const Entete = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const Liste = ({ entetes, lignes, nom, note }: { entetes: string[]; lignes: Cell[][]; nom: string; note?: string }) => (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <BoutonCsv fichier={fichier(nom)} entetes={entetes} lignes={lignes} />
        <span className="text-xs text-neutral-500">{lignes.length} ligne(s)</span>
      </div>
      <Tableau entetes={entetes} lignes={lignes} />
      {note && <p className="text-xs text-neutral-500">{note}</p>}
    </>
  );
  void Entete;

  const exports: { t: string; e: string[]; l: Cell[][]; f: string }[] =
    cycleCle === 'primaire'
      ? [
          { t: 'Fichier national des élèves', e: enteteFne, l: eleves.map(ligneFne), f: 'fichier-national' },
          { t: 'Anomalies de matricules', e: enteteAnomalies, l: anomalies, f: 'anomalies-matricules' },
          { t: 'Moyennes trimestrielles', e: enteteTrim, l: moyennes.lignes.map(ligneTrim), f: 'moyennes-trimestrielles' },
          { t: 'Moyennes annuelles', e: enteteAnn, l: moyennes.lignes.map(ligneAnn), f: 'moyennes-annuelles' },
        ]
      : cycleCle === 'cepe'
      ? [{ t: 'Candidats au CEPE', e: enteteVerif, l: lignesVerif, f: 'candidats' }]
      : [
          { t: 'Données des élèves', e: enteteEleves, l: eleves.map(ligneEleve), f: 'eleves' },
          { t: 'Effectifs', e: ['Classe', 'Effectif', 'Garçons', 'Filles'], l: [...effectifs.lignes, effectifs.total], f: 'effectifs' },
        ];

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <p className="text-xs text-neutral-500">Remontée officielle · {def.label}</p>
        <h1 className="text-2xl font-bold">{sectionDef.label}</h1>
        <p className="text-sm text-neutral-500">{ecole}{annee ? ` · ${annee}` : ''}</p>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1">
        {def.sections.map((s) => (
          <Link
            key={s.cle}
            href={`/direction/remontee/${cycleCle}/${s.cle}`}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs border ${s.cle === section ? 'bg-black text-white border-black' : 'bg-white text-neutral-700'}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {erreur && <p className="text-red-600 text-sm">{erreur}</p>}
      {chargement ? (
        <p className="text-neutral-500">Chargement...</p>
      ) : classes.length === 0 ? (
        <p className="text-neutral-500">{cycleCle === 'cepe' ? 'Aucune classe de CM2 trouvée pour cette école.' : `Aucune classe de ${def.label.toLowerCase()} trouvée pour cette école.`}</p>
      ) : (
        <>
          {(section === 'eleves' || section === 'candidats' || section === 'donnees') && (
            <>
              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (nom, matricule, classe)" className="border rounded-lg px-3 py-2 text-sm w-full" />
              <Liste nom={section} entetes={enteteEleves} lignes={filtres.map(ligneEleve)} />
            </>
          )}

          {section === 'fichier-national' && (
            <>
              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (nom, matricule, classe)" className="border rounded-lg px-3 py-2 text-sm w-full" />
              <Liste nom="fichier-national" entetes={enteteFne} lignes={filtres.map(ligneFne)} note="Colonnes standard. Le format officiel du fichier national reste à confirmer avant toute transmission." />
            </>
          )}

          {section === 'matricules' && (
            <>
              <Cartes items={[['Élèves', eleves.length], ['Sans matricule', sansMatricule.length], ['En double', doublons.length]]} />
              <Liste nom="anomalies-matricules" entetes={enteteAnomalies} lignes={anomalies} />
            </>
          )}

          {section === 'effectifs' && (
            <Liste nom="effectifs" entetes={['Classe', 'Effectif', 'Garçons', 'Filles']} lignes={[...effectifs.lignes, effectifs.total]} note="Le sexe (M ou F) doit être renseigné sur la fiche de chaque élève pour que la répartition soit complète." />
          )}

          {section === 'moyennes-trimestrielles' && (
            <Liste nom="moyennes-trimestrielles" entetes={enteteTrim} lignes={moyennes.lignes.map(ligneTrim)} note="Moyennes issues des bulletins de l'année scolaire active." />
          )}

          {section === 'moyennes-annuelles' && (
            <Liste nom="moyennes-annuelles" entetes={enteteAnn} lignes={moyennes.lignes.map(ligneAnn)} note="La moyenne annuelle est la moyenne des trimestres disponibles. Aucune décision (admis, redoublant) n'est déduite ici." />
          )}

          {section === 'transferts' && (
            <Liste nom="transferts" entetes={enteteTransferts} lignes={lignesTransferts} />
          )}

          {section === 'recherche' && (
            <>
              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Saisir un matricule, un nom ou un prénom" className="border rounded-lg px-3 py-2 text-sm w-full" autoFocus />
              {recherche.trim() ? <Tableau entetes={enteteFne} lignes={trouves.slice(0, 50).map(ligneFne)} /> : <p className="text-sm text-neutral-500">Recherche dans les élèves de cette école ({eleves.length}).</p>}
              {trouves.length > 50 && <p className="text-xs text-neutral-500">50 premiers résultats sur {trouves.length}. Précisez votre recherche.</p>}
            </>
          )}

          {section === 'verification' && (
            <>
              <Cartes items={[['Candidats', eleves.length], ['À corriger', avecAnomalie.length], ['Conformes', eleves.length - avecAnomalie.length]]} />
              <Liste nom="verification" entetes={enteteVerif} lignes={lignesVerif.sort((a, b) => Number(!!b[b.length - 1]) - Number(!!a[a.length - 1]))} note="Contrôle : matricule manquant ou en double, date et lieu de naissance, sexe." />
            </>
          )}

          {section === 'export' && (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600">
                Téléchargez les fichiers pour les transmettre. {cycleCle === 'cepe' && avecAnomalie.length > 0 ? `Attention : ${avecAnomalie.length} candidat(s) ont des anomalies à corriger avant l'envoi. ` : ''}
                Colonnes standard : le format officiel exigé par la structure destinataire reste à confirmer.
              </p>
              {exports.map((x) => (
                <div key={x.f} className="flex items-center justify-between gap-3 border rounded-xl bg-white p-4">
                  <div><div className="font-medium">{x.t}</div><div className="text-xs text-neutral-500">{x.l.length} ligne(s)</div></div>
                  <BoutonCsv fichier={fichier(x.f)} entetes={x.e} lignes={x.l} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
