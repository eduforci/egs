'use client';

import { useEffect, useState, useCallback } from 'react';

interface Eleve {
  id: string;
  nom: string;
  prenom: string;
  matricule: string | null;
}

interface Demande {
  id: string;
  eleve_id: string;
  eleve: Eleve | null;
  type: 'sortant' | 'entrant';
  etablissement_partenaire: string | null;
  statut: string;
  numero_demande: string | null;
  motif: string | null;
  cree_le: string;
}

const LIBELLES_STATUT: Record<string, string> = {
  brouillon: 'Brouillon',
  deposee: 'Déposée sur AGFNE',
  acceptee: 'Acceptée',
  rejetee: 'Rejetée',
};

const COULEURS_STATUT: Record<string, string> = {
  brouillon: '#9CA3AF',
  deposee: '#C9962B',
  acceptee: '#0B3D2E',
  rejetee: '#DC2626',
};

export default function TransfertsPage() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [eleveChoisi, setEleveChoisi] = useState('');
  const [typeChoisi, setTypeChoisi] = useState<'sortant' | 'entrant'>('sortant');
  const [etablissementPartenaire, setEtablissementPartenaire] = useState('');
  const [motif, setMotif] = useState('');
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const [resDemandes, resEleves] = await Promise.all([
        fetch('/api/directeur-etudes/agfne/transferts'),
        fetch('/api/directeur-etudes/eleves/liste'),
      ]);
      const jsonDemandes = await resDemandes.json();
      const jsonEleves = await resEleves.json();
      if (jsonDemandes.error) throw new Error(jsonDemandes.error);
      if (jsonEleves.error) throw new Error(jsonEleves.error);
      setDemandes(jsonDemandes.demandes);
      setEleves(jsonEleves.eleves);
    } catch (e: any) {
      setErreur(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  async function creerDemande() {
    if (!eleveChoisi) return;
    setCreation(true);
    setErreur(null);
    try {
      const res = await fetch('/api/directeur-etudes/agfne/transferts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eleve_id: eleveChoisi,
          type: typeChoisi,
          etablissement_partenaire: etablissementPartenaire || undefined,
          motif: motif || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEleveChoisi('');
      setEtablissementPartenaire('');
      setMotif('');
      charger();
    } catch (e: any) {
      setErreur(e.message);
    } finally {
      setCreation(false);
    }
  }

  async function mettreAJour(id: string, champs: Record<string, any>) {
    setErreur(null);
    try {
      const res = await fetch(`/api/directeur-etudes/agfne/transferts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(champs),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      charger();
    } catch (e: any) {
      setErreur(e.message);
    }
  }

  if (loading) return <div className="p-4">Chargement...</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1" style={{ color: '#0B3D2E' }}>
        Suivi des transferts AGFNE
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        La demande de transfert se fait sur le portail AGFNE — cet écran aide à
        préparer le dossier et suivre son statut
      </p>

      {erreur && <p className="text-red-600 text-sm mb-4">{erreur}</p>}

      <div className="border rounded p-3 mb-6 space-y-2">
        <label className="block text-sm font-medium">Nouvelle demande</label>

        <div className="flex gap-2">
          <button
            onClick={() => setTypeChoisi('sortant')}
            className="flex-1 py-1.5 rounded text-sm font-medium border"
            style={typeChoisi === 'sortant' ? { backgroundColor: '#0B3D2E', color: 'white' } : {}}
          >
            Sortant (élève qui part)
          </button>
          <button
            onClick={() => setTypeChoisi('entrant')}
            className="flex-1 py-1.5 rounded text-sm font-medium border"
            style={typeChoisi === 'entrant' ? { backgroundColor: '#0B3D2E', color: 'white' } : {}}
          >
            Entrant (élève qui arrive)
          </button>
        </div>

        <select
          value={eleveChoisi}
          onChange={(e) => setEleveChoisi(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        >
          <option value="">Choisir un élève...</option>
          {eleves.map((e) => (
            <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
          ))}
        </select>

        <input
          type="text"
          value={etablissementPartenaire}
          onChange={(e) => setEtablissementPartenaire(e.target.value)}
          placeholder={typeChoisi === 'sortant' ? "Établissement de destination" : "Établissement d'origine"}
          className="w-full border rounded px-2 py-1 text-sm"
        />

        <input
          type="text"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Motif (optionnel)"
          className="w-full border rounded px-2 py-1 text-sm"
        />

        <button
          onClick={creerDemande}
          disabled={!eleveChoisi || creation}
          className="w-full py-1.5 rounded text-white text-sm font-medium"
          style={{ backgroundColor: '#0B3D2E' }}
        >
          + Créer la demande
        </button>
      </div>

      {demandes.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune demande de transfert pour le moment.</p>
      ) : (
        <div className="space-y-3">
          {demandes.map((d) => (
            <div key={d.id} className="border rounded p-3">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold">
                    {d.eleve ? `${d.eleve.prenom} ${d.eleve.nom}` : 'Élève inconnu'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {d.type === 'sortant' ? 'Sortant' : 'Entrant'}
                    {d.etablissement_partenaire && ` — ${d.etablissement_partenaire}`}
                  </p>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: COULEURS_STATUT[d.statut] }}
                >
                  {LIBELLES_STATUT[d.statut]}
                </span>
              </div>

              <div className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">Statut</label>
                <select
                  value={d.statut}
                  onChange={(e) => mettreAJour(d.id, { statut: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm"
                >
                  {Object.entries(LIBELLES_STATUT).map(([valeur, libelle]) => (
                    <option key={valeur} value={valeur}>{libelle}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Numéro de demande (AGFNE)</label>
                <input
                  type="text"
                  defaultValue={d.numero_demande ?? ''}
                  onBlur={(e) => mettreAJour(d.id, { numero_demande: e.target.value })}
                  placeholder="Renseigné après dépôt sur AGFNE"
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>

              {d.type === 'sortant' && d.statut === 'acceptee' && (
                <p className="text-xs text-green-700 mt-2">
                  ✓ Élève marqué "transféré" dans EGS
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
    }
    
