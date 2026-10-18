'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type EleveCloture = {
  id: string; matricule: string; nom: string; prenom: string;
  appreciation: string; mention: string; nonClasse: boolean; motif: string;
};
type Ligne = { id: string; matricule: string; nom: string; prenom: string; moyenne: number | null; rang: number | null };
type Matrice = {
  classe: string; ecole: string; annee: string; trimestre: number;
  general: { moyenne: number | null; mini: number | null; maxi: number | null; nb: number };
  lignes: Ligne[];
};
type Entete = {
  etablissement: {
    nom: string; adresse: string | null; telephone: string | null; code_etablissement: string | null;
    dren: string | null; statut_juridique: string | null;
  } | null;
  classe: { nom: string; niveau: string; annee_scolaire: string };
  professeurPrincipal: string;
  sexes: Record<string, string>;
};

const MENTIONS: Record<string, string> = {
  tableau_honneur_felicitations: 'Tableau d\'Honneur + Félicitations',
  tableau_honneur_encouragements: 'Tableau d\'Honneur + Encouragements',
  tableau_honneur: 'Tableau d\'Honneur',
  avertissement_travail: 'Avertissement travail',
  avertissement_conduite: 'Avertissement conduite',
  blame_travail: 'Blâme travail',
  blame_conduite: 'Blâme conduite',
};
const ORDRE_MENTIONS = Object.keys(MENTIONS);

