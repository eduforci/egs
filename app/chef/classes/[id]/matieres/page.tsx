'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type MatiereAttachee = {
  id: string; // id de la ligne classes_matieres
  matiere_id: string;
  nom: string;
  coefficient: number;
  groupe_bilan: string | null;
};

type MatiereDisponible = {
  id: string;
  nom: string;
};

const GROUPES = ['Lettres', 'Sciences', 'Aucun'];

export default function GestionMatieresPage() {
  const params = useParams();
  const classeId = params?.id as string;

  const [classeNom, setClasseNom] = useState('');
  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [matieresAttachees, setMatieresAttachees] = useState<MatiereAttachee[]>([]);
  const [matieresDisponibles, setMatieresDisponibles] = useState<MatiereDisponible[]>([]);

  const [nouvelleMatiereExistante, setNouvelleMatiereExistante] = useState('');
  const [nouvelleMatiereNom, setNouvelleMatiereNom] = useState('');
  const [nouveauCoefficient, setNouveauCoefficient] = useState('1');
  const [nouveauGroupe, setNouveauGroupe] = useState('Aucun');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const supabase = createClient();

  const charger = useCallback(async () => {
    if (!classeId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: classeData, error: classeError } = await supabase
        .from('classes')
        .select('nom, etablissement_id')
        .eq('id', classeId)
        .single();

      if (classeError) throw new Error(`Erreur classe : ${classeError.message}`);
      setClasseNom(classeData.nom);
      setEtablissementId(classeData.etablissement_id);

      const { data: attacheesData, error: attacheesError } = await supabase
        .from('classes_matieres')
        .select('id, matiere_id, coefficient, matieres(nom, groupe_bilan)')
        .eq('classe_id', classeId);

      if (attacheesError) throw new Error(`Erreur matières : ${attacheesError.message}`);

      type Row = {
        id: string;
        matiere_id: string;
        coefficient: number;
        matieres: { nom: string; groupe_bilan: string | null } | { nom: string; groupe_bilan: string | null }[] | null;
      };
      const lignes: MatiereAttachee[] = ((attacheesData ?? []) as unknown as Row[]).map((r) => {
        const m = Array.isArray(r.matieres) ? r.matieres[0] : r.matieres;
        return {
          id: r.id,
          matiere_id: r.matiere_id,
          nom: m?.nom ?? 'Inconnue',
          coefficient: r.coefficient,
          groupe_bilan: m?.groupe_bilan ?? null,
        };
      });
      lignes.sort((a, b) => a.nom.localeCompare(b.nom));
      setMatieresAttachees(lignes);

      const { data: toutesMatieres, error: toutesError } = await supabase
        .from('matieres')
        .select('id, nom')
        .eq('etablissement_id', classeData.etablissement_id);

      if (toutesError) throw new Error(`Erreur liste matières : ${toutesError.message}`);

      const idsAttachees = new Set(lignes.map((l) => l.matiere_id));
      const disponibles = (toutesMatieres ?? []).filter((m) => !idsAttachees.has(m.id));
      disponibles.sort((a, b) => a.nom.localeCompare(b.nom));
      setMatieresDisponibles(disponibles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [classeId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function attacherMatiereExistante() {
    if (!nouvelleMatiereExistante) return;
    setSaving(true);
    setError(null);
    setSucces(null);

    const { error: insertError } = await supabase.from('classes_matieres').insert({
      classe_id: classeId,
      matiere_id: nouvelleMatiereExistante,
      coefficient: parseFloat(nouveauCoefficient) || 1,
    });

    setSaving(false);

    if (insertError) {
      setError(`Erreur ajout : ${insertError.message}`);
      return;
    }

    setSucces('Matière ajoutée à la classe.');
    setNouvelleMatiereExistante('');
    setNouveauCoefficient('1');
    charger();
  }

  async function creerEtAttacherNouvelleMatiere() {
    if (!nouvelleMatiereNom.trim() || !etablissementId) return;
    setSaving(true);
    setError(null);
    setSucces(null);

    const groupeFinal = nouveauGroupe === 'Aucun' ? null : nouveauGroupe;

    const { data: matiereCreee, error: creationError } = await supabase
      .from('matieres')
      .insert({
        etablissement_id: etablissementId,
        nom: nouvelleMatiereNom.trim(),
        coefficient_defaut: parseFloat(nouveauCoefficient) || 1,
        groupe_bilan: groupeFinal,
      })
      .select('id')
      .single();

    if (creationError || !matiereCreee) {
      setSaving(false);
      setError(`Erreur création matière : ${creationError?.message}`);
      return;
    }

    const { error: attacheError } = await supabase.from('classes_matieres').insert({
      classe_id: classeId,
      matiere_id: matiereCreee.id,
      coefficient: parseFloat(nouveauCoefficient) || 1,
    });

    setSaving(false);

    if (attacheError) {
      setError(`Matière créée mais non attachée : ${attacheError.message}`);
      return;
    }

    setSucces(`Matière "${nouvelleMatiereNom}" créée et ajoutée à la classe.`);
    setNouvelleMatiereNom('');
    setNouveauCoefficient('1');
    setNouveauGroupe('Aucun');
    charger();
  }

  async function modifierCoefficient(id: string, coefficient: number) {
    setMatieresAttachees((prev) =>
      prev.map((m) => (m.id === id ? { ...m, coefficient } : m))
    );
  }

  async function enregistrerCoefficient(id: string, coefficient: number) {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('classes_matieres')
      .update({ coefficient })
      .eq('id', id);
    setSaving(false);
    if (updateError) {
      setError(`Erreur mise à jour coefficient : ${updateError.message}`);
    } else {
      setSucces('Coefficient mis à jour.');
    }
  }

  async function retirerMatiere(id: string, nom: string) {
    const confirmation = window.confirm(
      `Retirer "${nom}" de cette classe ? Les notes déjà saisies pour cette matière resteront en base mais ne seront plus prises en compte dans le bulletin.`
    );
    if (!confirmation) return;

    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from('classes_matieres')
      .delete()
      .eq('id', id);
    setSaving(false);

    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    setSucces(`"${nom}" retirée de la classe.`);
    charger();
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Matières — {classeNom}</h1>
      <p className="text-sm text-gray-500 mb-4">
        Ajoute, retire ou ajuste les coefficients des matières enseignées dans cette classe.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          <strong>Erreur :</strong> {error}
        </div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">
          {succes}
        </div>
      )}

      {/* Liste des matières actuelles */}
      <div className="border rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Matière</th>
              <th className="text-left px-3 py-2">Groupe</th>
              <th className="text-left px-3 py-2 w-20">Coef.</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {matieresAttachees.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-2">{m.nom}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{m.groupe_bilan ?? '-'}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={m.coefficient}
                    onChange={(e) => modifierCoefficient(m.id, parseFloat(e.target.value) || 0)}
                    onBlur={(e) => enregistrerCoefficient(m.id, parseFloat(e.target.value) || 0)}
                    className="w-14 border rounded px-1 py-0.5 text-center"
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => retirerMatiere(m.id, m.nom)}
                    className="text-red-600 text-xs"
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ajouter une matière existante */}
      {matieresDisponibles.length > 0 && (
        <div className="border rounded-lg p-4 mb-4">
          <p className="font-semibold text-sm mb-2">Ajouter une matière déjà existante</p>
          <div className="flex gap-2 flex-wrap items-end">
            <select
              value={nouvelleMatiereExistante}
              onChange={(e) => setNouvelleMatiereExistante(e.target.value)}
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
              min="0"
              value={nouveauCoefficient}
              onChange={(e) => setNouveauCoefficient(e.target.value)}
              className="w-16 border rounded-md px-2 py-2 text-sm text-center"
              placeholder="Coef"
            />
            <button
              onClick={attacherMatiereExistante}
              disabled={saving || !nouvelleMatiereExistante}
              className="bg-blue-600 text-white text-sm px-3 py-2 rounded-md disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
        </div>
      )}

      {/* Créer une toute nouvelle matière */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-2">Créer une nouvelle matière</p>
        <div className="space-y-2">
          <input
            type="text"
            value={nouvelleMatiereNom}
            onChange={(e) => setNouvelleMatiereNom(e.target.value)}
            placeholder="Nom de la matière (ex: Chinois)"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={nouveauGroupe}
              onChange={(e) => setNouveauGroupe(e.target.value)}
              className="border rounded-md px-2 py-2 text-sm flex-1"
            >
              {GROUPES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.5"
              min="0"
              value={nouveauCoefficient}
              onChange={(e) => setNouveauCoefficient(e.target.value)}
              className="w-16 border rounded-md px-2 py-2 text-sm text-center"
              placeholder="Coef"
            />
          </div>
          <button
            onClick={creerEtAttacherNouvelleMatiere}
            disabled={saving || !nouvelleMatiereNom.trim()}
            className="w-full bg-black text-white text-sm px-3 py-2 rounded-md disabled:opacity-50"
          >
            Créer et ajouter à la classe
          </button>
        </div>
      </div>
    </main>
  );
                  }
                                
