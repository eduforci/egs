'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client'; // ajuste le chemin si différent chez toi
import { exportToPDF, exportToExcel, formatMontant, ReportColumn } from '@/lib/finance-export';

type ReportKind = 'summary' | 'list' | 'journal' | 'bilan';

interface ReportConfig {
  id: string;
  label: string;
  rpc: string;
  kind: ReportKind;
  filters: string[];
  columns?: ReportColumn[];
}

const REPORTS: ReportConfig[] = [
  { id: 'dashboard', label: 'Tableau de bord financier', rpc: 'rapport_dashboard_financier', kind: 'summary', filters: ['annee'] },
  {
    id: 'impayes', label: 'Élèves en impayé', rpc: 'rapport_impayes', kind: 'list', filters: ['annee', 'classe'],
    columns: [
      { key: 'matricule', label: 'Matricule' },
      { key: 'nom_complet', label: 'Élève' },
      { key: 'classe', label: 'Classe' },
      { key: 'montant_du', label: 'Montant dû', align: 'right' },
      { key: 'montant_paye', label: 'Payé', align: 'right' },
      { key: 'solde_restant', label: 'Solde restant', align: 'right' },
    ],
  },
  {
    id: 'recouvrement', label: 'Recouvrement par classe', rpc: 'rapport_recouvrement_classes', kind: 'list', filters: ['annee'],
    columns: [
      { key: 'classe', label: 'Classe' },
      { key: 'niveau', label: 'Niveau' },
      { key: 'effectif', label: 'Effectif', align: 'right' },
      { key: 'total_du', label: 'Total dû', align: 'right' },
      { key: 'total_paye', label: 'Total payé', align: 'right' },
      { key: 'solde_restant', label: 'Solde restant', align: 'right' },
      { key: 'taux_recouvrement', label: 'Taux (%)', align: 'right' },
    ],
  },
  {
    id: 'registre', label: 'Registre des paiements', rpc: 'rapport_registre_paiements', kind: 'list', filters: ['dateRange', 'mode', 'caissier', 'classe'],
    columns: [
      { key: 'date_paiement', label: 'Date' },
      { key: 'numero_recu', label: 'N° reçu' },
      { key: 'eleve', label: 'Élève' },
      { key: 'classe', label: 'Classe' },
      { key: 'mode_paiement', label: 'Mode' },
      { key: 'caissier', label: 'Caissier' },
      { key: 'montant', label: 'Montant', align: 'right' },
    ],
  },
  { id: 'journal', label: 'Journal de caisse', rpc: 'rapport_journal_caisse', kind: 'journal', filters: ['session'] },
  { id: 'bilan', label: 'Bilan recettes / dépenses', rpc: 'rapport_bilan_tresorerie', kind: 'bilan', filters: ['dateRange'] },
  {
    id: 'banques', label: 'Mouvements bancaires', rpc: 'rapport_mouvements_bancaires', kind: 'list', filters: ['dateRange', 'compte'],
    columns: [
      { key: 'date_mouvement', label: 'Date' },
      { key: 'compte', label: 'Compte' },
      { key: 'type', label: 'Type' },
      { key: 'libelle', label: 'Libellé' },
      { key: 'montant', label: 'Montant', align: 'right' },
    ],
  },
  {
    id: 'remises', label: 'Remises et bourses', rpc: 'rapport_remises_bourses', kind: 'list', filters: ['typeRemise'],
    columns: [
      { key: 'eleve', label: 'Élève' },
      { key: 'classe', label: 'Classe' },
      { key: 'type_remise', label: 'Type' },
      { key: 'mode', label: 'Mode' },
      { key: 'valeur', label: 'Valeur' },
      { key: 'montant_remise', label: 'Montant remise', align: 'right' },
      { key: 'frais_concerne', label: 'Frais concerné' },
    ],
  },
];

function firstDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function RapportsFinanciersPage() {
  const supabase = createClient();

  const [reportId, setReportId] = useState('dashboard');
  const report = useMemo(() => REPORTS.find((r) => r.id === reportId)!, [reportId]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etablissementNom, setEtablissementNom] = useState('');

  // Options de filtres
  const [classes, setClasses] = useState<any[]>([]);
  const [modesPaiement, setModesPaiement] = useState<any[]>([]);
  const [caissiers, setCaissiers] = useState<any[]>([]);
  const [caisses, setCaisses] = useState<any[]>([]);
  const [comptesBancaires, setComptesBancaires] = useState<any[]>([]);
  const [typesRemises, setTypesRemises] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  // Valeurs des filtres
  const [annee, setAnnee] = useState('');
  const [classeId, setClasseId] = useState('');
  const [dateDebut, setDateDebut] = useState(firstDayOfMonth());
  const [dateFin, setDateFin] = useState(today());
  const [modeId, setModeId] = useState('');
  const [caissierId, setCaissierId] = useState('');
  const [compteId, setCompteId] = useState('');
  const [typeRemiseId, setTypeRemiseId] = useState('');
  const [caisseId, setCaisseId] = useState('');
  const [sessionId, setSessionId] = useState('');

  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // Chargement initial des options de filtres + nom établissement
  useEffect(() => {
    (async () => {
      const [
        { data: et },
        { data: cl },
        { data: mp },
        { data: pr },
        { data: ca },
        { data: cb },
        { data: tr },
      ] = await Promise.all([
        supabase.from('etablissements').select('nom, annee_scolaire_active').single(),
        supabase.from('classes').select('id, nom, niveau').order('nom'),
        supabase.from('modes_paiement').select('id, nom').order('ordre'),
        supabase.from('profiles').select('id, nom, prenom').eq('role', 'comptable'),
        supabase.from('caisses').select('id, nom'),
        supabase.from('comptes_bancaires').select('id, nom, banque'),
        supabase.from('types_remises').select('id, nom').order('ordre'),
      ]);

      if (et) {
        setEtablissementNom(et.nom || '');
        setAnnee(et.annee_scolaire_active || '');
      }
      setClasses(cl || []);
      setModesPaiement(mp || []);
      setCaissiers(pr || []);
      setCaisses(ca || []);
      setComptesBancaires(cb || []);
      setTypesRemises(tr || []);
    })();
  }, []);

  // Chargement des sessions de caisse quand on choisit une caisse (rapport "journal")
  useEffect(() => {
    if (report.id !== 'journal') return;
    (async () => {
      const { data } = await supabase.rpc('rapport_sessions_caisse', {
        p_caisse_id: caisseId || null,
        p_date_debut: dateDebut || null,
        p_date_fin: dateFin || null,
      });
      setSessions(data || []);
    })();
  }, [report.id, caisseId, dateDebut, dateFin]);

  async function runReport() {
    setLoading(true);
    setError(null);
    setRows([]);
    setSummary(null);

    try {
      let params: Record<string, any> = {};

      switch (report.id) {
        case 'dashboard':
          params = { p_annee_scolaire: annee || null };
          break;
        case 'impayes':
          params = { p_annee_scolaire: annee || null, p_classe_id: classeId || null };
          break;
        case 'recouvrement':
          params = { p_annee_scolaire: annee || null };
          break;
        case 'registre':
          params = {
            p_date_debut: dateDebut, p_date_fin: dateFin,
            p_mode_paiement_id: modeId || null, p_caissier_id: caissierId || null, p_classe_id: classeId || null,
          };
          break;
        case 'journal':
          if (!sessionId) { setLoading(false); return; }
          params = { p_caisse_session_id: sessionId };
          break;
        case 'bilan':
          params = { p_date_debut: dateDebut, p_date_fin: dateFin };
          break;
        case 'banques':
          params = { p_compte_bancaire_id: compteId || null, p_date_debut: dateDebut || null, p_date_fin: dateFin || null };
          break;
        case 'remises':
          params = { p_annee_scolaire: annee || null, p_type_remise_id: typeRemiseId || null };
          break;
      }

      const { data, error: rpcError } = await supabase.rpc(report.rpc, params);
      if (rpcError) throw rpcError;

      if (report.kind === 'list') {
        setRows(data || []);
      } else {
        setSummary(data || {});
      }
    } catch (e: any) {
      setError(e.message || 'Erreur lors du chargement du rapport');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (annee) runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, annee]);

  function handleExportPDF() {
    if (report.kind === 'list' && report.columns) {
      exportToPDF(report.label, `Du ${dateDebut} au ${dateFin}`, report.columns, rows, report.id, etablissementNom);
    }
  }
  function handleExportExcel() {
    if (report.kind === 'list' && report.columns) {
      exportToExcel(report.columns, rows, report.id, report.label);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Rapports financiers</h1>

      {/* Sélecteur de rapport */}
      <select
        value={reportId}
        onChange={(e) => setReportId(e.target.value)}
        className="w-full border rounded-lg p-3 bg-white"
      >
        {REPORTS.map((r) => (
          <option key={r.id} value={r.id}>{r.label}</option>
        ))}
      </select>

      {/* Filtres dynamiques */}
      <div className="grid grid-cols-2 gap-2">
        {report.filters.includes('annee') && (
          <input value={annee} onChange={(e) => setAnnee(e.target.value)} placeholder="Année scolaire (ex: 2025-2026)" className="border rounded-lg p-2 col-span-2" />
        )}
        {report.filters.includes('classe') && (
          <select value={classeId} onChange={(e) => setClasseId(e.target.value)} className="border rounded-lg p-2">
            <option value="">Toutes les classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        )}
        {report.filters.includes('dateRange') && (
          <>
            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="border rounded-lg p-2" />
            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="border rounded-lg p-2" />
          </>
        )}
        {report.filters.includes('mode') && (
          <select value={modeId} onChange={(e) => setModeId(e.target.value)} className="border rounded-lg p-2">
            <option value="">Tous les modes</option>
            {modesPaiement.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        )}
        {report.filters.includes('caissier') && (
          <select value={caissierId} onChange={(e) => setCaissierId(e.target.value)} className="border rounded-lg p-2">
            <option value="">Tous les caissiers</option>
            {caissiers.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
          </select>
        )}
        {report.filters.includes('compte') && (
          <select value={compteId} onChange={(e) => setCompteId(e.target.value)} className="border rounded-lg p-2 col-span-2">
            <option value="">Tous les comptes</option>
            {comptesBancaires.map((c) => <option key={c.id} value={c.id}>{c.nom} — {c.banque}</option>)}
          </select>
        )}
        {report.filters.includes('typeRemise') && (
          <select value={typeRemiseId} onChange={(e) => setTypeRemiseId(e.target.value)} className="border rounded-lg p-2 col-span-2">
            <option value="">Tous les types</option>
            {typesRemises.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
        )}
        {report.filters.includes('session') && (
          <>
            <select value={caisseId} onChange={(e) => setCaisseId(e.target.value)} className="border rounded-lg p-2">
              <option value="">Toutes les caisses</option>
              {caisses.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="border rounded-lg p-2">
              <option value="">Sélectionner une session</option>
              {sessions.map((s: any) => (
                <option key={s.session_id} value={s.session_id}>
                  {s.caisse} — {new Date(s.ouverte_le).toLocaleDateString('fr-FR')} ({s.statut})
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <button
        onClick={runReport}
        disabled={loading}
        className="w-full bg-slate-900 text-white rounded-lg p-3 font-medium disabled:opacity-50"
      >
        {loading ? 'Chargement...' : 'Générer le rapport'}
      </button>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 text-sm">{error}</div>}

      {/* Rendu résumé (dashboard) */}
      {report.kind === 'summary' && summary && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total dû" value={formatMontant(summary.total_du)} />
          <StatCard label="Total payé" value={formatMontant(summary.total_paye)} color="green" />
          <StatCard label="Solde restant" value={formatMontant(summary.solde_restant)} color="red" />
          <StatCard label="Taux de recouvrement" value={`${summary.taux_recouvrement ?? 0} %`} />
          <StatCard label="Total remises" value={formatMontant(summary.total_remises)} />
          <StatCard label="Élèves en impayé" value={`${summary.nombre_eleves_impayes ?? 0} / ${summary.nombre_eleves ?? 0}`} />
          <StatCard label="Recettes diverses" value={formatMontant(summary.total_recettes_diverses)} />
          <StatCard label="Dépenses" value={formatMontant(summary.total_depenses)} color="red" />
          <StatCard label="Solde bancaire" value={formatMontant(summary.solde_bancaire_global)} />
          <StatCard label="Solde caisse" value={formatMontant(summary.solde_caisse_global)} />
        </div>
      )}

      {/* Rendu bilan */}
      {report.kind === 'bilan' && summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Paiements scolarité" value={formatMontant(summary.total_paiements_scolarite)} color="green" />
            <StatCard label="Recettes diverses" value={formatMontant(summary.total_recettes_diverses)} color="green" />
            <StatCard label="Total dépenses" value={formatMontant(summary.total_depenses)} color="red" />
            <StatCard label="Solde net" value={formatMontant(summary.solde_net)} />
          </div>
          <MiniTable title="Dépenses par catégorie" items={summary.depenses_par_categorie} keyLabel="categorie" />
          <MiniTable title="Recettes diverses par catégorie" items={summary.recettes_par_categorie} keyLabel="categorie" />
          <MiniTable title="Paiements scolarité par mode" items={summary.paiements_par_mode} keyLabel="mode" />
        </div>
      )}

      {/* Rendu journal de caisse */}
      {report.kind === 'journal' && summary && summary.session_id && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Solde initial" value={formatMontant(summary.solde_initial)} />
            <StatCard label="Total entrées" value={formatMontant(summary.total_entrees)} color="green" />
            <StatCard label="Total sorties" value={formatMontant(summary.total_sorties)} color="red" />
            <StatCard label="Solde théorique" value={formatMontant(summary.solde_final_theorique)} />
            {summary.statut === 'fermee' && (
              <>
                <StatCard label="Solde compté" value={formatMontant(summary.solde_final_compte)} />
                <StatCard label="Écart" value={formatMontant(summary.ecart)} color={summary.ecart !== 0 ? 'red' : 'green'} />
              </>
            )}
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Libellé</th>
                  <th className="p-2 text-right">Montant</th>
                  <th className="p-2 text-left">Par</th>
                </tr>
              </thead>
              <tbody>
                {(summary.mouvements || []).map((m: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{new Date(m.date_mouvement).toLocaleString('fr-FR')}</td>
                    <td className="p-2">{m.type === 'entree' ? 'Entrée' : 'Sortie'}</td>
                    <td className="p-2">{m.libelle}</td>
                    <td className="p-2 text-right">{formatMontant(m.montant)}</td>
                    <td className="p-2">{m.cree_par}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rendu liste générique + export */}
      {report.kind === 'list' && report.columns && (
        <div className="space-y-3">
          {rows.length > 0 && (
            <div className="flex gap-2">
              <button onClick={handleExportPDF} className="flex-1 bg-red-600 text-white rounded-lg p-2 text-sm font-medium">
                Export PDF
              </button>
              <button onClick={handleExportExcel} className="flex-1 bg-green-600 text-white rounded-lg p-2 text-sm font-medium">
                Export Excel
              </button>
            </div>
          )}
          <div className="text-sm text-slate-500">{rows.length} résultat(s)</div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {report.columns.map((c) => (
                    <th key={c.key} className={`p-2 text-${c.align || 'left'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {report.columns!.map((c) => (
                      <td key={c.key} className={`p-2 text-${c.align || 'left'}`}>
                        {typeof row[c.key] === 'number' ? formatMontant(row[c.key]) : (row[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: 'green' | 'red' }) {
  const colorClass = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-slate-900';
  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}

function MiniTable({ title, items, keyLabel }: { title: string; items: any[]; keyLabel: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="font-medium mb-2">{title}</div>
      {items.map((it: any, i: number) => (
        <div key={i} className="flex justify-between text-sm py-1 border-t first:border-t-0">
          <span>{it[keyLabel]}</span>
          <span className="font-medium">{formatMontant(it.montant)}</span>
        </div>
      ))}
    </div>
  );
  }
