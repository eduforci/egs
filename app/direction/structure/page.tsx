'use client';

import { useState, useEffect, useCallback } from 'react';
import { ESPACES, type EspaceCode } from '@/lib/espaces';

type Membre = { id: string; nom: string; prenom: string; role: string; espaces: EspaceCode[] };

const ROLE_LABEL: Record<string, string> = {
  chef: "Chef d'établissement",
  directeur_etudes: 'Directeur des études',
  secretaire: 'Secrétaire',
  comptable: 'Comptable',
  educateur: 'Éducateur',
  caissier: 'Caissier',
};

export default function EspacesEcolePage() {
  const [actifs, setActifs] = useState<EspaceCode[]>([]);
  const [personnel, setPersonnel] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acces, setAcces] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const charger = useCallback(async () => {
    try {
      const reponse = await fetch('/api/ecole/espaces', { cache: 'no-store' });
      const data = await reponse.json();
      if (reponse.status === 403) {
        setAcces(false);
      } else if (!reponse.ok) {
        setMessage({ type: 'error', text: data?.error || 'Chargement impossible.' });
      } else {
        setActifs(data.espacesActifs ?? []);
        setPersonnel(data.personnel ?? []);
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const basculer = (liste: EspaceCode[], code: EspaceCode): EspaceCode[] =>
    liste.includes(code) ? liste.filter((c) => c !== code) : [...liste, code];

  const enregistrer = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/ecole/espaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          droits: personnel.map((p) => ({ id: p.id, espaces: p.espaces })),
        }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setMessage({ type: 'error', text: data?.error || "Enregistrement impossible." });
      } else {
        setMessage({ type: 'success', text: 'Accès du personnel enregistrés.' });
        charger();
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setSaving(false);
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  if (!acces) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-2">Espaces de l'école</h1>
        <p className="text-sm text-gray-600">Cette page est réservée au promoteur de l'école.</p>
      </div>
    );
  }

  const estGroupe = actifs.length > 1;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Espaces de l'école</h1>
        <p className="text-sm text-gray-500">
          Chaque espace a ses propres classes, élèves et bulletins. Vous choisissez ici qui travaille dans quel espace.
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="border rounded-xl p-4 bg-white space-y-3">
        <p className="font-semibold text-sm">Espaces de votre école</p>
        {ESPACES.filter((e) => actifs.includes(e.code)).map((e) => (
          <div key={e.code} className="text-sm">
            <span className="font-medium">
              {e.icone} {e.label}
            </span>
            <span className="block text-xs text-gray-500">{e.description}</span>
          </div>
        ))}
        {actifs.length === 0 && <p className="text-xs text-gray-500">Aucun espace défini pour le moment.</p>}
        <p className="text-[11px] text-gray-400">
          Les espaces sont définis à la création de l'établissement. Pour en ajouter ou en retirer, contactez EGS.
        </p>
      </div>

      {estGroupe && (
        <div className="border rounded-xl p-4 bg-white space-y-3">
          <p className="font-semibold text-sm">Qui travaille dans quel espace ?</p>
          <p className="text-xs text-gray-500">
            Une personne sans case cochée accède à tous les espaces. Le promoteur voit toujours tout.
          </p>
          {personnel.length === 0 && <p className="text-xs text-gray-500">Aucun membre du personnel pour le moment.</p>}
          {personnel.map((p) => (
            <div key={p.id} className="border rounded-lg p-3 space-y-2">
              <div>
                <p className="text-sm font-medium">
                  {p.prenom} {p.nom}
                </p>
                <p className="text-xs text-gray-500">{ROLE_LABEL[p.role] ?? p.role}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ESPACES.filter((e) => actifs.includes(e.code)).map((e) => {
                  const coche = p.espaces.includes(e.code);
                  return (
                    <button
                      key={e.code}
                      type="button"
                      onClick={() =>
                        setPersonnel((prev) =>
                          prev.map((m) => (m.id === p.id ? { ...m, espaces: basculer(m.espaces, e.code) } : m))
                        )
                      }
                      className={`text-xs px-3 py-1.5 rounded-full border ${coche ? 'bg-black text-white' : 'bg-white'}`}
                    >
                      {e.icone} {e.court}
                    </button>
                  );
                })}
              </div>
              {p.espaces.length === 0 && <p className="text-[11px] text-gray-400">Accès à tous les espaces.</p>}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={enregistrer}
        disabled={saving || !estGroupe}
        className="w-full bg-black text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </div>
  );
    }
        
