'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type ClasseExamen = { id: string; classe_id: string; nom: string };
type ClasseDisponible = { id: string; nom: string };
type MatiereExamen = {
  id: string;
  matiere_id: string;
  nom: string;
  composante: string;
  coefficient: number;
};
type MatiereDisponible = { id: string; nom: string };

const COMPOSANTES = [
  { value: 'unique', label: 'Note unique' },
  { value: 'oral', label: 'Oral' },
  { value: 'ecrit', label: 'Écrit' },
];

export default function DetailExamenPage() {
  const params = useParams();
  const examenId = params?.id as string;

  const [examen, setExamen] = useState<any>(null);
  const [classesExamen, setClassesExamen] = useState<ClasseExamen[]>([]);
  const [classesDisponibles, setClassesDisponibles] = useState<ClasseDisponible[]>([]);
  const [matieresExamen, setMatieresExamen] = useState<MatiereExamen[]>([]);
  const [matieresDisponibles, setMatieresDisponibles] = useState<MatiereDisponible[]>([]);
  const [nbCandidats, setNbCandidats] = useState(0);

  const [classeChoisie, setClasseChoisie] = useState('');
  const [matiereChoisie, setMatiereChoisie] = useState('');
  const [composante, setComposante] = useState('unique');
  const [coefficient, setCoefficient] = useState('1');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const supabase = createClient();

  const pointsTotal = matieresExamen.reduce((sum, m) => sum + m.coefficient, 0) * 20;

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

      // Classes participantes
      const { data: ecData, error: ecError } = await supabase
        .from('examens_classes')
        .select('id, classe_id, classes(nom)')
        .eq('examen_id', examenId);

      if (ecError) throw new Error(`Erreur classes examen : ${ecError.message}`);

      type RowC = { id: string; classe_id: string; classes: { nom: string } | { nom: string }[] | null };
      const classesLignes: ClasseExamen[] = ((ecData ?? []) as unknown as RowC[]).map((r) => {
        const c = Array.isArray(r.classes) ? r.classes[0] : r.classes;
        return { id: r.id, classe_id: r.classe_id, nom: c?.nom ?? 'Inconnue' };
      });
      setClassesExamen(classesLignes);

      const { data: toutesClasses, error: toutesClassesError } = await supabase
        .from('classes')
        .select('id, nom')
        .eq('etablissement_id', examenData.etablissement_id);

      if (toutesClassesError) throw new Error(`Erreur liste classes : ${toutesClassesError.message}`);
      const idsClassesUtilisees = new Set(classesLignes.map((c) => c.classe_id));
      setClassesDisponibles((toutesClasses ?? []).filter((c) => !idsClassesUtilisees.has(c.id)));

      // Nombre de candidats
      const classeIds = classesLignes.map((c) => c.classe_id);
      const { count: nbEleves } = await supabase
        .from('eleves')
        .select('id', { count: 'exact', head: true })
        .in('classe_id', classeIds.length > 0 ? classeIds : ['00000000-0000-0000-0000-000000000000']);
      setNbCandidats(nbEleves ?? 0);

      // Matières + composantes de l'examen
      const { data: emData, error: emError } = await supabase
        .from('examens_matieres')
        .select('id, matiere_id, composante, coefficient, matieres(nom)')
        .eq('examen_id', examenId);

      if (emError) throw new Error(`Erreur matières examen : ${emError.message}`);

      type RowM = { id: string; matiere_id: string; composante: string; coefficient: number; matieres: { nom: string } | { nom: string }[] | null };
      const matieresLignes: MatiereExamen[] = ((emData ?? []) as unknown as RowM[]).map((r) => {
        const m = Array.isArray(r.matieres) ? r.matieres[0] : r.matieres;
        return { id: r.id, matiere_id: r.matiere_id, nom: m?.nom ?? 'Inconnue', composante: r.composante, coefficient: r.coefficient };
      });
      matieresLignes.sort((a, b) => a.nom.localeCompare(b.nom));
      setMatieresExamen(matieresLignes);

      const { data: toutesMatieres, error: toutesMatError } = await supabase
        .from('matieres')
        .select('id, nom')
        .eq('etablissement_id', examenData.etablissement_id);

      if (toutesMatError) throw new Error(`Erreur liste matières : ${toutesMatError.message}`);
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

  async function ajouterClasse() {
    if (!classeChoisie) return;
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('examens_classes').insert({
      examen_id: examenId,
      classe_id: classeChoisie,
    });

    setSaving(false);

    if (insertError) {
      setError(`Erreur ajout classe : ${insertError.message}`);
      return;
    }

    setClasseChoisie('');
    charger();
  }

  async function retirerClasse(id: string) {
    setSaving(true);
    const { error: deleteError } = await supabase.from('examens_classes').delete().eq('id', id);
    setSaving(false);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    charger();
  }

  async function ajouterMatiere() {
    if (!matiereChoisie) return;
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('examens_matieres').insert({
      examen_id: examenId,
      matiere_id: matiereChoisie,
      composante,
      coefficient: parseFloat(coefficient) || 1,
    });

    setSaving(false);

    if (insertError) {
      setError(
        insertError.message.includes('duplicate')
          ? 'Cette matière avec cette composante existe déjà pour cet examen.'
          : `Erreur ajout matière : ${insertError.message}`
      );
      return;
    }

    setSucces('Matière ajoutée.');
    setMatiereChoisie('');
    setComposante('unique');
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
        {nbCandidats} candidat(s) · {examen.points_requis} points requis sur {pointsTotal}
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

      {/* Classes participantes */}
      <div className="mb-6">
        <p className="font-semibold text-sm mb-2">Classes participantes</p>
        <div className="border rounded-lg overflow-hidden mb-2">
          {classesExamen.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400">Aucune classe ajoutée.</p>
          ) : (
            classesExamen.map((c) => (
              <div key={c.id} className="flex justify-between items-center px-3 py-2 border-t first:border-t-0 text-sm">
                <span>{c.nom}</span>
                <button onClick={() => retirerClasse(c.id)} className="text-red-600 text-xs">Retirer</button>
              </div>
            ))
          )}
        </div>
        {classesDisponibles.length > 0 && (
          <div className="flex gap-2">
            <select
              value={classeChoisie}
              onChange={(e) => setClasseChoisie(e.target.value)}
              className="flex-1 border rounded-md px-2 py-2 text-sm"
            >
              <option value="">Ajouter une classe...</option>
              {classesDisponibles.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
            <button
              onClick={ajouterClasse}
              disabled={saving || !classeChoisie}
              className="bg-blue-600 text-white text-sm px-3 py-2 rounded-md disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1">
          Pour un BAC, ajoute uniquement les classes de la série concernée (ex: seulement "Terminale D A").
        </p>
      </div>

      {/* Matières et composantes */}
      <div className="mb-4">
        <p className="font-semibold text-sm mb-2">Matières et composantes</p>
        <div className="border rounded-lg overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Matière</th>
                <th className="text-left px-3 py-2">Composante</th>
                <th className="text-left px-3 py-2 w-16">Coef.</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {matieresExamen.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                    Aucune matière ajoutée.
                  </td>
                </tr>
              ) : (
                matieresExamen.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2">{m.nom}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {COMPOSANTES.find((c) => c.value === m.composante)?.label}
                    </td>
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

        <div className="border rounded-lg p-4">
          <p className="text-sm font-medium mb-2">Ajouter une matière</p>
          <div className="space-y-2">
            <select
              value={matiereChoisie}
              onChange={(e) => setMatiereChoisie(e.target.value)}
              className="w-full border rounded-md px-2 py-2 text-sm"
            >
              <option value="">Choisir une matière</option>
              {matieresDisponibles.map((m) => (
                <option key={m.id} value={m.id}>{m.nom}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={composante}
                onChange={(e) => setComposante(e.target.value)}
                className="flex-1 border rounded-md px-2 py-2 text-sm"
              >
                {COMPOSANTES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.5"
                value={coefficient}
                onChange={(e) => setCoefficient(e.target.value)}
                placeholder="Coef"
                className="w-20 border rounded-md px-2 py-2 text-sm text-center"
              />
            </div>
            <button
              onClick={ajouterMatiere}
              disabled={saving || !matiereChoisie}
              className="w-full bg-blue-600 text-white text-sm px-3 py-2 rounded-md disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Ex: Anglais = 2 lignes ("Oral" coef 1 + "Écrit" coef 1). Si une seule note pour la matière,
            utilise "Note unique".
          </p>
        </div>
      </div>
    </main>
  );
            }
    
