'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type Conge = { id: string; type: string; date_debut: string; date_fin: string; motif: string | null; statut: string };
type Champs = Record<string, string>;

const CHAMPS_VIDES: Champs = {
  poste: '', type_contrat: '', date_embauche: '', date_fin_contrat: '', salaire_mensuel: '', numero_cnps: '',
  diplome: '', contact_urgence_nom: '', contact_urgence_tel: '', notes: '',
};
const TYPES_CONGE: Record<string, string> = {
  conge_annuel: 'Congé annuel', maladie: 'Congé maladie', maternite: 'Congé maternité', permission: 'Permission', autre: 'Autre',
};
const STATUT: Record<string, string> = { demande: 'À traiter', approuve: 'Approuvé', refuse: 'Refusé' };
const jours = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
const fr = (d: string) => new Date(d).toLocaleDateString('fr-FR');

export default function DossierRhPage() {
  const id = useParams()?.id as string;
  const [personne, setPersonne] = useState<any>(null);
  const [champs, setChamps] = useState<Champs>(CHAMPS_VIDES);
  const [conges, setConges] = useState<Conge[]>([]);
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [cg, setCg] = useState({ type: 'conge_annuel', date_debut: '', date_fin: '', motif: '' });

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/rh?id=${id}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Chargement impossible.');
      setPersonne(j.personne);
      const d = j.dossier ?? {};
      const c: Champs = {};
      Object.keys(CHAMPS_VIDES).forEach((k) => { c[k] = d[k] != null ? String(d[k]) : ''; });
      setChamps(c);
      setConges(j.conges);
    } catch (e) {
      setMsg({ ok: false, texte: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setChargement(false);
    }
  }, [id]);
  useEffect(() => { charger(); }, [charger]);

  const envoyer = async (corps: Record<string, unknown>, succes: string) => {
    setOccupe(true); setMsg(null);
    try {
      const r = await fetch('/api/rh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Échec.');
      setMsg({ ok: true, texte: succes });
      await charger();
      return true;
    } catch (e) {
      setMsg({ ok: false, texte: e instanceof Error ? e.message : 'Erreur inconnue' });
      return false;
    } finally { setOccupe(false); }
  };

  const champ = (cle: string, label: string, type = 'text') => (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input type={type} value={champs[cle]} onChange={(e) => setChamps({ ...champs, [cle]: e.target.value })} className="w-full border rounded-md px-2 py-1.5 text-sm" />
    </div>
  );

  if (chargement) return <p className="p-4 text-sm text-gray-500">Chargement…</p>;
  if (!personne) return <p className="p-4 text-sm text-red-600">{msg?.texte ?? 'Personne introuvable.'}</p>;

  const soldeAnnuel = conges.filter((c) => c.type === 'conge_annuel' && c.statut === 'approuve' && c.date_debut.slice(0, 4) === String(new Date().getFullYear()))
    .reduce((s, c) => s + jours(c.date_debut, c.date_fin), 0);

  return (
    <main className="max-w-xl mx-auto p-4 pb-16 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{personne.nom} {personne.prenom}</h1>
          <p className="text-xs text-gray-500">{personne.fonction || personne.role}{personne.telephone ? ` · ${personne.telephone}` : ''}</p>
        </div>
        <Link href="/direction/rh" className="text-xs text-blue-600 underline whitespace-nowrap">← Personnel</Link>
      </div>

      {msg && <div className={`text-sm rounded-md p-3 border ${msg.ok ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-700'}`}>{msg.texte}</div>}

      <section className="border rounded-lg p-3 space-y-2">
        <h2 className="font-semibold text-sm">Dossier et contrat</h2>
        {champ('poste', 'Poste occupé')}
        <div>
          <label className="block text-xs text-gray-600 mb-1">Type de contrat</label>
          <select value={champs.type_contrat} onChange={(e) => setChamps({ ...champs, type_contrat: e.target.value })} className="w-full border rounded-md px-2 py-1.5 text-sm">
            <option value="">Non renseigné</option>
            <option value="cdi">CDI</option><option value="cdd">CDD</option><option value="vacataire">Vacataire</option>
            <option value="stagiaire">Stagiaire</option><option value="autre">Autre</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {champ('date_embauche', "Date d'embauche", 'date')}
          {champ('date_fin_contrat', 'Fin du contrat', 'date')}
        </div>
        {champ('salaire_mensuel', 'Salaire mensuel (F CFA)', 'number')}
        {champ('numero_cnps', 'N° CNPS')}
        {champ('diplome', 'Diplôme / qualification')}
        <div className="grid grid-cols-2 gap-2">
          {champ('contact_urgence_nom', 'Personne à prévenir')}
          {champ('contact_urgence_tel', 'Son téléphone', 'tel')}
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Notes</label>
          <textarea value={champs.notes} onChange={(e) => setChamps({ ...champs, notes: e.target.value })} rows={2} className="w-full border rounded-md px-2 py-1.5 text-sm" />
        </div>
        <button disabled={occupe} onClick={() => envoyer({ action: 'dossier', profileId: id, ...champs }, 'Dossier enregistré.')}
          className="w-full rounded-md py-2.5 text-sm bg-blue-600 text-white disabled:opacity-50">Enregistrer le dossier</button>
      </section>

      <section className="border rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Congés et permissions</h2>
          <span className="text-xs text-gray-500">Congé annuel pris cette année : {soldeAnnuel} j</span>
        </div>
        <div className="divide-y border rounded-md">
          {conges.length === 0 && <p className="p-2 text-xs text-gray-400">Aucun congé enregistré.</p>}
          {conges.map((c) => (
            <div key={c.id} className="p-2 text-sm space-y-1">
              <div className="flex justify-between gap-2">
                <span>{TYPES_CONGE[c.type]} — {jours(c.date_debut, c.date_fin)} j</span>
                <span className={`text-xs ${c.statut === 'approuve' ? 'text-green-700' : c.statut === 'refuse' ? 'text-gray-500' : 'text-red-600'}`}>{STATUT[c.statut]}</span>
              </div>
              <div className="text-xs text-gray-500">Du {fr(c.date_debut)} au {fr(c.date_fin)}{c.motif ? ` · ${c.motif}` : ''}</div>
              <div className="flex gap-2">
                {c.statut !== 'approuve' && <button disabled={occupe} onClick={() => envoyer({ action: 'conge_decider', id: c.id, statut: 'approuve' }, 'Congé approuvé.')} className="text-xs border rounded px-2 py-1">Approuver</button>}
                {c.statut !== 'refuse' && <button disabled={occupe} onClick={() => envoyer({ action: 'conge_decider', id: c.id, statut: 'refuse' }, 'Congé refusé.')} className="text-xs border rounded px-2 py-1">Refuser</button>}
                <button disabled={occupe} onClick={() => confirm('Supprimer ce congé ?') && envoyer({ action: 'conge_supprimer', id: c.id }, 'Congé supprimé.')} className="text-xs border rounded px-2 py-1 text-red-600">Supprimer</button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 bg-gray-50 rounded-md p-2">
          <p className="text-xs font-medium">Enregistrer un congé ou une permission</p>
          <select value={cg.type} onChange={(e) => setCg({ ...cg, type: e.target.value })} className="w-full border rounded-md px-2 py-1.5 text-sm bg-white">
            {Object.entries(TYPES_CONGE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={cg.date_debut} onChange={(e) => setCg({ ...cg, date_debut: e.target.value })} className="border rounded-md px-2 py-1.5 text-sm bg-white" />
            <input type="date" value={cg.date_fin} onChange={(e) => setCg({ ...cg, date_fin: e.target.value })} className="border rounded-md px-2 py-1.5 text-sm bg-white" />
          </div>
          <input value={cg.motif} onChange={(e) => setCg({ ...cg, motif: e.target.value })} placeholder="Motif (facultatif)" className="w-full border rounded-md px-2 py-1.5 text-sm bg-white" />
          <button disabled={occupe || !cg.date_debut || !cg.date_fin}
            onClick={async () => { if (await envoyer({ action: 'conge_creer', profileId: id, ...cg }, 'Congé enregistré.')) setCg({ ...cg, date_debut: '', date_fin: '', motif: '' }); }}
            className="w-full rounded-md py-2 text-sm bg-green-600 text-white disabled:opacity-50">Ajouter</button>
        </div>
      </section>
    </main>
  );
}
