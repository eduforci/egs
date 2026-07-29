'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Epreuve = {
  id: string;
  matiere_id: string;
  matiere_nom: string;
  nom: string;
  coefficient: number;
  bareme: number;
  duree: string | null;
  type_epreuve: string;
};

type MatiereDisponible = { id: string; nom: string };

const TYPES_EPREUVE = [
  { value: 'ecrit', label: 'Écrit' },
  { value: 'oral', label: 'Oral' },
  { value: 'pratique', label: 'Pratique' },
  { value: 'autre', label: 'Autre' },
];

export default function ExamenEpreuvesPage() {
  const params = useParams();
  const examenId = params?.id as string;
  const supabase = createClient();

  const [examenNom, setExamenNom] = useState('');
  const [epreuves, setEpreuves] = useState<Epreuve[]>([]);
  const [matieresDisponibles, setMatieresDisponibles] = useState<MatiereDisponible[]>([]);

  const [matiereChoisie, setMatiereChoisie] = useState('');
  const [nomEpreuve, setNomEpreuve] = useState('');
  const [coefficient, setCoefficient] = useState('1');
  const [bareme, setBareme] = useState('20');
  const [duree, setDuree] = useState('');
  const [typeEpreuve, setTypeEpreuve] = useState('ecrit');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const pointsTotal = epreuves.reduce((sum, e) => sum + e.coefficient, 0) * 20;

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: examen, error: examenError } = await supabase
        .from('examens')
        .select('nom, etablissement_id')
        .eq('id', examenId)
        .single();

      if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
      setExamenNom(examen.nom);

      const { data: emData, error: emError } = await supabase
        .from('examens_matieres')
        .select('id, matiere_id, nom, coefficient, bareme, duree, type_epreuve, matieres(nom)')
        .eq('examen_id', examenId);

      if (emError) throw new Error(`Erreur épreuves : ${emError.message}`);

      type Row = {
        id: string; matiere_id: string; nom: string; coefficient: number;
        bareme: number; duree: string | null; type_epreuve: string;
        matieres: { nom: string } | { nom: string }[] | null;
      };
      const liste: Epreuve[] = ((emData ?? []) as unknown as Row[]).map((r) => {
        const m = Array.isArray(r.matieres) ? r.matieres[0] : r.matieres;
        return {
          id: r.id, matiere_id: r.matiere_id, matiere_nom: m?.nom ?? 'Inconnue',
          nom: r.nom, coefficient: r.coefficient, bareme: r.bareme,
          duree: r.duree, type_epreuve: r.type_epreuve,
        };
      });
      liste.sort((a, b) => a.matiere_nom.localeCompare(b.matiere_nom) || a.nom.localeCompare(b.nom));
      setEpreuves(liste);

      const { data: toutesMatieres, error: matError } = await supabase
        .from('matieres')
        .select('id, nom')
        .eq('etablissement_id', examen.etablissement_id);

      if (matError) throw new Error(`Erreur liste matières : ${matError.message}`);
      setMatieresDisponibles((toutesMatieres ?? []).sort((a, b) => a.nom.localeCompare(b.nom)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [examenId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouterEpreuve() {
    if (!matiereChoisie || !nomEpreuve.trim()) {
      setError('Matière et nom de l\'épreuve obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('examens_matieres').insert({
      examen_id: examenId,
      matiere_id: matiereChoisie,
      nom: nomEpreuve.trim(),
      coefficient: parseFloat(coefficient) || 1,
      bareme: parseFloat(bareme) || 20,
      duree: duree.trim() || null,
      type_epreuve: typeEpreuve,
    });

    setSaving(false);

    if (insertError) {
      setError(
        insertError.message.includes('duplicate')
          ? 'Une épreuve avec ce nom existe déjà pour cette matière.'
          : `Erreur ajout : ${insertError.message}`
      );
      return;
    }

    setSucces('Épreuve ajoutée.');
    setNomEpreuve('');
    setCoefficient('1');
    setBareme('20');
    setDuree('');
    setTypeEpreuve('ecrit');
    charger();
  }

  async function retirerEpreuve(id: string) {
    setSaving(true);
    const { error: deleteError } = await supabase.from('examens_matieres').delete().eq('id', id);
    setSaving(false);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    charger();
  }

  // Regrouper les épreuves par matière pour l'affichage
  const parMatiere = epreuves.reduce<Record<string, Epreuve[]>>((acc, e) => {
    if (!acc[e.matiere_nom]) acc[e.matiere_nom] = [];
    acc[e.matiere_nom].push(e);
    return acc;
  }, {});

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-12">
      <h1 className="text-xl font-bold mb-1">Épreuves — {examenNom}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {epreuves.length} épreuve(s) · {pointsTotal} points au total
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {/* Liste groupée par matière */}
      <div className="space-y-3 mb-6">
        {Object.keys(parMatiere).length === 0 && (
          <p className="text-sm text-gray-400">Aucune épreuve configurée pour le moment.</p>
        )}
        {Object.entries(parMatiere).map(([matiereNom, liste]) => (
          <div key={matiereNom} className="border rounded-lg overflow-hidden">
            <p className="bg-gray-100 px-3 py-2 text-sm font-semibold">{matiereNom}</p>
            <table className="w-full text-sm">
              <tbody>
                {liste.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-3 py-2">
                      {e.nom}
                      <span className="text-gray-400 text-xs ml-1">
                        ({TYPES_EPREUVE.find((t) => t.value === e.type_epreuve)?.label})
                      </span>
                    </td>
                    <td className="px-2 py-2 text-gray-500 text-xs whitespace-nowrap">
                      Coef {e.coefficient} · /{e.bareme}{e.duree ? ` · ${e.duree}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => retirerEpreuve(e.id)} className="text-red-600 text-xs">
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Ajouter une épreuve */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-3">Ajouter une épreuve</p>
        <div className="space-y-2">
          <select
            value={matiereChoisie}
            onChange={(e) => setMatiereChoisie(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Choisir une matière</option>
            {matieresDisponibles.map((m) => (
              <option key={m.id} value={m.id}>{m.nom}</option>
            ))}
          </select>

          <input
            type="text"
            value={nomEpreuve}
            onChange={(e) => setNomEpreuve(e.target.value)}
            placeholder="Nom de l'épreuve (ex: Orthographe, Oral, Épreuve unique)"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Coefficient</label>
              <input
                type="number" step="0.5" value={coefficient}
                onChange={(e) => setCoefficient(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Barème (/pts)</label>
              <input
                type="number" step="1" value={bareme}
                onChange={(e) => setBareme(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Durée</label>
              <input
                type="text" value={duree}
                onChange={(e) => setDuree(e.target.value)}
                placeholder="ex: 2h"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Type</label>
              <select
                value={typeEpreuve}
                onChange={(e) => setTypeEpreuve(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                {TYPES_EPREUVE.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={ajouterEpreuve}
            disabled={saving || !matiereChoisie || !nomEpreuve.trim()}
            className="w-full bg-blue-600 text-white text-sm px-3 py-2 rounded-md disabled:opacity-50"
          >
            Ajouter l'épreuve
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Ex: pour le Français au BEPC, ajoute deux épreuves séparées — "Orthographe" (coef 1) et "CF" (coef 2).
        </p>
      </div>
    </main>
  );
          }
    