const fmt = (v: number | null | undefined) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '—');
const estGarcon = (s?: string) => !!s && /^(m|g|masc)/i.test(s.trim());
const estFille = (s?: string) => !!s && /^(f)/i.test(s.trim());
const dateFr = (iso: string) => {
  if (!iso) return '……………';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default function ConseilDocumentsPage() {
  const classeId = useParams()?.classeId as string;
  const [trimestre, setTrimestre] = useState(1);
  const [doc, setDoc] = useState<'fiche' | 'pv'>('fiche');
  const [eleves, setEleves] = useState<EleveCloture[]>([]);
  const [matrice, setMatrice] = useState<Matrice | null>(null);
  const [entete, setEntete] = useState<Entete | null>(null);
  const [cloture, setCloture] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Champs du PV, remplis à la main avant l'impression (non enregistrés)
  const [dateConseil, setDateConseil] = useState(aujourdhui());
  const [heureDebut, setHeureDebut] = useState('');
  const [heureFin, setHeureFin] = useState('');
  const [lieu, setLieu] = useState('');
  const [president, setPresident] = useState('');
  const [secretaire, setSecretaire] = useState('');
  const [presents, setPresents] = useState('');
  const [observations, setObservations] = useState('');

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [rc, rm, re] = await Promise.all([
        fetch(`/api/cloture?classeId=${classeId}&trimestre=${trimestre}`, { cache: 'no-store' }),
        fetch(`/api/bulletins/matrice?classeId=${classeId}&trimestre=${trimestre}`, { cache: 'no-store' }),
        fetch(`/api/cloture/entete?classeId=${classeId}`, { cache: 'no-store' }),
      ]);
      const [jc, jm, je] = await Promise.all([rc.json(), rm.json(), re.json()]);
      if (!rc.ok) throw new Error(jc.error || 'Chargement impossible.');
      if (!rm.ok) throw new Error(jm.error || 'Calcul des moyennes impossible.');
      if (!re.ok) throw new Error(je.error || 'En-tête introuvable.');
      setEleves(jc.eleves as EleveCloture[]);
      setCloture(!!jc.cloture);
      setMatrice(jm as Matrice);
      setEntete(je as Entete);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setChargement(false);
    }
  }, [classeId, trimestre]);

  useEffect(() => { charger(); }, [charger]);

  // Élèves triés par rang (non classés à la fin, puis ordre alphabétique)
  const lignes = useMemo(() => {
    const parId = new Map((matrice?.lignes ?? []).map((l) => [l.id, l]));
    return eleves
      .map((e) => {
        const l = parId.get(e.id);
        return { ...e, moyenne: e.nonClasse ? null : (l?.moyenne ?? null), rang: e.nonClasse ? null : (l?.rang ?? null) };
      })
      .sort((a, b) =>
        (a.rang ?? 9999) - (b.rang ?? 9999) || `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
  }, [eleves, matrice]);

  const stats = useMemo(() => {
    const classes = lignes.filter((l) => typeof l.moyenne === 'number');
    const sup10 = classes.filter((l) => (l.moyenne as number) >= 10).length;
    const sexes = entete?.sexes ?? {};
    const garcons = eleves.filter((e) => estGarcon(sexes[e.id])).length;
    const filles = eleves.filter((e) => estFille(sexes[e.id])).length;
    const mentions = ORDRE_MENTIONS
      .map((k) => ({ cle: k, libelle: MENTIONS[k], nb: lignes.filter((l) => l.mention === k).length }))
      .filter((m) => m.nb > 0);
    return {
      effectif: eleves.length, garcons, filles, sexeConnu: garcons + filles > 0,
      classes: classes.length, nonClasses: eleves.filter((e) => e.nonClasse).length,
      sup10, inf10: classes.length - sup10,
      taux: classes.length ? (sup10 / classes.length) * 100 : null,
      mentions,
    };
  }, [lignes, eleves, entete]);

  const etab = entete?.etablissement;
  const nomClasse = entete?.classe.nom ?? matrice?.classe ?? '';
  const annee = entete?.classe.annee_scolaire ?? matrice?.annee ?? '';
  const sexes = entete?.sexes ?? {};
  const sansAppreciation = lignes.filter((l) => !l.nonClasse && !l.appreciation && !l.mention).length;

  const entetePage = (
    <div className="text-xs mb-3">
      <div className="flex justify-between gap-4">
        <div>
          <p className="font-semibold">MINISTÈRE DE L'ÉDUCATION NATIONALE,</p>
          <p className="font-semibold">DE L'ALPHABÉTISATION ET DE</p>
          <p className="font-semibold">L'ENSEIGNEMENT TECHNIQUE</p>
          <p className="mt-1">{etab?.dren ?? ''}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold">RÉPUBLIQUE DE CÔTE D'IVOIRE</p>
          <p className="italic">Union - Discipline - Travail</p>
          <p className="mt-1">Année scolaire : {annee}</p>
          <p>Code : {etab?.code_etablissement ?? '—'} · {etab?.statut_juridique ?? ''}</p>
        </div>
      </div>
      <div className="text-center my-2">
        <p className="font-bold text-sm">{etab?.nom ?? matrice?.ecole ?? ''}</p>
        {etab?.adresse && <p>{etab.adresse}</p>}
        {etab?.telephone && <p>Tél : {etab.telephone}</p>}
      </div>
      <div className="flex justify-center">
        <div className="border-2 border-black text-center py-1.5 px-6 font-bold" style={{ color: '#0B3D2E' }}>
          {doc === 'fiche'
            ? `FICHE DE CONSEIL DE CLASSE — ${nomClasse} — TRIMESTRE ${trimestre}`
            : `PROCÈS-VERBAL DU CONSEIL DE CLASSE — ${nomClasse} — TRIMESTRE ${trimestre}`}
        </div>
      </div>
    </div>
  );

  const champ = 'w-full border rounded-md px-2 py-1.5 text-sm';

  return (
    <main className="p-4 max-w-4xl mx-auto pb-16">
      <style>{`@media print {
        @page { size: ${doc === 'fiche' ? 'A4 landscape' : 'A4 portrait'}; margin: 10mm; }
        body { background: #fff; }
        .zone-impression { font-size: ${doc === 'fiche' ? '10px' : '12px'}; }
        .zone-impression td, .zone-impression th { padding: 2px 4px; }
      }`}</style>

      <div className="print:hidden space-y-3 mb-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Fiche et PV du conseil</h1>
          <Link href={`/direction/cloture/${classeId}`} className="text-xs text-blue-600 underline whitespace-nowrap">← Clôture</Link>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <select value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))} className="border rounded-md px-3 py-2 text-sm">
            <option value={1}>Trimestre 1</option>
            <option value={2}>Trimestre 2</option>
            <option value={3}>Trimestre 3</option>
          </select>
          <button onClick={() => window.print()} disabled={chargement || !!erreur}
            className="border rounded-md px-3 py-2 text-sm bg-blue-600 text-white disabled:opacity-50">Imprimer</button>
        </div>

        <div className="flex gap-1 text-sm">
          {([['fiche', 'Fiche de conseil'], ['pv', 'Procès-verbal']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setDoc(k)}
              className={`flex-1 border rounded-md py-2 ${doc === k ? 'bg-blue-600 text-white' : 'bg-white'}`}>{l}</button>
          ))}
        </div>

        {erreur && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3">{erreur}</div>}
        {chargement && <p className="text-sm text-gray-500">Calcul des moyennes de la classe…</p>}
        {!chargement && !erreur && !cloture && (
          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md p-2">
            Ce trimestre n'est pas encore clôturé : les moyennes peuvent encore changer.
          </p>
        )}
        {!chargement && !erreur && sansAppreciation > 0 && (
          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md p-2">
            {sansAppreciation} élève(s) n'ont ni mention ni appréciation. Saisissez-les d'abord dans l'onglet « Conseil de classe » de la clôture.
          </p>
        )}

        {doc === 'pv' && !chargement && !erreur && (
          <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
            <p className="text-xs text-gray-600">Ces champs servent seulement à l'impression, ils ne sont pas enregistrés.</p>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="block text-xs text-gray-600 mb-1">Date</label>
                <input type="date" value={dateConseil} onChange={(e) => setDateConseil(e.target.value)} className={champ} /></div>
              <div><label className="block text-xs text-gray-600 mb-1">Début</label>
                <input type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} className={champ} /></div>
              <div><label className="block text-xs text-gray-600 mb-1">Fin</label>
                <input type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} className={champ} /></div>
            </div>
            <input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Lieu (ex. salle des professeurs)" className={champ} />
            <input value={president} onChange={(e) => setPresident(e.target.value)} placeholder="Président du conseil (chef d'établissement)" className={champ} />
            <input value={secretaire} onChange={(e) => setSecretaire(e.target.value)} placeholder="Secrétaire de séance" className={champ} />
            <textarea value={presents} onChange={(e) => setPresents(e.target.value)} rows={3}
              placeholder="Membres présents (un par ligne : nom, qualité)" className={champ} />
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3}
              placeholder="Observations générales du conseil" className={champ} />
          </div>
        )}
      </div>

      {!chargement && !erreur && matrice && entete && (
        <div className="zone-impression">
          {entetePage}

          {doc === 'fiche' && (
            <>
              <p className="text-xs mb-2">
                Professeur principal : <strong>{entete.professeurPrincipal || '………………………………'}</strong>
                {' · '}Effectif : <strong>{stats.effectif}</strong>
                {stats.sexeConnu && <> ({stats.garcons} G / {stats.filles} F)</>}
                {' · '}Moyenne de la classe : <strong>{fmt(matrice.general.moyenne)}</strong>
                {' · '}Plus faible : {fmt(matrice.general.mini)} · Plus forte : {fmt(matrice.general.maxi)}
              </p>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border text-center w-8">N°</th>
                      <th className="border text-center w-8">Rang</th>
                      <th className="border text-left">Matricule</th>
                      <th className="border text-left">Nom et prénoms</th>
                      <th className="border text-center w-6">S</th>
                      <th className="border text-center">Moy.</th>
                      <th className="border text-left">Mention proposée</th>
                      <th className="border text-left">Appréciation</th>
                      <th className="border text-left w-28">Décision du conseil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l, i) => (
                      <tr key={l.id} className="align-top">
                        <td className="border text-center">{i + 1}</td>
                        <td className="border text-center">{l.nonClasse ? 'NC' : (l.rang ?? '—')}</td>
                        <td className="border">{l.matricule}</td>
                        <td className="border">{l.nom} {l.prenom}</td>
                        <td className="border text-center">{sexes[l.id] ? String(sexes[l.id]).charAt(0).toUpperCase() : ''}</td>
                        <td className="border text-center">{l.nonClasse ? '—' : fmt(l.moyenne)}</td>
                        <td className="border">{MENTIONS[l.mention] ?? ''}</td>
                        <td className="border">{l.nonClasse ? (l.motif ? `Non classé : ${l.motif}` : 'Non classé') : l.appreciation}</td>
                        <td className="border" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between mt-6 text-xs">
                <div className="text-center">
                  <p>Le professeur principal</p>
                  <p className="mt-10">{entete.professeurPrincipal}</p>
                </div>
                <div className="text-center">
                  <p>Le chef d'établissement</p>
                  <p className="mt-10">{president}</p>
                </div>
              </div>
            </>
          )}

          {doc === 'pv' && (
            <div className="space-y-3 text-sm leading-relaxed">
              <p>
                Le <strong>{dateFr(dateConseil)}</strong>
                {heureDebut ? <> à <strong>{heureDebut}</strong></> : ' à ………'}, s'est tenu
                {lieu ? <> en <strong>{lieu}</strong></> : ' en …………………'}, le conseil de classe du
                <strong> trimestre {trimestre}</strong> de la classe de <strong>{nomClasse}</strong>
                {entete.classe.niveau ? ` (${entete.classe.niveau})` : ''}, année scolaire <strong>{annee}</strong>,
                sous la présidence de <strong>{president || '………………………………'}</strong>
                {secretaire ? <>, secrétaire de séance : <strong>{secretaire}</strong></> : ''}.
              </p>

              <div>
                <p className="font-semibold">1. Membres présents</p>
                {presents.trim()
                  ? <ul className="list-disc ml-5">{presents.split('\n').filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}</ul>
                  : <p className="text-gray-400">…………………………………………………………</p>}
                <p className="mt-1">Professeur principal : <strong>{entete.professeurPrincipal || '………………………'}</strong></p>
              </div>

              <div>
                <p className="font-semibold">2. Ordre du jour</p>
                <ul className="list-disc ml-5">
                  <li>Examen des résultats de la classe</li>
                  <li>Mentions, distinctions et sanctions</li>
                  <li>Appréciations du conseil</li>
                  <li>Questions diverses</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold">3. Résultats de la classe</p>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    <tr><td className="border">Effectif</td><td className="border text-center">
                      {stats.effectif}{stats.sexeConnu ? ` (${stats.garcons} garçons, ${stats.filles} filles)` : ''}</td></tr>
                    <tr><td className="border">Élèves classés</td><td className="border text-center">{stats.classes}</td></tr>
                    <tr><td className="border">Élèves non classés</td><td className="border text-center">{stats.nonClasses}</td></tr>
                    <tr><td className="border">Moyenne de la classe</td><td className="border text-center">{fmt(matrice.general.moyenne)} / 20</td></tr>
                    <tr><td className="border">Moyenne la plus forte</td><td className="border text-center">{fmt(matrice.general.maxi)} / 20</td></tr>
                    <tr><td className="border">Moyenne la plus faible</td><td className="border text-center">{fmt(matrice.general.mini)} / 20</td></tr>
                    <tr><td className="border">Élèves ayant 10/20 et plus</td><td className="border text-center">
                      {stats.sup10}{stats.taux !== null ? ` (${stats.taux.toFixed(1).replace('.', ',')} %)` : ''}</td></tr>
                    <tr><td className="border">Élèves en dessous de 10/20</td><td className="border text-center">{stats.inf10}</td></tr>
                  </tbody>
                </table>
              </div>

              <div>
                <p className="font-semibold">4. Mentions, distinctions et sanctions</p>
                {stats.mentions.length === 0
                  ? <p className="text-gray-400">Aucune mention accordée.</p>
                  : stats.mentions.map((m) => (
                    <p key={m.cle} className="mt-1">
                      <strong>{m.libelle}</strong> ({m.nb}) :{' '}
                      {lignes.filter((l) => l.mention === m.cle).map((l) => `${l.nom} ${l.prenom}`).join(' ; ')}
                    </p>
                  ))}
                {stats.nonClasses > 0 && (
                  <p className="mt-1"><strong>Non classés ({stats.nonClasses}) :</strong>{' '}
                    {lignes.filter((l) => l.nonClasse).map((l) => `${l.nom} ${l.prenom}${l.motif ? ` (${l.motif})` : ''}`).join(' ; ')}</p>
                )}
              </div>

              <div>
                <p className="font-semibold">5. Observations générales</p>
                {observations.trim()
                  ? <p className="whitespace-pre-line">{observations}</p>
                  : <p className="text-gray-400">…………………………………………………………………………………………………</p>}
              </div>

              <p>
                L'ordre du jour étant épuisé, la séance est levée{heureFin ? <> à <strong>{heureFin}</strong></> : ' à ………'}.
                De tout ce qui précède, le présent procès-verbal a été dressé pour servir et valoir ce que de droit.
              </p>

              <div className="flex justify-between pt-4">
                <div className="text-center"><p>Le secrétaire de séance</p><p className="mt-12">{secretaire}</p></div>
                <div className="text-center"><p>Le professeur principal</p><p className="mt-12">{entete.professeurPrincipal}</p></div>
                <div className="text-center"><p>Le président du conseil</p><p className="mt-12">{president}</p></div>
              </div>
            </div>
  )}
        </div>
      )}
    </main>
  );
}
