'use client';

import { useState } from 'react';

const ROLES = [
  { value: 'enseignant', label: 'Enseignant' },
  { value: 'educateur', label: 'Éducateur' },
  { value: 'directeur_etudes', label: 'Directeur des études' },
  { value: 'comptable', label: 'Comptable' },
  { value: 'secretaire', label: 'Secrétaire' },
];

type Resultat = {
  identifiant: string;
  motDePasseProvisoire: string;
  role: string;
  nom: string;
  prenom: string;
};

export default function AjouterMembrePage() {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [role, setRole] = useState('enseignant');
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState<Resultat | null>(null);

  const creer = async () => {
    if (!nom.trim() || !prenom.trim()) {
      setErreur('Nom et prénom obligatoires.');
      return;
    }

    setLoading(true);
    setErreur('');
    setResultat(null);

    try {
      const res = await fetch('/api/chef/personnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nom.trim(), prenom: prenom.trim(), role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErreur(data.error || 'Erreur lors de la création.');
        setLoading(false);
        return;
      }

      setResultat(data);
      setNom('');
      setPrenom('');
      setLoading(false);
    } catch (e: any) {
      setErreur('Erreur réseau: ' + e.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Ajouter un membre du personnel</h1>

      <div>
        <label className="block text-sm font-medium mb-1">Rôle</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full border rounded-lg p-2"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium mb-1">Nom</label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Prénom</label>
          <input
            type="text"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>
      </div>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      <button
        onClick={creer}
        disabled={loading}
        className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
      >
        {loading ? 'Création...' : 'Créer'}
      </button>

      {resultat && (
        <div className="border-2 border-green-200 bg-green-50 rounded-lg p-4 space-y-2">
          <div className="font-semibold text-green-800">
            {resultat.prenom} {resultat.nom} — {ROLES.find((r) => r.value === resultat.role)?.label}
          </div>
          <div className="text-sm space-y-1">
            <div><strong>Identifiant :</strong> {resultat.identifiant}</div>
            <div><strong>Mot de passe provisoire :</strong> {resultat.motDePasseProvisoire}</div>
          </div>
          <p className="text-xs text-gray-600">
            Communiquez ces informations à la personne concernée. Elle devra changer son mot de passe à la première connexion.
          </p>
        </div>
      )}
    </div>
  );
            }
