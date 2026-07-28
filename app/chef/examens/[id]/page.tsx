'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type MatiereExamen = {
  id: string;
  matiere_id: string;
  nom: string;
  coefficient: number;
};

type MatiereDisponible = { id: string; nom: string };

export default function DetailExamenPage() {
  const params = useParams();
  const examenId = params?.id as string;

  const [examen, setExamen] = useState<any>(null);
  const [matieresExamen, setMatieresExamen] = useState<MatiereExamen[]>([]);
  const [matieresDisponibles, setMatieresDisponibles] = useState<MatiereDisponible[]>([]);
  const [nbCandidats, setNbCandidats] = useState(0);

  const [matiereChoisie, setMatiereChoisie] = useState('');
  const [coefficient, setCoefficient] = useState('1');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const supabase = createClient();

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: examenData, error: examenError } = await supabase
        .from('examens')
        .select('*')
        .eq('id', examenId)
        .single();

      if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
      setExamen(examenData);

      const { count } = await supabase
        .from('classes')
        .select('eleves(id)', { count: 'exact', head: true })
        .eq('etablissement_id', examenData.etablissement_id)
        .eq('niveau', examenData.niveau);

      const { data: classesNiveau } = await supabase
        .from('classes')
        .select('id')
        .eq('etablissement_id', examenData.etablissement_id)
        .eq('niveau', examenData.niveau);

      const classeIds = (classesNiveau ?? []).map((c) => c.id);
      const { count: nbEleves } = await supabase
        .from('eleves')
        .select('id', { count: 'exact', head: true })
        .in('classe_id', classeIds.length > 0 ? classeIds : ['00000000-0000-0000-0000-000000000000']);

      setNbCandidats(nbEleves ?? 0);

      const { data: emData, error: emError } = await supabase
        .from('examens_matieres')
        .select('id, matiere_id, coefficient, matieres(nom)')
        .eq('examen_id', examenId);

      if (emError) throw new Error(`Erreur matières examen : ${emError.message}`);

      type Row = { id: string; matiere_id: string; coefficient: number; matieres: { nom: string } | { nom: string }[] | null };
      const lignes: MatiereExamen[] = ((emData ?? []) as unknown as Row[]).map((r) => {
        const m = Array.isArray(r.matieres) ? r.matieres[0] : r.matieres;
        return { id: r.id, matiere_id: r.matiere_id, nom: m?.nom ?? 'Inconnue', coefficient: r.coefficient };
      });
      lignes.sort((a, b) => a.nom.localeCompare(b.nom));
      setMatieresExamen(lignes);

      const { data: toutesMatieres, error: toutesError } = await supabase
        .from('matieres')
        .select('id, nom')
        .eq('etablissement_id', examenData.etablissement_id);

      if (toutesError) throw new Error(`Erreur liste matières : ${toutesError.message}`);

      const idsUtilises = new Set(lignes.map((l) => l.matiere_id));
      const dispo = (toutesMatieres ?? []).filter((m) => !idsUtilises.has(m.id));
      dispo.sort((a, b) => a.nom.localeCompare(b.nom));
      setMatieresDisponibles(dispo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [examenId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouterMatiere() {
    if (!matiereChoisie) return;
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('examens_matieres').insert({
      examen_id: examenId,
      matiere_id: matiereChoisie,
      coefficient: parseFloat(coefficient) || 1,
    });

    setSaving(false);

    if (insertError) {
      setError(`Erreur ajout : ${insertError.message}`);
      return;
    }

    setSucces('Matière ajoutée.');
    setMatiereChoisie('');
    setCoefficient('1');
    charger();
  }

  async function retirerMatiere(id: string) {
    setSaving(true);
    const { error: deleteError } = await supabase.from('examens_matieres').delete().eq('id', id);
    setSaving(false);

    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    charger();
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;
  if (!examen) return <p className="p-6 text-sm text-red-600">Examen introuvable.</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">{examen.nom}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {examen.niveau} · {nbCandidats} candidat(s) · Seuil {examen.moyenne_admission}/20
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          {error}
        </div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">
          {succes}
        </div>
      )}

      {/* Liens vers saisie et résultats */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <Link
          href={`/chef/examens/${examenId}/notes`}
          className="border rounded-lg p-3 text-center text-sm font-medium hover:bg-gray-50"
        >
          Saisir les notes
        </Link>
        <Link
          href={`/chef/examens/${examenId}/resultats`}
          className="border rounded-lg p-3 text-center text-sm font-medium hover:bg-gray-50"
        >
          Voir les résultats
        </Link>
      </div>

      {/* Matières de l'examen */}
      <div className="border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Matière</th>
              <th className="text-left px-3 py-2 w-20">Coef.</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {matieresExamen.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-gray-400">
                  Aucune matière ajoutée à cet examen.
                </td>
              </tr>
            ) : (
              matieresExamen.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2">{m.nom}</td>
                  <td className="px-3 py-2">{m.coefficient}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => retirerMatiere(m.id)} className="text-red-600 text-xs">
                      Retirer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Ajouter une matière */}
      {matieresDisponibles.length > 0 && (
        <div className="border rounded-lg p-4">
          <p className="font-semibold text-sm mb-2">Ajouter une matière à l'examen</p>
          <div className="flex gap-2 flex-wrap items-end">
            <select
              value={matiereChoisie}
              onChange={(e) => setMatiereChoisie(e.target.value)}
              className="border rounded-md px-2 py-2 text-sm flex-1 min-w-[140px]"
            >
              <option value="">Choisir une matière</option>
              {matieresDisponibles.map((m) => (
                <option key={m.id} value={m.id}>{m.nom}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.5"
              value={coefficient}
              onChange={(e) => setCoefficient(e.target.value)}
              className="w-16 border rounded-md px-2 py-2 text-sm text-center"
            />
            <button
              onClick={ajouterMatiere}
              disabled={saving || !matiereChoisie}
              className="bg-blue-600 text-white text-sm px-3 py-2 rounded-md disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
        </div>
      )}
    </main>
  );
            }
        
