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
  statut: string;
  numero_demande: string | null;
  piece_acte_naissance: boolean;
  piece_certificat_nationalite: boolean;
  piece_photo: boolean;
  piece_certificat_scolarite: boolean;
  motif_rejet: string | null;
  matricule_obtenu: string | null;
  cree_le: string;
}

const LIBELLES_STATUT: Record<string, string> = {
  brouillon: 'Brouillon',
  saisie: 'Saisie en cours',
  deposee: 'Déposée à la DRENA/DDENA',
  validee: 'Validée',
  rejetee: 'Rejetée',
  matricule_attribue: 'Matricule attribué',
};

const COULEURS_STATUT: Record<string, string> = {
  brouillon: '#9CA3AF',
  saisie: '#C9962B',
  deposee: '#C9962B',
  validee: '#0B3D2E',
  rejetee: '#DC2626',
  matricule_attribue: '#0B3D2E',
};

export default function ImmatriculationPage() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [elevesSansMatricule, setElevesSansMatricule] = useState<Eleve[]>([]);
  const [eleveChoisi, setEleveChoisi] = useState('');
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const [resDemandes, resEleves] = await Promise.all([
        fetch('/api/directeur-etudes/agfne/immatriculation'),
        fetch('/api/directeur-etudes/agfne/sans-matricule'),
      ]);
      const jsonDemandes = await resDemandes.json();
      const jsonEleves = await resEleves.json();
      if (jsonDemandes.error) throw new Error(jsonDemandes.error);
      if (jsonEleves.error) throw new Error(jsonEleves.error);
      setDemandes(jsonDemandes.demandes);
      setElevesSansMatricule(jsonEleves.eleves);
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
      const res = await fetch('/api/directeur-etudes/agfne/immatriculation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eleve_id: eleveChoisi }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEleveChoisi('');
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
      const res = await fetch(`/api/directeur-etudes/agfne/immatriculation/${id}`, {
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
        Immatriculation AGFNE
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Suivi des dossiers — la saisie officielle reste sur le portail AGFNE, cet écran aide
        à préparer et suivre le dossier
      </p>

      {erreur && <p className="text-red-600 text-sm mb-4">{erreur}</p>}

      <div className="border rounded p-3 mb-6">
        <label className="block text-sm font-medium mb-1">Nouvelle demande</label>
        <div className="flex gap-2">
          <select
            value={eleveChoisi}
            onChange={(e) => setEleveChoisi(e.target.value)}
            className="flex-1 border rounded px-2 py-1 text-sm"
          >
            <option value="">Choisir un élève sans matricule...</option>
            {elevesSansMatricule.map((e) => (
              <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
            ))}
          </select>
          <button
            onClick={creerDemande}
            disabled={!eleveChoisi || creation}
            className="px-3 py-1 rounded text-white text-sm font-medium"
            style={{ backgroundColor: '#0B3D2E' }}
          >
            + Créer
          </button>
        </div>
        {elevesSansMatricule.length === 0 && (
          <p className="text-xs text-gray-500 mt-2">Aucun élève sans matricule actuellement.</p>
        )}
      </div>

      {demandes.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune demande d'immatriculation pour le moment.</p>
      ) : (
        <div className="space-y-3">
          {demandes.map((d) => (
            <div key={d.id} className="border rounded p-3">
              <div className="flex justify-between items-start mb-2">
                <p className="font-semibold">
                  {d.eleve ? `${d.eleve.prenom} ${d.eleve.nom}` : 'Élève inconnu'}
                </p>
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

              <div className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">Checklist des pièces</label>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={d.piece_acte_naissance}
                      onChange={(e) => mettreAJour(d.id, { piece_acte_naissance: e.target.checked })}
                    />
                    Acte de naissance
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={d.piece_certificat_nationalite}
                      onChange={(e) => mettreAJour(d.id, { piece_certificat_nationalite: e.target.checked })}
                    />
                    Certificat nationalité
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={d.piece_photo}
                      onChange={(e) => mettreAJour(d.id, { piece_photo: e.target.checked })}
                    />
                    Photo
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={d.piece_certificat_scolarite}
                      onChange={(e) => mettreAJour(d.id, { piece_certificat_scolarite: e.target.checked })}
                    />
                    Certificat scolarité
                  </label>
                </div>
              </div>

              <div className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">Numéro de demande (AGFNE)</label>
                <input
                  type="text"
                  defaultValue={d.numero_demande ?? ''}
                  onBlur={(e) => mettreAJour(d.id, { numero_demande: e.target.value })}
                  placeholder="Renseigné après dépôt sur AGFNE"
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>

              {d.statut === 'rejetee' && (
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Motif de rejet</label>
                  <input
                    type="text"
                    defaultValue={d.motif_rejet ?? ''}
                    onBlur={(e) => mettreAJour(d.id, { motif_rejet: e.target.value })}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
              )}

              {(d.statut === 'validee' || d.statut === 'matricule_attribue') && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Matricule obtenu {d.statut === 'matricule_attribue' && '(reporté automatiquement sur la fiche élève)'}
                  </label>
                  <input
                    type="text"
                    defaultValue={d.matricule_obtenu ?? ''}
                    onBlur={(e) => mettreAJour(d.id, { matricule_obtenu: e.target.value, statut: 'matricule_attribue' })}
                    placeholder="Matricule diffusé par AGFNE"
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
  }
            
