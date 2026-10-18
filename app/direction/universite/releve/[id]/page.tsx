'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ParametresUniv, Releve, StatutUe } from '@/lib/univ-calcul';

type Donnees = {
  etudiant: { nom: string; prenoms: string; matricule: string | null; date_naissance: string | null; lieu_naissance: string | null };
  etablissement: { nom: string; adresse: string | null; telephone: string | null };
  parametres: ParametresUniv;
  parcours: { id: string; nom: string }[];
  releve: Releve;
};

const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(2).replace('.', ','));
const fmtDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
const STATUT: Record<StatutUe, string> = { validee: 'Validée', compensee: 'Compensée', non_validee: 'Non validée', incomplete: 'Incomplète' };

export default function ReleveUniversitairePage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/universite/releve?etudiantId=${id}`, { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) setErreur(j.error || 'Erreur.'); else setD(j);
      } catch { setErreur('Erreur réseau.'); }
    })();
  }, [id]);

  if (erreur) return <main className="max-w-xl mx-auto p-4"><p className="text-sm text-red-700">{erreur}</p></main>;
  if (!d) return <main className="max-w-xl mx-auto p-4"><p className="text-sm text-gray-500">Chargement…</p></main>;

  const { etudiant: e, etablissement: etab, parametres: p, releve } = d;
  const nomParcours = (pid: string) => d.parcours.find((x) => x.id === pid)?.nom ?? '';
  const anneesOrdre = releve.annees.map((a) => a.annee_scolaire);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { .no-print { display: none !important; } body { background: #fff !important; } .releve { box-shadow: none !important; margin: 0 !important; max-width: none !important; } }
        .releve table { border-collapse: collapse; width: 100%; }
        .releve th, .releve td { border: 1px solid #333; padding: 2px 5px; font-size: 11px; }
        .releve th { background: #eee; }
        .releve .sem { break-inside: avoid; }
      `}</style>

      <div className="no-print max-w-3xl mx-auto p-3 flex gap-2">
        <Link href="/direction/universite/etudiants" className="border rounded-md px-3 py-2 text-sm bg-white">← Retour</Link>
        <button onClick={() => window.print()} className="flex-1 rounded-md py-2 text-sm bg-blue-600 text-white">🖨️ Imprimer / PDF</button>
      </div>

      <div className="releve max-w-3xl mx-auto bg-white p-5 text-black">
        <div className="text-center">
          <p className="font-bold text-base uppercase">{etab.nom}</p>
          {(etab.adresse || etab.telephone) && <p className="text-xs">{[etab.adresse, etab.telephone].filter(Boolean).join(' — ')}</p>}
          <p className="font-bold text-lg mt-3 tracking-wide">RELEVÉ DE NOTES</p>
        </div>

        <div className="mt-3 text-sm grid grid-cols-2 gap-x-4 gap-y-0.5">
          <p>Nom : <b>{e.nom}</b></p>
          <p>Prénoms : <b>{e.prenoms}</b></p>
          <p>Matricule : <b>{e.matricule || '—'}</b></p>
          <p>Né(e) le : <b>{fmtDate(e.date_naissance) || '—'}</b>{e.lieu_naissance ? ` à ${e.lieu_naissance}` : ''}</p>
        </div>

        {releve.semestres.length === 0 && <p className="mt-6 text-sm">Aucune note enregistrée pour cet étudiant.</p>}

        {anneesOrdre.map((annee) => {
          const a = releve.annees.find((x) => x.annee_scolaire === annee)!;
          return (
            <section key={annee} className="mt-5">
              <p className="font-bold text-sm border-b border-black pb-0.5">Année universitaire {annee}</p>
              {releve.semestres.filter((s) => s.annee_scolaire === annee).map((s) => (
                <div key={`${s.parcours_id}-${s.semestre}`} className="sem mt-3">
                  <p className="text-xs font-semibold mb-1">{nomParcours(s.parcours_id)} — Semestre {s.semestre}</p>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>UE / Matière</th>
                        <th>Coef.</th><th>Normale</th>{p.rattrapage && <th>Rattrap.</th>}
                        <th>Moy. UE</th><th>Crédits</th><th>Résultat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.ues.map((u) => (
                        <FragmentUe key={u.ue_id} u={u} rattrapage={p.rattrapage} />
                      ))}
                      <tr style={{ fontWeight: 700 }}>
                        <td colSpan={p.rattrapage ? 4 : 3} style={{ textAlign: 'right' }}>Semestre {s.semestre}</td>
                        <td style={{ textAlign: 'center' }}>{fmt(s.moyenne)}</td>
                        <td style={{ textAlign: 'center' }}>{s.credits_acquis}/{s.credits_total}</td>
                        <td style={{ textAlign: 'center' }}>{s.resultat}{s.mention ? ` — ${s.mention}` : ''}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
              <p className="text-xs mt-2 font-semibold">
                Bilan de l'année : moyenne {fmt(a.moyenne)}/20 — crédits acquis {a.credits_acquis}/{a.credits_total} — {a.resultat}{a.mention ? ` — Mention ${a.mention}` : ''}
              </p>
            </section>
          );
        })}

        {releve.semestres.length > 0 && (
          <p className="mt-4 text-sm font-bold border-t border-black pt-2">
            Cumul : moyenne générale {fmt(releve.cumul.moyenne)}/20 — {releve.cumul.credits_acquis} crédits ECTS acquis sur {releve.cumul.credits_total}
          </p>
        )}

        <p className="mt-4 text-[10px] text-gray-700">
          Validation d'une UE : moyenne ≥ {p.seuil_ue}/20{p.regle_validation === 'compensation' ? `, ou compensation si la moyenne du semestre est ≥ ${p.seuil_semestre}/20` : ' (sans compensation)'}.
          {p.rattrapage ? ' La meilleure note entre la session normale et le rattrapage est retenue.' : ''}
          {' '}Mentions : Passable ≥ {p.seuil_passable}, Assez bien ≥ {p.seuil_assez_bien}, Bien ≥ {p.seuil_bien}, Très bien ≥ {p.seuil_tres_bien}.
        </p>
        <div className="mt-8 text-sm text-right pr-6">
          <p>Fait le {new Date().toLocaleDateString('fr-FR')}</p>
          <p className="mt-1">Le responsable de la scolarité</p>
        </div>
      </div>
    </>
  );
}

function FragmentUe({ u, rattrapage }: { u: Releve['semestres'][number]['ues'][number]; rattrapage: boolean }) {
  return (
    <>
      <tr style={{ background: '#f6f6f6', fontWeight: 600 }}>
        <td>{u.code ? `${u.code} · ` : ''}{u.intitule}</td>
        <td /><td />{rattrapage && <td />}
        <td style={{ textAlign: 'center' }}>{fmt(u.moyenne)}</td>
        <td style={{ textAlign: 'center' }}>{u.credits_acquis}/{u.credits}</td>
        <td style={{ textAlign: 'center' }}>{STATUT[u.statut]}</td>
      </tr>
      {u.ecs.map((c) => (
        <tr key={c.ec_id}>
          <td style={{ paddingLeft: 14 }}>{c.intitule}</td>
          <td style={{ textAlign: 'center' }}>{c.coefficient}</td>
          <td style={{ textAlign: 'center' }}>{fmt(c.normale)}</td>
          {rattrapage && <td style={{ textAlign: 'center' }}>{fmt(c.rattrapage)}</td>}
          <td /><td /><td />
        </tr>
      ))}
    </>
  );
}
