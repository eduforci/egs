'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Personne = {
  id: string; nom: string; prenom: string; role: string; fonction: string | null; telephone: string | null; actif: boolean | null;
  dossier: { poste: string | null; type_contrat: string | null; date_embauche: string | null; date_fin_contrat: string | null } | null;
  enConge: boolean; demandes: number; contratBientotFini: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  enseignant: 'Enseignant', educateur: 'Éducateur', administration: 'Administration', chef: 'Chef',
  directeur: 'Directeur', directeur_etudes: 'Directeur des études', secretaire: 'Secrétaire', comptable: 'Comptable', caissier: 'Caissier',
};
const CONTRAT: Record<string, string> = { cdi: 'CDI', cdd: 'CDD', vacataire: 'Vacataire', stagiaire: 'Stagiaire', autre: 'Autre' };

export default function RhAccueilPage() {
  const [liste, setListe] = useState<Personne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/rh', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Chargement impossible.');
        setListe(j.personnel);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  const q = recherche.trim().toLowerCase();
  const affichees = liste.filter((p) => {
    if (q && !`${p.nom} ${p.prenom}`.toLowerCase().includes(q)) return false;
    if (filtre === 'contrat' && !p.contratBientotFini) return false;
    if (filtre === 'conge' && !p.enConge) return false;
    if (filtre === 'sans' && p.dossier) return false;
    return true;
  });
  const nbContrats = liste.filter((p) => p.contratBientotFini).length;
  const nbConges = liste.filter((p) => p.enConge).length;

  return (
    <main className="max-w-2xl mx-auto p-4 pb-16 space-y-3">
      <div>
        <h1 className="text-xl font-bold">Gestion du personnel (RH)</h1>
        <p className="text-sm text-gray-500">Dossier, contrat et congés de chaque membre du personnel.</p>
      </div>

      {erreur && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3">{erreur}</div>}
      {chargement && <p className="text-sm text-gray-500">Chargement…</p>}

      {!chargement && !erreur && (
        <>
          <div className="grid grid-cols-2 gap-2 text-center">
            <button onClick={() => setFiltre(filtre === 'contrat' ? '' : 'contrat')} className={`border rounded-lg p-2 ${filtre === 'contrat' ? 'ring-2 ring-orange-400' : ''}`}>
              <div className="text-xl font-bold text-orange-600">{nbContrats}</div>
              <div className="text-[11px] text-gray-600">Contrats finissant sous 60 jours</div>
            </button>
            <button onClick={() => setFiltre(filtre === 'conge' ? '' : 'conge')} className={`border rounded-lg p-2 ${filtre === 'conge' ? 'ring-2 ring-blue-400' : ''}`}>
              <div className="text-xl font-bold text-blue-600">{nbConges}</div>
              <div className="text-[11px] text-gray-600">En congé aujourd'hui</div>
            </button>
          </div>

          <div className="flex gap-2">
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un nom…" className="flex-1 border rounded-md px-3 py-2 text-sm" />
            <button onClick={() => setFiltre(filtre === 'sans' ? '' : 'sans')} className={`border rounded-md px-3 py-2 text-xs ${filtre === 'sans' ? 'bg-gray-800 text-white' : 'bg-white'}`}>Sans dossier</button>
          </div>

          <div className="border rounded-lg divide-y">
            {affichees.length === 0 && <p className="p-3 text-sm text-gray-400">Personne à afficher.</p>}
            {affichees.map((p) => (
              <Link key={p.id} href={`/direction/rh/${p.id}`} className="block px-3 py-2.5 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.nom} {p.prenom}{p.actif === false ? ' (inactif)' : ''}</div>
                    <div className="text-xs text-gray-500 truncate">{p.dossier?.poste || p.fonction || ROLE_LABEL[p.role] || p.role}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {p.dossier?.type_contrat && <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full">{CONTRAT[p.dossier.type_contrat]}</span>}
                    {p.contratBientotFini && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Contrat à renouveler</span>}
                    {p.enConge && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">En congé</span>}
                    {!p.dossier && <span className="text-[10px] bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded-full">Dossier vide</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
