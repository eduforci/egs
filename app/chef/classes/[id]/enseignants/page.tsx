'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type LigneMatiere = {
  matiere_id: string;
  matiere_nom: string;
  affectation_id: string | null;
  enseignant_id: string | null;
};

type EnseignantOption = {
  id: string;
  nom: string;
  prenom: string;
  specialite: string | null;
  role: 'enseignant' | 'educateur';
};

export default function AffectationsEnseignantsPage() {
  const params = useParams();
  const classeId = params?.id as string;

  const [classeNom, setClasseNom] = useState('');
  const [lignes, setLignes] = useState<LigneMatiere[]>([]);
  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
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

      const { data: matieresClasse, error: matieresError } = await supabase
        .from('classes_matieres')
        .select('matiere_id, matieres(nom)')
        .eq('classe_id', classeId);

      if (matieresError) throw new Error(`Erreur matières : ${matieresError.message}`);

      type Row = { matiere_id: string; matieres: { nom: string } | { nom: string }[] | null };
      const matieres = ((matieresClasse ?? []) as unknown as Row[]).map((r) => {
        const m = Array.isArray(r.matieres) ? r.matieres[0] : r.matieres;
        return { matiere_id: r.matiere_id, matiere_nom: m?.nom ?? 'Inconnue' };
      });
      matieres.sort((a, b) => a.matiere_nom.localeCompare(b.matiere_nom));

      const { data: affectationsData, error: affectationsError } = await supabase
        .from('affectations_enseignant')
        .select('id, matiere_id, enseignant_id')
        .eq('classe_id', classeId);

      if (affectationsError) throw new Error(`Erreur affectations : ${affectationsError.message}`);

      const affectationsMap = new Map(
        (affectationsData ?? []).map((a) => [a.matiere_id, a])
      );

      setLignes(
        matieres.map((m) => {
          const aff = affectationsMap.get(m.matiere_id);
          return {
            matiere_id: m.matiere_id,
            matiere_nom: m.matiere_nom,
            affectation_id: aff?.id ?? null,
            enseignant_id: aff?.enseignant_id ?? null,
          };
        })
      );

      const { data: personnelProfiles, error: personnelError } = await supabase
        .from('profiles')
        .select('id, nom, prenom, role')
        .eq('etablissement_id', classeData.etablissement_id)
        .in('role', ['enseignant', 'educateur']);

      if (personnelError) throw new Error(`Erreur enseignants : ${personnelError.message}`);

      const idsPersonnel = (personnelProfiles ?? []).map((p) => p.id);
      const { data: specialitesData } =
        idsPersonnel.length > 0
          ? await supabase.from('enseignants').select('id, specialite').in('id', idsPersonnel)
          : { data: [] as { id: string; specialite: string | null }[] };

      const specialiteMap = new Map((specialitesData ?? []).map((s) => [s.id, s.specialite]));

      const optionsPersonnel: EnseignantOption[] = (personnelProfiles ?? []).map((p) => ({
        id: p.id,
        nom: p.nom,
        prenom: p.prenom,
        specialite: specialiteMap.get(p.id) ?? null,
        role: p.role as 'enseignant' | 'educateur',
      }));
      optionsPersonnel.sort((a, b) => a.nom.localeCompare(b.nom));
      setEnseignants(optionsPersonnel);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [classeId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  // "Conduite" est réservée aux comptes Éducateur ; toutes les autres matières
  // sont réservées aux comptes Enseignant. Un mélange fausse les moyennes du
  // bulletin (l'éducateur n'a pas de moyennes/coefficients calculés comme un prof).
  function optionsPourMatiere(matiereNom: string): EnseignantOption[] {
    const roleAttendu = matiereNom.trim().toLowerCase() === 'conduite' ? 'educateur' : 'enseignant';
    return enseignants.filter((ens) => ens.role === roleAttendu);
  }

  async function affecterEnseignant(matiereId: string, enseignantId: string) {
    setSaving(matiereId);
    setError(null);
    setSucces(null);

    const ligne = lignes.find((l) => l.matiere_id === matiereId);

    try {
      if (!enseignantId) {
        if (ligne?.affectation_id) {
          const { error: deleteError } = await supabase
            .from('affectations_enseignant')
            .delete()
            .eq('id', ligne.affectation_id);
          if (deleteError) throw new Error(deleteError.message);
        }
      } else if (ligne?.affectation_id) {
        const { error: updateError } = await supabase
          .from('affectations_enseignant')
          .update({ enseignant_id: enseignantId })
          .eq('id', ligne.affectation_id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await supabase.from('affectations_enseignant').insert({
          enseignant_id: enseignantId,
          matiere_id: matiereId,
          classe_id: classeId,
        });
        if (insertError) throw new Error(insertError.message);
      }

      setSucces('Affectation enregistrée.');
      charger();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Enseignants — {classeNom}</h1>
      <p className="text-sm text-gray-500 mb-4">
        Affecte un enseignant à chaque matière (la Conduite est réservée aux comptes Éducateur).
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

      {lignes.length === 0 ? (
        <p className="text-sm text-gray-500">
          Aucune matière rattachée à cette classe. Ajoute d'abord des matières depuis la page{' '}
          <span className="font-medium">Matières</span>.
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Matière</th>
                <th className="text-left px-3 py-2">Enseignant</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const options = optionsPourMatiere(l.matiere_nom);
                const estConduite = l.matiere_nom.trim().toLowerCase() === 'conduite';
                return (
                  <tr key={l.matiere_id} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {l.matiere_nom}
                      {estConduite && (
                        <span className="block text-[10px] text-neutral-400 font-normal">
                          Réservé aux éducateurs
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={l.enseignant_id ?? ''}
                        onChange={(e) => affecterEnseignant(l.matiere_id, e.target.value)}
                        disabled={saving === l.matiere_id}
                        className="w-full border rounded-md px-2 py-1.5 text-sm"
                      >
                        <option value="">Non affecté</option>
                        {options.map((ens) => (
                          <option key={ens.id} value={ens.id}>
                            {ens.nom} {ens.prenom}
                            {ens.specialite ? ` — ${ens.specialite}` : ''}
                          </option>
                        ))}
                      </select>
                      {options.length === 0 && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          {estConduite
                            ? "Aucun compte Éducateur trouvé pour cet établissement."
                            : "Aucun compte Enseignant trouvé pour cet établissement."}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
          }
