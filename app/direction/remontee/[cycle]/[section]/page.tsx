'use client';

// Remontée officielle : Maternelle, Primaire, CEPE.
// Une seule page sert toutes les sections : /direction/remontee/[cycle]/[section]
// Cette page ne transmet rien aux plateformes officielles (AGCP, DECO) : elle prépare,
// contrôle et exporte les données pour une transmission manuelle.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ───────────────────────── Sections ─────────────────────────

const SECTIONS: Record<string, Record<string, { titre: string; aide: string }>> = {
  maternelle: {
    eleves: { titre: 'Données des élèves', aide: "Identité des élèves de la maternelle pour l'année active." },
    effectifs: { titre: 'Effectifs', aide: 'Nombre de garçons et de filles par classe.' },
    export: { titre: 'Export des données', aide: 'Fichier CSV des élèves de la maternelle.' },
  },
  primaire: {
    'fichier-national': { titre: 'Fichier National des Élèves', aide: "Contrôle de l'état du matricule de chaque élève du primaire." },
    matricules: { titre: 'Matricules AGCP', aide: 'Élèves dont le matricule est manquant, en double ou de format inhabituel.' },
    eleves: { titre: 'Données élèves', aide: 'Identité des élèves du primaire pour l’année active.' },
    'moyennes-trimestrielles': { titre: 'Moyennes trimestrielles', aide: 'Moyenne générale de chaque élève pour le trimestre choisi, tirée des bulletins.' },
    'moyennes-annuelles': { titre: 'Moyennes annuelles', aide: 'Moyenne des trois trimestres.' },
    transferts: { titre: 'Transferts', aide: 'Demandes de transfert enregistrées pour les élèves du primaire.' },
    recherche: { titre: 'Recherche matricule', aide: 'Retrouver un élève par matricule ou par nom.' },
    export: { titre: 'Export AGCP', aide: 'Fichier CSV des élèves du primaire pour une transmission manuelle.' },
  },
  cepe: {
    candidats: { titre: 'Liste des candidats', aide: 'Élèves de CM2 de l’année active.' },
    verification: { titre: 'Vérification des matricules', aide: 'Contrôle des informations nécessaires avant la transmission.' },
    donnees: { titre: 'Données candidats', aide: 'Informations complètes des candidats.' },
    export: { titre: 'Export DECO', aide: 'Fichier CSV des candidats au CEPE pour une transmission manuelle.' },
  },
};

const NOMS_CYCLES: Record<string, string> = { maternelle: 'Maternelle', primaire: 'Primaire', cepe: 'CEPE' };

// ───────────────────────── Types ─────────────────────────

type EtatMatricule = 'ok' | 'manquant' | 'format' | 'doublon';

type Eleve = {
  id: string;
  matricule: string | null;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F' | null;
  naissance: string | null;
  lieu: string | null;
  nationalite: string | null;
  statut: string;
  classeId: string;
  classe: string;
  annee: string;
  etat: EtatMatricule;
};

type ClasseLite = { id: string; nom: string; niveau: string | null; annee_scolaire: string; cycle: string | null };

type Cellule = string | number;

// ───────────────────────── Utilitaires ─────────────────────────

const sansAccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function normaliserSexe(v: string | null | undefined): 'M' | 'F' | null {
  if (!v) return null;
  const c = sansAccent(v.trim()).charAt(0);
  if (c === 'm' || c === 'h' || c === 'g') return 'M';
  if (c === 'f') return 'F';
  return null;
}

function dateFr(d: string | null): string {
  if (!d) return '';
  const [y, m, j] = d.slice(0, 10).split('-');
  return j && m && y ? `${j}/${m}/${y}` : d;
}

function morceaux<T>(a: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
}

function nombre(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toFixed(2).replace('.', ',');
}

// Matricule ivoirien : 8 chiffres + 1 lettre (ex. 21710080G), ou 1 lettre + 8 chiffres (ex. J25072407).
const FORMAT_MATRICULE = /^(\d{8}[A-Z]|[A-Z]\d{8}[A-Z]?)$/;

function cycleDeClasse(c: { cycle: string | null; niveau: string | null; nom: string | null }): string {
  const cy = (c.cycle || '').toLowerCase();
  if (cy) return cy;
  const n = sansAccent(c.niveau || c.nom || '');
  if (/section/.test(n)) return 'maternelle';
  if (/^(cp|ce|cm)[12]?\b/.test(n)) return 'primaire';
  return '';
}

