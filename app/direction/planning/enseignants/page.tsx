'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { formaterHeures } from '@/lib/planning';

type Periode = { ordre: number; debut: string; fin: string; pause: boolean; libelle: string | null };
type Creneau = { jour: string; debut: string; fin: string; salle: string | null; classeId: string; classeNom: string; matiere: string; cycle: string };
type Enseignant = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  matricule: string | null;
  sexe: string | null;
  statut: string | null;
  specialite: string | null;
  heures: number;
  creneaux: Creneau[];
  recap: { classeNom: string; effectif: number; matiere: string; heures: number }[];
  complements: { type: string; heures: number; classeNom: string }[];
};
type Etablissement = {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  code_etablissement: string | null;
  dren: string | null;
  type_etablissement: string | null;
};

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_MAJ: Record<string, string> = {
  lundi: 'LUNDI', mardi: 'MARDI', mercredi: 'MERCREDI', jeudi: 'JEUDI', vendredi: 'VENDREDI', samedi: 'SAMEDI',
};
const CYCLE_LABEL: Record<string, string> = { college: 'Collège', lycee: 'Lycée' };
const heuresTexte = (h: number) => String(h).replace('.', ',') + 'H';

function Feuille({
  ens,
  etab,
  annee,
  periodes,
}: {
  ens: Enseignant;
  etab: Etablissement;
  annee: string;
  periodes: Record<string, Periode[]>;
}) {
  const cycles = Array.from(new Set(ens.creneaux.map((c) => c.cycle))).filter((c) => (periodes[c] ?? []).length > 0);
  const jours = JOURS.slice(0, 5).concat(ens.creneaux.some((c) => c.jour === 'samedi') ? ['samedi'] : []);
  const pp = ens.complements.filter((c) => c.type === 'PP');
  const autres = ens.complements.filter((c) => c.type !== 'PP');
  const totalRecap = ens.recap.reduce((s, r) => s + r.heures, 0);

  return (
    <div className="feuille space-y-3 bg-white">
      <div className="text-center text-xs font-bold leading-tight">
        <div>MINISTÈRE DE L'ÉDUCATION NATIONALE ET DE L'ALPHABÉTISATION</div>
        {etab.dren && <div>DRENA {etab.dren.toUpperCase()}</div>}
      </div>

      <div className="flex justify-between items-start text-sm border-b pb-2">
        <div>
          <div className="font-bold">{etab.nom}</div>
          {etab.telephone && <div className="text-xs">Tél : {etab.telephone}</div>}
          {etab.adresse && <div className="text-xs">{etab.adresse}</div>}
        </div>
        <div className="text-right text-xs">
          <div>Année Scolaire : {annee}</div>
          {etab.code_etablissement && <div>Code : {etab.code_etablissement}</div>}
          {etab.type_etablissement && <div>Statut : {etab.type_etablissement}</div>}
        </div>
      </div>

      <h2 className="text-center font-bold text-lg border py-1">EMPLOI DU TEMPS PROFESSEUR</h2>

      <div>
        <h3 className="font-bold text-base">
          {ens.nom} {ens.prenom} {ens.specialite ? `(${ens.specialite.toUpperCase()})` : ''}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mt-1">
          <div><strong>Matricule :</strong> {ens.matricule || '—'}</div>
          <div><strong>Sexe :</strong> {ens.sexe || '—'}</div>
          <div><strong>Statut :</strong> {ens.statut || '—'}</div>
          <div><strong>Contact :</strong> {ens.telephone || '—'}</div>
        </div>
        {pp.length > 0 && (
          <div className="text-sm mt-1">
            <strong>Professeur principal :</strong> {pp.map((p) => p.classeNom).join(', ')}
          </div>
        )}
      </div>

      {cycles.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun cours enregistré pour cet enseignant.</p>
      ) : (
        cycles.map((cycle) => (
          <div key={cycle} className="overflow-x-auto">
            {cycles.length > 1 && <p className="font-semibold text-sm mb-1">{CYCLE_LABEL[cycle] ?? cycle}</p>}
            <table className="edt-table w-full border-collapse">
              <thead>
                <tr>
                  <th>HORAIRES</th>
                  {jours.map((j) => (
                    <th key={j}>{JOURS_MAJ[j]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...periodes[cycle]]
                  .sort((a, b) => a.ordre - b.ordre)
                  .map((p) =>
                    p.pause ? (
                      <tr key={p.ordre} className="pause-row">
                        <td>{p.debut} - {p.fin}</td>
                        <td colSpan={jours.length}>{p.libelle}</td>
                      </tr>
                    ) : (
                      <tr key={p.ordre}>
                        <td>{p.debut} - {p.fin}</td>
                        {jours.map((j) => {
                          const c = ens.creneaux.find((x) => x.cycle === cycle && x.jour === j && x.debut === p.debut && x.fin === p.fin);
                          return (
                            <td key={j}>
                              {c ? (
                                <>
                                  <div>{c.classeNom} {c.matiere}</div>
                                  {c.salle && <div className="salle">{c.salle}</div>}
                                </>
                              ) : (
                                ''
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )
                  )}
              </tbody>
            </table>
          </div>
        ))
      )}

      {ens.recap.length > 0 && (
        <div>
          <h3 className="font-bold mb-2">TABLEAU RÉCAPITULATIF</h3>
          <div className="overflow-x-auto">
            <table className="edt-table w-full border-collapse">
              <thead>
                <tr>
                  <th>CLASSES</th>
                  {ens.recap.map((r, i) => (
                    <th key={i}>{r.classeNom}</th>
                  ))}
                  <th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-left font-medium">EFFECTIFS</td>
                  {ens.recap.map((r, i) => (
                    <td key={i}>{r.effectif}</td>
                  ))}
                  <td>—</td>
                </tr>
                <tr>
                  <td className="text-left font-medium">DISCIPLINES</td>
                  {ens.recap.map((r, i) => (
                    <td key={i}>{r.matiere}</td>
                  ))}
                  <td>—</td>
                </tr>
                <tr>
                  <td className="text-left font-medium">HEURES D'ENSEIG.</td>
                  {ens.recap.map((r, i) => (
                    <td key={i}>{heuresTexte(r.heures)}</td>
                  ))}
                  <td className="font-bold">{heuresTexte(Math.round(totalRecap * 100) / 100)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {autres.length > 0 && (
        <div>
          <h3 className="font-bold mb-1">COMPLÉMENT DE SERVICE</h3>
          <p className="text-sm">
            {autres.map((c) => `${c.type}${c.classeNom ? ` (${c.classeNom})` : ''} — ${heuresTexte(c.heures)}`).join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}

export default function EmploisDuTempsEnseignantsPage() {
  const [etab, setEtab] = useState<Etablissement | null>(null);
  const [annee, setAnnee] = useState('');
  const [periodes, setPeriodes] = useState<Record<string, Periode[]>>({});
  const [liste, setListe] = useState<Enseignant[]>([]);
  const [erreur, setErreur] = useState('');
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [apercuId, setApercuId] = useState('');

  useEffect(() => {
    const charger = async () => {
      try {
        const r = await fetch('/api/planning/enseignants', { cache: 'no-store' });
        const d = await r.json();
        if (!r.ok) {
          setErreur(d?.error || 'Chargement impossible.');
        } else {
          setEtab(d.etablissement);
          setAnnee(d.annee ?? '');
          setPeriodes(d.periodes ?? {});
          setListe(d.enseignants ?? []);
        }
      } catch {
        setErreur('Erreur réseau. Réessayez.');
      }
      setLoading(false);
    };
    charger();
  }, []);

  const avecCours = useMemo(() => liste.filter((e) => e.creneaux.length > 0), [liste]);
  const sansCours = useMemo(() => liste.filter((e) => e.creneaux.length === 0), [liste]);
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? avecCours.filter((e) => `${e.nom} ${e.prenom}`.toLowerCase().includes(q)) : avecCours;
  }, [avecCours, recherche]);

  const apercu = liste.find((e) => e.id === apercuId) ?? null;
  const aImprimer = selection.size > 0 ? avecCours.filter((e) => selection.has(e.id)) : apercu ? [apercu] : [];

  const basculer = (id: string) => {
    const s = new Set(selection);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelection(s);
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;
  if (erreur) return <p className="p-4 text-red-600">{erreur}</p>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <style>{`
        .zone-impression { display: none; }
        @media print {
          .no-print { display: none !important; }
          .zone-impression { display: block !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          @page { size: landscape; margin: 10mm; }
          .zone-impression .feuille { page-break-after: always; break-after: page; }
          .zone-impression .feuille:last-child { page-break-after: auto; break-after: auto; }
        }
        table.edt-table th, table.edt-table td { border: 1px solid #999; padding: 4px; font-size: 10px; text-align: center; }
        table.edt-table th { background: #e5e5e5; font-weight: bold; }
        .pause-row td { background: #d5d5d5; font-weight: bold; }
        .salle { font-size: 9px; color: #555; }
      `}</style>

      <div className="no-print space-y-4">
        <div>
          <Link href="/direction/planning" className="text-sm text-blue-600 underline">
            ← Planning
          </Link>
          <h1 className="text-2xl font-bold mt-1">Emplois du temps des enseignants</h1>
          <p className="text-sm text-gray-500">
            Tirés des emplois du temps des classes. Touchez un nom pour voir sa feuille, cochez plusieurs enseignants pour les
            imprimer en une fois (une page par enseignant).
          </p>
        </div>

        {avecCours.length === 0 ? (
          <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
            Aucun enseignant n'a encore de cours. Générez d'abord l'emploi du temps des classes et affectez-y des professeurs :{' '}
            <Link href="/direction/planning/generer" className="underline font-medium">
              Générer l'emploi du temps
            </Link>
            .
          </div>
        ) : (
          <>
            <div className="border rounded-xl bg-white p-3 space-y-2">
              <div className="flex justify-between items-center gap-2">
                <p className="text-sm font-semibold">{avecCours.length} enseignant(s) avec des cours</p>
                <button
                  className="text-xs text-blue-600 underline"
                  onClick={() => setSelection(selection.size === avecCours.length ? new Set() : new Set(avecCours.map((e) => e.id)))}
                >
                  Tout cocher / décocher
                </button>
              </div>
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher un enseignant"
                className="w-full border rounded-lg p-2 text-sm"
              />
              <div className="divide-y max-h-96 overflow-y-auto">
                {visibles.map((e) => (
                  <div key={e.id} className={`flex items-center gap-3 py-2 ${apercuId === e.id ? 'bg-gray-50' : ''}`}>
                    <input type="checkbox" checked={selection.has(e.id)} onChange={() => basculer(e.id)} />
                    <button onClick={() => setApercuId(e.id)} className="flex-1 text-left text-sm">
                      <span className="font-medium">
                        {e.nom} {e.prenom}
                      </span>
                      <span className="block text-[11px] text-gray-500">
                        {e.specialite ? `${e.specialite} · ` : ''}
                        {formaterHeures(e.heures)} par semaine
                      </span>
                    </button>
                  </div>
                ))}
                {visibles.length === 0 && <p className="text-sm text-gray-500 py-2">Aucun résultat.</p>}
              </div>
            </div>

            <button
              onClick={() => window.print()}
              disabled={aImprimer.length === 0}
              className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
            >
              🖨️ Imprimer / Exporter en PDF
              {aImprimer.length > 1 ? ` (${aImprimer.length} enseignants)` : aImprimer.length === 1 ? ' (1 enseignant)' : ''}
            </button>
            <p className="text-[11px] text-gray-400">
              Si aucune case n'est cochée, c'est l'enseignant affiché ci-dessous qui est imprimé.
              {' '}Pour ajouter un professeur principal ou un complément de service :{' '}
              <Link href="/direction/emploi-du-temps/professeur" className="underline">
                page « Emploi du temps professeur »
              </Link>
              .
            </p>

            {sansCours.length > 0 && (
              <p className="text-xs text-gray-500">
                Sans cours pour le moment : {sansCours.map((e) => `${e.nom} ${e.prenom}`.trim()).join(', ')}.
              </p>
            )}
          </>
        )}

        {apercu && etab && (
          <div className="border rounded-xl p-3 bg-white">
            <Feuille ens={apercu} etab={etab} annee={annee} periodes={periodes} />
          </div>
        )}
      </div>

      {/* Zone imprimée : une feuille par enseignant, une page chacune */}
      <div className="zone-impression">
        {etab && aImprimer.map((e) => <Feuille key={e.id} ens={e} etab={etab} annee={annee} periodes={periodes} />)}
      </div>
    </div>
  );
}
