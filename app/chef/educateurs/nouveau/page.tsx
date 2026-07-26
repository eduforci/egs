'use client';

import { useState } from 'react';

export default function NouvelEducateurPage() {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ identifiant: string; motDePasseProvisoire: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResultat(null);

    if (!nom.trim() || !prenom.trim()) {
      setError('Nom et prénom obligatoires.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/chef/creer-educateur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nom.trim(), prenom: prenom.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création.');
      }

      setResultat(data);
      setNom('');
      setPrenom('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-4 md:p-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-1">Nouvel éducateur</h1>
      <p className="text-sm text-gray-500 mb-4">
        Créer un compte pour la saisie des notes de conduite.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {resultat && (
        <div className="bg-green-50 border border-green-300 text-green-800 text-sm rounded-md p-3 mb-4">
          <p className="font-semibold mb-1">Compte créé avec succès !</p>
          <p>Identifiant : <strong>{resultat.identifiant}</strong></p>
          <p>Mot de passe provisoire : <strong>{resultat.motDePasseProvisoire}</strong></p>
          <p className="text-xs mt-2 text-green-700">
            Note ces identifiants maintenant — le mot de passe ne sera plus jamais affiché.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border rounded-xl p-5">
        <div>
          <label className="block text-sm font-medium mb-1">Nom *</label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Prénom *</label>
          <input
            type="text"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white rounded-lg p-3 font-medium disabled:opacity-50"
        >
          {loading ? 'Création...' : 'Créer le compte éducateur'}
        </button>
      </form>
    </main>
  );
}
