'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formaterHeures } from '@/lib/planning';

type Classe = { id: string; nom: string; niveau: string | null; reconnu: boolean };
type Ligne = { id: string; nom: string; volume: string; officiel: number | null };

const nombre = (n: number) => String(n).replace('.', ',');

export default function VolumesPage() {
  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeId, setClasseId] = useState('');
  const [niveauOfficiel, setNiveauOfficiel] = useState<string | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const charger = useCallback(async (id: string) => {
    try {
      const r = await fetch('/api/planning/volumes' + (id ? `?classeId=${id}` : ''), { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) {
        setMessage({ type: 'error', text: d?.error || 'Chargement impossible.' });
      } else {
        setClasses(d.classes ?? []);
        if (id) {
          setNiveauOfficiel(d.niveauOfficiel ?? null);
          setLignes(
            (d.lignes ?? []).map((l: any) => ({
              id: l.id,
              nom: l.nom,
              officiel: l.officiel,
              volume: l.volume !== null ? String(l.volume) : l.officiel !== null ? String(l.officiel) : '',
            }))
          );
          if (d.installe === false)
            setMessage({ type: 'error', text: "Exécutez d'abord le script SQL « planning_v1 » dans Supabase." });
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    charger('');
  }, [charger]);

  useEffect(() => {
    setLignes([]);
    if (classeId) charger(classeId);
  }, [classeId, charger]);

  const appliquerOfficiel = async (ecraser: boolean) => {
    const question = ecraser
      ? "Remplacer TOUS les volumes (même ceux que vous avez saisis) par le tableau officiel ?"
      : 'Remplir les volumes vides de toutes les classes avec le tableau officiel ?';
    if (!window.confirm(question)) return;
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch('/api/planning/volumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'officiel', ecraser }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMessage({ type: 'error', text: d?.error || 'Impossible.' });
      } else {
        let texte = `${d.appliquees} volume(s) enregistré(s).`;
        if (d.classesIgnorees?.length) texte += ` Classes au niveau non reconnu : ${d.classesIgnorees.join(', ')}.`;
        if (d.matieresInconnues?.length)
          texte += ` Matières absentes du tableau officiel (à saisir à la main) : ${d.matieresInconnues.join(', ')}.`;
        setMessage({ type: 'success', text: texte });
        if (classeId) charger(classeId);
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setSaving(false);
  };

  const enregistrer = async (copier: boolean) => {
    const volumes = lignes.map((l) => ({ id: l.id, volume: l.volume === '' ? null : parseFloat(l.volume.replace(',', '.')) }));
    if (volumes.some((v) => v.volume !== null && (isNaN(v.volume) || v.volume < 0 || v.volume > 40))) {
      setMessage({ type: 'error', text: 'Un volume doit être un nombre entre 0 et 40.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch('/api/planning/volumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'classe', classeId, volumes, copierMemeNiveau: copier }),
      });
      const d = await r.json();
      setMessage(
        r.ok
          ? { type: 'success', text: 'Volumes enregistrés.' + (copier ? ` Copiés vers ${d.copiees} autre(s) classe(s).` : '') }
          : { type: 'error', text: d?.error || 'Enregistrement impossible.' }
      );
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setSaving(false);
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  const total = lignes.reduce((s, l) => s + (parseFloat(l.volume.replace(',', '.')) || 0), 0);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <Link href="/direction/planning" className="text-sm text-blue-600 underline">
          ← Planning
        </Link>
        <h1 className="text-2xl font-bold mt-1">Volumes horaires</h1>
        <p className="text-sm text-gray-500">
          Le tableau officiel donne les heures par matière pour chaque niveau. Vous pouvez les corriger classe par classe.
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

      <div className="border rounded-xl p-4 bg-white space-y-2">
        <p className="text-sm font-semibold">Toutes les classes d'un coup</p>
        <button
          onClick={() => appliquerOfficiel(false)}
          disabled={saving}
          className="w-full bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Remplir avec le tableau officiel
        </button>
        <button
          onClick={() => appliquerOfficiel(true)}
          disabled={saving}
          className="w-full border py-2 rounded-lg text-xs disabled:opacity-50 bg-white"
        >
          Tout remplacer par le tableau officiel (écrase mes volumes)
        </button>
        <p className="text-[11px] text-gray-400">
          Les classes dont le niveau est reconnu (6ème à Terminale) sont remplies ; les matières qui ne sont pas dans le tableau
          restent à saisir à la main.
        </p>
      </div>

      <select
        value={classeId}
        onChange={(e) => setClasseId(e.target.value)}
        className="w-full border rounded-lg p-2 text-sm bg-white"
      >
        <option value="">Voir ou corriger une classe...</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
            {c.reconnu ? '' : ' (niveau non reconnu)'}
          </option>
        ))}
      </select>

      {classeId && lignes.length === 0 && <p className="text-sm text-gray-500">Aucune matière dans cette classe.</p>}

      {lignes.length > 0 && (
        <>
          {niveauOfficiel && <p className="text-xs text-gray-500">Niveau officiel reconnu : {niveauOfficiel}</p>}
          <div className="border rounded-xl bg-white divide-y">
            {lignes.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <span className="text-sm">{l.nom}</span>
                  {l.officiel === null && <span className="block text-[11px] text-amber-600">Absente du tableau officiel</span>}
                  {l.officiel !== null && parseFloat(l.volume.replace(',', '.')) !== l.officiel && (
                    <span className="block text-[11px] text-gray-400">Officiel : {nombre(l.officiel)} h</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <input
                    value={l.volume}
                    onChange={(e) =>
                      setLignes((prev) => prev.map((x) => (x.id === l.id ? { ...x, volume: e.target.value.replace(',', '.') } : x)))
                    }
                    inputMode="decimal"
                    placeholder="0"
                    className="w-16 border rounded-lg p-1.5 text-sm text-right"
                  />
                  <span className="text-xs text-gray-500">h</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between p-3 text-sm font-semibold bg-gray-50 rounded-b-xl">
              <span>Total par semaine</span>
              <span>{formaterHeures(total)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => enregistrer(false)}
              disabled={saving}
              className="w-full bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer cette classe'}
            </button>
            <button
              onClick={() => {
                if (window.confirm('Copier ces volumes vers les autres classes du même niveau ?')) enregistrer(true);
              }}
              disabled={saving}
              className="w-full border py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 bg-white"
            >
              Enregistrer et copier vers le même niveau
            </button>
          </div>
        </>
      )}
    </div>
  );
            }
    