function telechargerCsv(nom: string, entetes: string[], lignes: Cellule[][]) {
  const esc = (v: Cellule) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const contenu = '\uFEFF' + [entetes, ...lignes].map((l) => l.map(esc).join(';')).join('\r\n');
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const LIBELLE_ETAT: Record<EtatMatricule, string> = {
  ok: '✅ Valide',
  manquant: '❌ Manquant',
  format: '⚠️ Format à vérifier',
  doublon: '⚠️ En double',
};

// ───────────────────────── Petits composants ─────────────────────────

function Tableau({ entetes, lignes, vide }: { entetes: string[]; lignes: Cellule[][]; vide?: string }) {
  if (lignes.length === 0) {
    return <p className="text-sm text-neutral-500 py-6 text-center">{vide || 'Aucune donnée à afficher.'}</p>;
  }
  return (
    <div className="overflow-x-auto border rounded-lg bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-100 text-neutral-600">
          <tr>
            {entetes.map((h) => (
              <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-t">
              {l.map((c, j) => (
                <td key={j} className="px-3 py-2 whitespace-nowrap">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, valeur, alerte }: { label: string; valeur: Cellule; alerte?: boolean }) {
  return (
    <div className={`rounded-lg border bg-white p-3 ${alerte ? 'border-amber-300 bg-amber-50' : ''}`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-xl font-semibold">{valeur}</div>
    </div>
  );
}

function Bandeau({ children, ton = 'info' }: { children: React.ReactNode; ton?: 'info' | 'alerte' }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${
        ton === 'alerte' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-neutral-200 bg-neutral-100 text-neutral-700'
      }`}
    >
      {children}
    </div>
  );
}

function BoutonCsv({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium disabled:opacity-40"
    >
      📤 Télécharger en CSV
    </button>
  );
}

// ───────────────────────── Page ─────────────────────────

export default function RemonteePage() {
  const params = useParams();
  const cycle = String(params?.cycle || '');
  const section = String(params?.section || '');
  const config = SECTIONS[cycle]?.[section];

  const supabase = useMemo(() => createClient(), []);

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etab, setEtab] = useState<{ nom: string; code: string; dren: string; annee: string } | null>(null);
  const [tous, setTous] = useState<Eleve[]>([]);

  // Filtres et états propres à certaines sections
  const [seulementProblemes, setSeulementProblemes] = useState(false);
  const [filtreEtat, setFiltreEtat] = useState<'tous' | EtatMatricule>('tous');
  const [recherche, setRecherche] = useState('');
  const [trimestre, setTrimestre] = useState(1);
  const [moy, setMoy] = useState<Record<number, Record<string, number | null>>>({});
  const [calcul, setCalcul] = useState<{ fait: number; total: number } | null>(null);
  const [transferts, setTransferts] = useState<any[] | null>(null);

  const actifs = useMemo(() => tous.filter((e) => e.statut === 'actif'), [tous]);

  // ── Chargement des élèves du cycle ──
  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error('Session expirée : reconnectez-vous.');

      const { data: profil } = await supabase.from('profiles').select('etablissement_id').eq('id', u.user.id).single();
      const etabId = profil?.etablissement_id;
      if (!etabId) throw new Error('Aucun établissement rattaché à ce compte.');

      const { data: e } = await supabase
        .from('etablissements')
        .select('nom, code_etablissement, dren, annee_scolaire_active')
        .eq('id', etabId)
        .single();

      const { data: cl, error: errCl } = await supabase
        .from('classes')
        .select('id, nom, niveau, annee_scolaire, cycle')
        .eq('etablissement_id', etabId);
      if (errCl) throw errCl;

      const toutes = (cl || []) as ClasseLite[];
      const annees = Array.from(new Set(toutes.map((c) => c.annee_scolaire))).sort();
      const annee = e?.annee_scolaire_active || annees[annees.length - 1] || '';

      const cyc = cycle === 'cepe' ? 'primaire' : cycle;
      let classes = toutes.filter((c) => c.annee_scolaire === annee && cycleDeClasse(c) === cyc);
      if (cycle === 'cepe') classes = classes.filter((c) => /^cm\s?2/i.test((c.niveau || c.nom || '').trim()));

      setEtab({ nom: e?.nom || '', code: e?.code_etablissement || '', dren: e?.dren || '', annee });

      const nomClasse = new Map(classes.map((c) => [c.id, c.nom]));
      const anneeClasse = new Map(classes.map((c) => [c.id, c.annee_scolaire]));
      const ids = classes.map((c) => c.id);

      // Élèves (par lots de classes, avec pagination)
      const lignes: any[] = [];
      for (const lot of morceaux(ids, 40)) {
        let debut = 0;
        for (;;) {
          const { data, error } = await supabase
            .from('eleves')
            .select('id, classe_id, matricule, sexe, date_naissance, lieu_naissance, nationalite, statut, nom, prenom')
            .in('classe_id', lot)
            .order('id')
            .range(debut, debut + 999);
          if (error) throw error;
          lignes.push(...(data || []));
          if (!data || data.length < 1000) break;
          debut += 1000;
        }
      }

      // Nom, prénom et sexe : repli sur profiles quand la fiche élève est incomplète
      // (requêtes séparées : les jointures eleves/profiles échouent silencieusement)
      const profs = new Map<string, { nom: string; prenom: string; sexe: string | null }>();
      const incomplets = lignes.filter((r) => !r.nom || !r.prenom || !r.sexe).map((r) => r.id as string);
      for (const lot of morceaux(incomplets, 100)) {
        const { data } = await supabase.from('profiles').select('id, nom, prenom, sexe').in('id', lot);
        (data || []).forEach((p: any) => profs.set(p.id, { nom: p.nom, prenom: p.prenom, sexe: p.sexe }));
      }

      const brut = lignes.map((r) => {
        const p = profs.get(r.id);
        const mat = (r.matricule || '').toString().trim().toUpperCase();
        return {
          id: r.id as string,
          matricule: mat || null,
          nom: (r.nom || p?.nom || '').toString(),
          prenom: (r.prenom || p?.prenom || '').toString(),
          sexe: normaliserSexe(r.sexe || p?.sexe),
          naissance: (r.date_naissance as string | null) || null,
          lieu: (r.lieu_naissance as string | null) || null,
          nationalite: (r.nationalite as string | null) || null,
          statut: (r.statut as string) || 'actif',
          classeId: r.classe_id as string,
          classe: nomClasse.get(r.classe_id) || '',
          annee: anneeClasse.get(r.classe_id) || annee,
        };
      });

      // Doublons de matricule parmi les élèves actifs
      const compte = new Map<string, number>();
      brut
        .filter((b) => b.statut === 'actif' && b.matricule)
        .forEach((b) => compte.set(b.matricule as string, (compte.get(b.matricule as string) || 0) + 1));

      const liste: Eleve[] = brut.map((b) => {
        let etat: EtatMatricule = 'ok';
        if (!b.matricule || /^PROV/i.test(b.matricule)) etat = 'manquant';
        else if ((compte.get(b.matricule) || 0) > 1) etat = 'doublon';
        else if (!FORMAT_MATRICULE.test(b.matricule)) etat = 'format';
        return { ...b, etat };
      });

      liste.sort((a, b) => a.classe.localeCompare(b.classe, 'fr') || a.nom.localeCompare(b.nom, 'fr'));
      setTous(liste);
    } catch (err: any) {
      setErreur(err?.message || 'Impossible de charger les données.');
    } finally {
      setChargement(false);
    }
  }, [supabase, cycle]);

  useEffect(() => {
    if (config) charger();
    else setChargement(false);
  }, [config, charger]);

  // ── Transferts (chargés à la demande) ──
  useEffect(() => {
    if (cycle !== 'primaire' || section !== 'transferts' || chargement || transferts !== null) return;
    (async () => {
      const ids = new Set(tous.map((e) => e.id));
      const { data } = await supabase
        .from('demandes_transfert')
        .select('id, type, eleve_id, etablissement_partenaire, statut, numero_demande, motif, cree_le')
        .order('cree_le', { ascending: false });
      setTransferts((data || []).filter((d: any) => ids.has(d.eleve_id)));
    })();
  }, [cycle, section, tous, transferts, chargement, supabase]);

  // ── Calcul des moyennes (via generer_bulletin) ──
  const calculer = useCallback(
    async (trimestres: number[]) => {
      const aFaire: { e: Eleve; t: number }[] = [];
      for (const t of trimestres) for (const e of actifs) if (moy[t]?.[e.id] === undefined) aFaire.push({ e, t });
      if (aFaire.length === 0) return;

      const total = aFaire.length;
      const resultats: Record<number, Record<string, number | null>> = {};
      let index = 0;
      let fait = 0;
      setCalcul({ fait: 0, total });

      const ouvrier = async () => {
        while (index < aFaire.length) {
          const { e, t } = aFaire[index++];
          let valeur: number | null = null;
          try {
            const { data } = await supabase.rpc('generer_bulletin', {
              p_eleve_id: e.id,
              p_trimestre: t,
              p_annee_scolaire: e.annee,
            });
            const m = (data as any)?.totaux?.moyenne_generale;
            valeur = m === null || m === undefined ? null : Number(m);
            if (valeur !== null && Number.isNaN(valeur)) valeur = null;
          } catch {
            valeur = null;
          }
          if (!resultats[t]) resultats[t] = {};
          resultats[t][e.id] = valeur;
          fait++;
          if (fait % 10 === 0 || fait === total) setCalcul({ fait, total });
        }
      };

      await Promise.all(Array.from({ length: 6 }, () => ouvrier()));

      setMoy((prev) => {
        const suite = { ...prev };
        for (const t of Object.keys(resultats)) {
          const n = Number(t);
          suite[n] = { ...(suite[n] || {}), ...resultats[n] };
        }
        return suite;
      });
      setCalcul(null);
    },
    [actifs, moy, supabase]
  );

  // ───────────────────────── Garde-fous ─────────────────────────

  if (!config) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-neutral-600">Cette section n’existe pas.</p>
      </div>
    );
  }

  const enTete = (
    <div className="space-y-1">
      <div className="text-xs font-semibold tracking-wider text-neutral-400">
        REMONTÉE OFFICIELLE · {NOMS_CYCLES[cycle]?.toUpperCase()}
      </div>
      <h1 className="text-xl font-semibold">{config.titre}</h1>
      <p className="text-sm text-neutral-500">{config.aide}</p>
      {etab && (
        <p className="text-xs text-neutral-400">
          {etab.nom} · année {etab.annee || '—'}
          {etab.code ? ` · code ${etab.code}` : ''}
        </p>
      )}
    </div>
  );

  if (chargement) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        {enTete}
        <p className="text-sm text-neutral-500">Chargement…</p>
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        {enTete}
        <Bandeau ton="alerte">{erreur}</Bandeau>
        <button onClick={charger} className="px-4 py-2 rounded-lg border text-sm">
          Réessayer
        </button>
      </div>
    );
  }

  // ───────────────────────── Données dérivées ─────────────────────────

  const nomFichier = (suffixe: string) =>
    `${cycle}-${suffixe}-${(etab?.annee || 'annee').replace(/[^0-9a-z-]/gi, '')}.csv`;

  const nbProblemes = actifs.filter((e) => e.etat !== 'ok').length;
  const compteEtat = (x: EtatMatricule) => actifs.filter((e) => e.etat === x).length;

  const ENT_ELEVES = ['N°', 'Matricule', 'Nom', 'Prénoms', 'Sexe', 'Naissance', 'Lieu de naissance', 'Classe'];
  const ligneEleve = (e: Eleve, i: number): Cellule[] => [
    i + 1,
    e.matricule || '—',
    e.nom,
    e.prenom,
    e.sexe || '—',
    dateFr(e.naissance) || '—',
    e.lieu || '—',
    e.classe,
  ];

  const ENT_CSV = ['Matricule', 'Nom', 'Prénoms', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Classe'];
  const ligneCsv = (e: Eleve): Cellule[] => [
    e.matricule || '',
    e.nom,
    e.prenom,
    e.sexe || '',
    dateFr(e.naissance),
    e.lieu || '',
    e.classe,
  ];

  // Moyennes : statistiques de classe et rangs
  const moyenneDe = (t: number, id: string): number | null => moy[t]?.[id] ?? null;

  const resumeClasses = (valeur: (e: Eleve) => number | null) => {
    const noms = Array.from(new Set(actifs.map((e) => e.classe)));
    return noms.map((nom) => {
      const eleves = actifs.filter((e) => e.classe === nom);
      const vals = eleves.map(valeur).filter((v): v is number => v !== null);
      const moyClasse = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return [
        nom,
        eleves.length,
        vals.length,
        nombre(moyClasse),
        nombre(vals.length ? Math.min(...vals) : null),
        nombre(vals.length ? Math.max(...vals) : null),
      ] as Cellule[];
    });
  };
  const ENT_RESUME = ['Classe', 'Effectif', 'Avec moyenne', 'Moyenne de classe', 'Plus basse', 'Plus haute'];

  const rangDans = (e: Eleve, valeur: (x: Eleve) => number | null): string => {
    const v = valeur(e);
    if (v === null) return '—';
    const camarades = actifs.filter((x) => x.classe === e.classe);
    const mieux = camarades.filter((x) => {
      const w = valeur(x);
      return w !== null && w > v;
    }).length;
    return String(mieux + 1);
  };

  const trimestresCalcules = (ts: number[]) => ts.every((t) => moy[t] !== undefined);

  // ───────────────────────── Rendu des sections ─────────────────────────

  const cle = `${cycle}/${section}`;
  let contenu: React.ReactNode = null;

  const listeEleves = (liste: Eleve[], nomCsv: string, avertissement?: React.ReactNode) => (
    <>
      {avertissement}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="Élèves" valeur={liste.length} />
        <Kpi label="Garçons" valeur={liste.filter((e) => e.sexe === 'M').length} />
        <Kpi label="Filles" valeur={liste.filter((e) => e.sexe === 'F').length} />
        <Kpi label="Sexe non renseigné" valeur={liste.filter((e) => !e.sexe).length} alerte={liste.some((e) => !e.sexe)} />
      </div>
     <Tableau entetes={ENT_ELEVES} lignes={liste.map(ligneEleve)} vide="Aucun élève trouvé pour ce cycle et cette année." />
      <BoutonCsv onClick={() => telechargerCsv(nomCsv, ENT_CSV, liste.map(ligneCsv))} disabled={liste.length === 0} />
    </>
  );

  const avertFormat = (nom: string) => (
    <Bandeau ton="alerte">
      Format interne EGS : {nom} ne publie pas de modèle de fichier officiel que nous ayons pu vérifier. Ce fichier sert à
      préparer la saisie ou le dépôt manuel ; il ne se transmet pas automatiquement.
    </Bandeau>
  );

  switch (cle) {
    // ── Maternelle ──
    case 'maternelle/eleves':
    case 'primaire/eleves':
    case 'cepe/donnees': {
      if (cle === 'cepe/donnees') {
        const lignes = actifs.map((e, i) => [
          i + 1,
          e.matricule || '—',
          e.nom,
          e.prenom,
          e.sexe || '—',
          dateFr(e.naissance) || '—',
          e.lieu || '—',
          e.nationalite || '—',
          e.classe,
        ]);
        contenu = (
          <>
            <Tableau
              entetes={['N°', 'Matricule', 'Nom', 'Prénoms', 'Sexe', 'Naissance', 'Lieu de naissance', 'Nationalité', 'Classe']}
              lignes={lignes}
              vide="Aucun élève de CM2 trouvé pour l'année active."
            />
          </>
        );
      } else {
        contenu = listeEleves(actifs, nomFichier('eleves'));
      }
      break;
    }

    case 'maternelle/effectifs': {
      const noms = Array.from(new Set(actifs.map((e) => e.classe)));
      const lignes: Cellule[][] = noms.map((nom) => {
        const l = actifs.filter((e) => e.classe === nom);
        return [nom, l.filter((e) => e.sexe === 'M').length, l.filter((e) => e.sexe === 'F').length, l.filter((e) => !e.sexe).length, l.length];
      });
      const total: Cellule[] = [
        'TOTAL',
        actifs.filter((e) => e.sexe === 'M').length,
        actifs.filter((e) => e.sexe === 'F').length,
        actifs.filter((e) => !e.sexe).length,
        actifs.length,
      ];
      const ent = ['Classe', 'Garçons', 'Filles', 'Sexe non renseigné', 'Total'];
      contenu = (
        <>
          <Tableau entetes={ent} lignes={lignes.length ? [...lignes, total] : []} vide="Aucune classe de maternelle pour l'année active." />
          <BoutonCsv onClick={() => telechargerCsv(nomFichier('effectifs'), ent, [...lignes, total])} disabled={lignes.length === 0} />
        </>
      );
      break;
    }

    case 'maternelle/export': {
      contenu = listeEleves(actifs, nomFichier('export'));
      break;
    }

    // ── Primaire ──
    case 'primaire/fichier-national': {
      const filtres: { id: 'tous' | EtatMatricule; nom: string }[] = [
        { id: 'tous', nom: 'Tous' },
        { id: 'ok', nom: 'Valides' },
        { id: 'manquant', nom: 'Manquants' },
        { id: 'doublon', nom: 'En double' },
        { id: 'format', nom: 'Format à vérifier' },
      ];
      const liste = actifs.filter((e) => filtreEtat === 'tous' || e.etat === filtreEtat);
      const ent = ['N°', 'Matricule', 'Nom', 'Prénoms', 'Classe', 'État du matricule'];
      contenu = (
        <>
          <Bandeau>
            Contrôle interne : il vérifie la présence, le format et les doublons du matricule dans votre établissement. Il ne
            remplace pas la consultation du fichier national par le ministère.
          </Bandeau>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Kpi label="Élèves" valeur={actifs.length} />
            <Kpi label="Valides" valeur={compteEtat('ok')} />
            <Kpi label="Manquants" valeur={compteEtat('manquant')} alerte={compteEtat('manquant') > 0} />
            <Kpi label="En double" valeur={compteEtat('doublon')} alerte={compteEtat('doublon') > 0} />
            <Kpi label="Format à vérifier" valeur={compteEtat('format')} alerte={compteEtat('format') > 0} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {filtres.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltreEtat(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs border ${filtreEtat === f.id ? 'bg-neutral-900 text-white' : 'bg-white'}`}
              >
                {f.nom}
              </button>
            ))}
          </div>
          <Tableau
            entetes={ent}
            lignes={liste.map((e, i) => [i + 1, e.matricule || '—', e.nom, e.prenom, e.classe, LIBELLE_ETAT[e.etat]])}
          />
          <BoutonCsv
            onClick={() =>
              telechargerCsv(
                nomFichier('fichier-national'),
                ['Matricule', 'Nom', 'Prénoms', 'Classe', 'État du matricule'],
                liste.map((e) => [e.matricule || '', e.nom, e.prenom, e.classe, LIBELLE_ETAT[e.etat].replace(/^\S+\s/, '')])
              )
            }
            disabled={liste.length === 0}
          />
        </>
      );
      break;
    }

    case 'primaire/matricules': {
      const problemes = actifs.filter((e) => e.etat !== 'ok');
      contenu = (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Manquants" valeur={compteEtat('manquant')} alerte={compteEtat('manquant') > 0} />
            <Kpi label="En double" valeur={compteEtat('doublon')} alerte={compteEtat('doublon') > 0} />
            <Kpi label="Format à vérifier" valeur={compteEtat('format')} alerte={compteEtat('format') > 0} />
          </div>
          {problemes.length === 0 && actifs.length > 0 && (
            <Bandeau>Tous les matricules des élèves actifs sont présents, uniques et de format courant.</Bandeau>
          )}
          <Tableau
            entetes={['Matricule', 'Nom', 'Prénoms', 'Classe', 'Problème']}
            lignes={problemes.map((e) => [e.matricule || '—', e.nom, e.prenom, e.classe, LIBELLE_ETAT[e.etat]])}
            vide={actifs.length === 0 ? 'Aucun élève trouvé.' : 'Aucun problème de matricule détecté.'}
          />
          <BoutonCsv
            onClick={() =>
              telechargerCsv(
                nomFichier('matricules-a-corriger'),
                ['Matricule', 'Nom', 'Prénoms', 'Classe', 'Problème'],
                problemes.map((e) => [e.matricule || '', e.nom, e.prenom, e.classe, LIBELLE_ETAT[e.etat].replace(/^\S+\s/, '')])
              )
            }
            disabled={problemes.length === 0}
          />
        </>
      );
      break;
    }

    case 'primaire/moyennes-trimestrielles': {
      const val = (e: Eleve) => moyenneDe(trimestre, e.id);
      const calcule = moy[trimestre] !== undefined;
      const detail = [...actifs]
        .sort((a, b) => a.classe.localeCompare(b.classe, 'fr') || (val(b) ?? -1) - (val(a) ?? -1) || a.nom.localeCompare(b.nom, 'fr'));
      const ent = ['Rang', 'Matricule', 'Nom', 'Prénoms', 'Classe', 'Moyenne'];
      const lignes: Cellule[][] = detail.map((e) => [rangDans(e, val), e.matricule || '—', e.nom, e.prenom, e.classe, nombre(val(e))]);
      contenu = (
        <>
          <div className="flex gap-2 items-center flex-wrap">
            {[1, 2, 3].map((t) => (
              <button
                key={t}
                onClick={() => setTrimestre(t)}
                className={`px-3 py-1.5 rounded-full text-xs border ${trimestre === t ? 'bg-neutral-900 text-white' : 'bg-white'}`}
              >
                Trimestre {t}
              </button>
            ))}
            <button
              onClick={() => calculer([trimestre])}
              disabled={calcul !== null || actifs.length === 0}
              className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs disabled:opacity-40"
            >
              {calcul ? `Calcul… ${calcul.fait}/${calcul.total}` : calcule ? 'Recalculer' : 'Calculer'}
            </button>
          </div>
          {!calcule ? (
            <Bandeau>Choisissez un trimestre puis appuyez sur « Calculer » : les moyennes sont lues dans les bulletins.</Bandeau>
          ) : (
            <>
              <Tableau entetes={ENT_RESUME} lignes={resumeClasses(val)} />
              <Tableau entetes={ent} lignes={lignes} />
              <BoutonCsv onClick={() => telechargerCsv(nomFichier(`moyennes-t${trimestre}`), ent, lignes)} disabled={lignes.length === 0} />
            </>
          )}
        </>
      );
      break;
    }

    case 'primaire/moyennes-annuelles': {
      const annuelle = (e: Eleve): number | null => {
        const v = [1, 2, 3].map((t) => moyenneDe(t, e.id));
        if (v.some((x) => x === null)) return null;
        return (v as number[]).reduce((a, b) => a + b, 0) / 3;
      };
      const calcule = trimestresCalcules([1, 2, 3]);
      const detail = [...actifs].sort(
        (a, b) => a.classe.localeCompare(b.classe, 'fr') || (annuelle(b) ?? -1) - (annuelle(a) ?? -1) || a.nom.localeCompare(b.nom, 'fr')
      );
      const ent = ['Rang', 'Matricule', 'Nom', 'Prénoms', 'Classe', 'T1', 'T2', 'T3', 'Moyenne annuelle'];
      const lignes: Cellule[][] = detail.map((e) => [
        rangDans(e, annuelle),
        e.matricule || '—',
        e.nom,
        e.prenom,
        e.classe,
        nombre(moyenneDe(1, e.id)),
        nombre(moyenneDe(2, e.id)),
        nombre(moyenneDe(3, e.id)),
        nombre(annuelle(e)),
      ]);
      contenu = (
        <>
          <button
            onClick={() => calculer([1, 2, 3])}
            disabled={calcul !== null || actifs.length === 0}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs disabled:opacity-40 self-start"
          >
            {calcul ? `Calcul… ${calcul.fait}/${calcul.total}` : calcule ? 'Recalculer' : 'Calculer les 3 trimestres'}
          </button>
          <Bandeau>
            Moyenne annuelle = moyenne arithmétique des trois moyennes trimestrielles ; elle reste vide si un trimestre n’a pas
            de moyenne. Aucune décision (admis, redoublant) n’est déduite.
          </Bandeau>
          {calcule && (
            <>
              <Tableau entetes={ENT_RESUME} lignes={resumeClasses(annuelle)} />
              <Tableau entetes={ent} lignes={lignes} />
              <BoutonCsv onClick={() => telechargerCsv(nomFichier('moyennes-annuelles'), ent, lignes)} disabled={lignes.length === 0} />
            </>
          )}
        </>
      );
      break;
    }

    case 'primaire/transferts': {
      const parId = new Map(tous.map((e) => [e.id, e]));
      const lignes: Cellule[][] = (transferts || []).map((d: any) => {
        const e = parId.get(d.eleve_id);
        return [
          d.numero_demande || '—',
          d.type === 'sortant' ? 'Sortant' : d.type === 'entrant' ? 'Entrant' : d.type || '—',
          e ? `${e.nom} ${e.prenom}` : '—',
          e?.matricule || '—',
          e?.classe || '—',
          d.etablissement_partenaire || '—',
          d.statut || '—',
          d.motif || '—',
          d.cree_le ? dateFr(String(d.cree_le)) : '—',
        ];
      });
      const ent = ['N° demande', 'Type', 'Élève', 'Matricule', 'Classe', 'Établissement partenaire', 'Statut', 'Motif', 'Date'];
      contenu = (
        <>
          <Bandeau>
            Liste en lecture seule des demandes de transfert déjà enregistrées. Le transfert officiel se fait en ligne, à partir du
            matricule de l’élève, sur la plateforme du ministère.
          </Bandeau>
          {transferts === null ? (
            <p className="text-sm text-neutral-500">Chargement…</p>
          ) : (
            <>
              <Tableau entetes={ent} lignes={lignes} vide="Aucune demande de transfert enregistrée pour le primaire." />
              <BoutonCsv onClick={() => telechargerCsv(nomFichier('transferts'), ent, lignes)} disabled={lignes.length === 0} />
            </>
          )}
        </>
      );
      break;
    }

    case 'primaire/recherche': {
      const q = sansAccent(recherche.trim());
      const trouves = q.length < 2 ? [] : tous.filter((e) => sansAccent(`${e.matricule || ''} ${e.nom} ${e.prenom}`).includes(q)).slice(0, 50);
      contenu = (
        <>
          <input
            value={recherche}
            onChange={(ev) => setRecherche(ev.target.value)}
            placeholder="Matricule, nom ou prénom (2 lettres minimum)"
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
          />
          <Tableau
            entetes={['Matricule', 'Nom', 'Prénoms', 'Classe', 'Statut', 'État du matricule']}
            lignes={trouves.map((e) => [e.matricule || '—', e.nom, e.prenom, e.classe, e.statut, LIBELLE_ETAT[e.etat]])}
            vide={q.length < 2 ? 'Saisissez au moins deux caractères.' : 'Aucun élève trouvé dans votre établissement.'}
          />
          <Bandeau>
            Cette recherche porte uniquement sur les élèves de votre établissement. Pour un élève absent de votre liste, utilisez la
            consultation des matricules du site de la DESPS (mena-desps.org).
          </Bandeau>
        </>
      );
      break;
    }

    case 'primaire/export': {
      contenu = listeEleves(actifs, nomFichier('export-agcp'), avertFormat('AGCP'));
      break;
    }

    // ── CEPE ──
    case 'cepe/candidats': {
      contenu = listeEleves(actifs, nomFichier('candidats'));
      break;
    }

    case 'cepe/verification': {
      const controles = actifs.map((e) => {
        const manques: string[] = [];
        if (e.etat === 'manquant') manques.push('matricule manquant');
        if (e.etat === 'doublon') manques.push('matricule en double');
        if (e.etat === 'format') manques.push('format du matricule à vérifier');
        if (!e.sexe) manques.push('sexe');
        if (!e.naissance) manques.push('date de naissance');
        if (!e.lieu) manques.push('lieu de naissance');
        return { e, manques };
      });
      const avecProbleme = controles.filter((c) => c.manques.length > 0);
      const liste = seulementProblemes ? avecProbleme : controles;
      const ent = ['Matricule', 'Nom', 'Prénoms', 'Classe', 'Contrôle'];
      const lignes: Cellule[][] = liste.map((c) => [
        c.e.matricule || '—',
        c.e.nom,
        c.e.prenom,
        c.e.classe,
        c.manques.length ? `⚠️ ${c.manques.join(', ')}` : '✅ Complet',
      ]);
      contenu = (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Candidats" valeur={actifs.length} />
            <Kpi label="Complets" valeur={controles.length - avecProbleme.length} />
            <Kpi label="À corriger" valeur={avecProbleme.length} alerte={avecProbleme.length > 0} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={seulementProblemes} onChange={(ev) => setSeulementProblemes(ev.target.checked)} />
            Afficher seulement les candidats à corriger
          </label>
          <Tableau entetes={ent} lignes={lignes} vide={actifs.length === 0 ? 'Aucun élève de CM2 trouvé.' : 'Tous les candidats sont complets.'} />
          <BoutonCsv
            onClick={() => telechargerCsv(nomFichier('verification'), ent, lignes)}
            disabled={lignes.length === 0}
          />
        </>
      );
      break;
    }

    case 'cepe/export': {
      const ent = ['Matricule', 'Nom', 'Prénoms', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Nationalité', 'Classe', 'Établissement', 'Code établissement'];
      const lignes: Cellule[][] = actifs.map((e) => [
        e.matricule || '',
        e.nom,
        e.prenom,
        e.sexe || '',
        dateFr(e.naissance),
        e.lieu || '',
        e.nationalite || '',
        e.classe,
        etab?.nom || '',
        etab?.code || '',
      ]);
      contenu = (
        <>
          {avertFormat('la DECO')}
          {nbProblemes > 0 && (
            <Bandeau ton="alerte">
              {nbProblemes} candidat(s) ont un matricule à corriger. Passez par « Vérification des matricules » avant de transmettre.
            </Bandeau>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Kpi label="Candidats" valeur={actifs.length} />
            <Kpi label="Matricules à corriger" valeur={nbProblemes} alerte={nbProblemes > 0} />
          </div>
          <BoutonCsv onClick={() => telechargerCsv(nomFichier('export-deco'), ent, lignes)} disabled={lignes.length === 0} />
        </>
      );
      break;
    }

    default:
      contenu = null;
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      {enTete}
      {contenu}
    </div>
  );
}
