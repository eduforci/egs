'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const FONCTIONS = [
  "Directeur",
  "Directrice",
  "Directeur des études",
  "Chef d'établissement",
  "Proviseur",
  "Principal",
  "Censeur",
  "Fondateur",
  "Promoteur",
  "Économe",
  "Secrétaire général",
];

const ROLE_LABELS: Record<string, string> = {
  administration: 'Administration',
  chef: "Chef d'établissement",
  directeur_etudes: 'Directeur des études',
};

export default function MonProfilPage() {
  const [supabase] = useState(() => createClient());
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [fonction, setFonction] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [role, setRole] = useState('');
  const [aCompleter, setACompleter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Non authentifié.');

        const { data: profil, error } = await supabase
          .from('profiles')
          .select('nom, prenom, telephone, identifiant, role')
          .eq('id', user.id)
          .single();
        if (error) throw new Error(error.message);

        const nomVide = !profil.nom || profil.nom.trim().toLowerCase() === 'à renseigner';
        const prenomVide = !profil.prenom || profil.prenom.trim().toLowerCase() === 'à renseigner';
        setACompleter(nomVide || prenomVide);
        setNom(nomVide ? '' : profil.nom);
        setPrenom(prenomVide ? '' : profil.prenom);
        setTelephone(profil.telephone || '');
        setIdentifiant(profil.identifiant || '');
        setRole(profil.role || '');

        // La fonction est lue à part : si la colonne n'existe pas encore, le reste du profil s'affiche quand même
        const { data: f } = await supabase
          .from('profiles')
          .select('fonction')
          .eq('id', user.id)
          .single();
        setFonction((f as any)?.fonction || '');
      } catch (e: any) {
        setErreur(e?.message || 'Erreur de chargement.');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    if (!nom.trim() || !prenom.trim()) {
      setErreur('Le nom et le prénom sont obligatoires.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, prenom, telephone, fonction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible d'enregistrer.");
      setACompleter(false);
      setSucces('Profil enregistré. Le menu se mettra à jour au prochain affichage.');
    } catch (e: any) {
      setErreur(e?.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-lg mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Mon profil</h1>
      <p className="text-sm text-gray-500 mb-4">
        {ROLE_LABELS[role] || role}
        {identifiant ? ` · Identifiant ${identifiant}` : ''}
      </p>

      {aCompleter && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md p-3 mb-4">
          Votre nom ou votre prénom n'a pas encore été renseigné. Merci de les compléter.
        </div>
      )}
      {erreur && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{erreur}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      <form onSubmit={enregistrer} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Téléphone</label>
          <input
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Fonction (titre affiché)</label>
          <input
            type="text"
            list="fonctions"
            value={fonction}
            onChange={(e) => setFonction(e.target.value)}
            placeholder="Ex. Directeur, Censeur, Promoteur..."
            className="w-full border rounded-lg p-2"
          />
          <datalist id="fonctions">
            {FONCTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <p className="text-xs text-gray-500 mt-1">
            Ce titre s'affiche sous votre nom dans le menu. S'il est vide, le nom du rôle est affiché.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>
    </main>
  );
}
