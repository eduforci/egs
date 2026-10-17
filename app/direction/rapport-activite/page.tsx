'use client';

import { useEffect, useState } from 'react';

const ROLE_LABEL: Record<string, string> = {
  enseignant: 'Enseignants', educateur: 'Éducateurs', administration: 'Administration', chef: 'Chefs',
  directeur: 'Directeurs', directeur_etudes: 'Directeurs des études', secretaire: 'Secrétaires', comptable: 'Comptables', caissier: 'Caissiers',
};
const f = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fr = (d: string) => new Date(d).toLocaleDateString('fr-FR');

function periodeParDefaut() {
  const n = new Date();
  const annee = n.getMonth() >= 8 ? n.getFullYear() : n.getFullYear() - 1;
  return { debut: `${annee}-09-01`, fin: iso(n) };
}

export default function RapportActivitePage() {
  const [p, setP] = useState(periodeParDefaut());
  const [d, setD] = useState<any>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  const generer = async () => {
    setChargement(true); setErreur('');
    try {
      const r = await fetch(`/api/rapport-activite?debut=${p.debut}&fin=${p.fin}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Impossible de produire le rapport.');
      setD(j);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally { setChargement(false); }
  };
  useEffect(() => { generer(); /* eslint-disable-next-line */ }, []);

  const Ligne = ({ l, v }: { l: string; v: string | number }) => (
    <tr><td className="border px-2 py-1">{l}</td><td className="border px-2 py-1 text-right font-medium">{v}</td></tr>
  );
  const Bloc = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <section className="break-inside-avoid">
      <h2 className="font-semibold text-sm bg-gray-100 px-2 py-1 mb-1">{t}</h2>
      {children}
    </section>
  );

  const fin = d?.finances;
  const taux = fin && fin.attenduAnnee > 0 ? Math.round((fin.payeAnnee / fin.attenduAnnee) * 100) : null;

  return (
    <main className="max-w-2xl mx-auto p-4 pb-16 space-y-3">
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } body { background: #fff; } }`}</style>

      <div className="print:hidden space-y-3">
        <h1 className="text-xl font-bold">Rapport d'activité</h1>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="block text-xs text-gray-600 mb-1">Du</label>
            <input type="date" value={p.debut} onChange={(e) => setP({ ...p, debut: e.target.value })} className="border rounded-md px-2 py-2 text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Au</label>
            <input type="date" value={p.fin} onChange={(e) => setP({ ...p, fin: e.target.value })} className="border rounded-md px-2 py-2 text-sm" /></div>
          <button onClick={generer} disabled={chargement} className="border rounded-md px-3 py-2 text-sm bg-blue-600 text-white disabled:opacity-50">Actualiser</button>
          <button onClick={() => window.print()} disabled={!d} className="border rounded-md px-3 py-2 text-sm bg-white disabled:opacity-50">Imprimer</button>
        </div>
        {erreur && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3">{erreur}</div>}
        {chargement && <p className="text-sm text-gray-500">Calcul du rapport…</p>}
      </div>

      {d && !chargement && (
        <article className="space-y-4 text-sm">
          <header className="text-center">
            <div className="font-bold text-base">{d.ecole}</div>
            <div className="font-semibold">Rapport d'activité</div>
            <div className="text-xs text-gray-600">Du {fr(d.debut)} au {fr(d.fin)}{d.annee ? ` — année scolaire ${d.annee}` : ''}</div>
          </header>

          <Bloc t="1. Effectifs des élèves">
            <p className="mb-1">Effectif total : <b>{d.effectifs.total}</b> élève(s) dans {d.effectifs.parClasse.length} classe(s).</p>
            <table className="w-full border-collapse text-xs">
              <thead><tr className="bg-gray-50"><th className="border px-2 py-1 text-left">Classe</th><th className="border px-2 py-1">Garçons</th><th className="border px-2 py-1">Filles</th><th className="border px-2 py-1">Total</th></tr></thead>
              <tbody>
                {d.effectifs.parClasse.map((c: any) => (
                  <tr key={c.classe}><td className="border px-2 py-0.5">{c.classe}</td><td className="border px-2 py-0.5 text-center">{c.garcons}</td><td className="border px-2 py-0.5 text-center">{c.filles}</td><td className="border px-2 py-0.5 text-center font-medium">{c.total}</td></tr>
                ))}
              </tbody>
            </table>
          </Bloc>

          <Bloc t="2. Personnel">
            <table className="w-full border-collapse text-xs"><tbody>
              {Object.entries(d.personnel).map(([r, n]) => <Ligne key={r} l={ROLE_LABEL[r] ?? r} v={n as number} />)}
              <Ligne l="Congés approuvés sur la période" v={`${d.conges.nb} (${d.conges.jours} jour(s))`} />
              <Ligne l="Pointages d'arrivée enregistrés" v={d.pointage.entrees} />
              <Ligne l="Dont arrivées en retard" v={d.pointage.retards} />
            </tbody></table>
          </Bloc>

          <Bloc t="3. Vie scolaire">
            <table className="w-full border-collapse text-xs"><tbody>
              <Ligne l="Absences d'élèves" v={d.assiduite.absences} />
              <Ligne l="Dont non justifiées" v={d.assiduite.absencesNonJustifiees} />
              <Ligne l="Retards d'élèves" v={d.assiduite.retards} />
              <Ligne l="Élèves concernés" v={d.assiduite.elevesConcernes} />
              <Ligne l="Notes saisies par les enseignants" v={f(d.nbNotes)} />
            </tbody></table>
          </Bloc>

          <Bloc t="4. Finances">
            <table className="w-full border-collapse text-xs"><tbody>
              <Ligne l="Scolarité perçue sur la période" v={`${f(fin.scolaritePercue)} F`} />
              <Ligne l="Autres recettes" v={`${f(fin.autresRecettes)} F`} />
              <Ligne l="Total des recettes" v={`${f(fin.scolaritePercue + fin.autresRecettes)} F`} />
              <Ligne l="Dépenses" v={`${f(fin.depenses)} F`} />
              <Ligne l="Résultat de la période" v={`${f(fin.scolaritePercue + fin.autresRecettes - fin.depenses)} F`} />
              <Ligne l="Scolarité attendue pour l'année" v={`${f(fin.attenduAnnee)} F`} />
              <Ligne l="Scolarité payée depuis le début de l'année" v={`${f(fin.payeAnnee)} F${taux !== null ? ` (${taux} %)` : ''}`} />
              <Ligne l="Reste à recouvrer" v={`${f(Math.max(fin.attenduAnnee - fin.payeAnnee, 0))} F`} />
            </tbody></table>
          </Bloc>

          <footer className="text-[11px] text-gray-500 pt-2">Rapport généré le {new Date().toLocaleDateString('fr-FR')}.</footer>
        </article>
      )}
    </main>
  );
}
