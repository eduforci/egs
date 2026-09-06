'use client';

import { useEffect, useState } from 'react';

export default function EtablissementPage() {
  const [nom, setNom] = useState('');
  const [codeEtablissement, setCodeEtablissement] = useState('');
  const [codeDrena, setCodeDrena] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    fetch('/api/directeur-etudes/etablissement')
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setNom(json.etablissement.nom);
        setCodeEtablissement(json.etablissement.code_etablissement ?? '');
        setCodeDrena(json.etablissement.code_drena ?? '');
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function sauvegarder() {
    setSaving(true);
    setErreur(null);
    setSucces(false);
    try {
      const res = await fetch('/api/directeur-etudes/etablissement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_etablissement: codeEtablissement, code_drena: codeDrena }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur lors de la sauvegarde');
      setSucces(true);
    } catch (e: any) {
      setErreur(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4">Chargement...</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4" style={{ color: '#0B3D2E' }}>
        Établissement
      </h1>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Nom de l'établissement</label>
        <input
          type="text"
          value={nom}
          disabled
          className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-600"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Code établissement <span className="text-gray-500 font-normal">(attribué par le MENA/DESPS)</span>
        </label>
        <input
          type="text"
          value={codeEtablissement}
          onChange={(e) => setCodeEtablissement(e.target.value)}
          placeholder="Ex : 38754"
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Code DRENA <span className="text-gray-500 font-normal">(direction régionale de rattachement)</span>
        </label>
        <input
          type="text"
          value={codeDrena}
          onChange={(e) => setCodeDrena(e.target.value)}
          placeholder="Ex : DR12"
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {erreur && <p className="text-red-600 text-sm mb-3">{erreur}</p>}
      {succes && <p className="text-green-700 text-sm mb-3">✓ Enregistré</p>}

      <button
        onClick={sauvegarder}
        disabled={saving}
        className="w-full py-2 rounded text-white font-medium"
        style={{ backgroundColor: '#0B3D2E' }}
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </div>
  );
          }
