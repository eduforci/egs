'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type ClasseStatut = {
  classe_id: string;
  classe_nom: string;
  nb_matieres: number;
  nb_validees: number;
  pret: boolean;
};

export default function BulletinsAPreparerPage() {
  const supabase = createClient();

  const [trimestre, setTrimestre] = useState(1);
  const [anneeScolaire, setAnneeScolaire] = useState('');
  const [classesStatuts, setClassesStatuts] = useState<ClasseStatut[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur('');

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const { data: profil } = await supabase
      .from('profiles')
      .select('etablissement_id')
      .eq('id', userData.user.id)
      .single();

    if (!profil?.etablissement_id) {
      setLoading(false);
      return;
    }

    const { data: etab } = await supabase
      .from('etablissements')
      .select('annee_scolaire_active')
      .eq('id', profil.etablissement_id)
      .single();
    const annee = etab?.annee_scolaire_active || new Date().getFullYear().toString();
    setAnneeScolaire(annee);

    const { data: classes, error: classesError } = await supabase
      .from('classes')
      .select('id, nom')
      .eq('etablissement_id', profil.etablissement_id)
      .order('nom');

    if (classesError) {
      setErreur(classesError.message);
      setLoading(false);
      return;
    }

    const { data: classesMatieres } = await supabase
      .from('classes_matieres')
      .select('classe_id, matiere_id');

    const { data: validations } = await supabase
      .from('validations_notes')
      .select('classe_id, matiere_id, valide')
      .eq('annee_scolaire', annee)
      .eq('trimestre', trimestre)
      .eq('valide', true);

    const validationsSet = new Set(
      (validations || []).map((v) => `${v.classe_id}__${v.matiere_id}`)
    );

    const statuts: ClasseStatut[] = (classes || []).map((c) => {
      const matieresClasse = (classesMatieres || []).filter((cm) => cm.classe_id === c.id);
      const nbMatieres = matieresClasse.length;
      const nbValidees = matieresClasse.filter((cm) =>
        validationsSet.has(`${c.id}__${cm.matiere_id}`)
      ).length;

      return {
        classe_id: c.id,
        classe_nom: c.nom,
        nb_matieres: nbMatieres,
        nb_validees: nbValidees,
        pret: nbMatieres > 0 && nbValidees === nbMatieres,
      };
    });

    setClassesStatuts(statuts);
    setLoading(false);
  }, [supabase, trimestre]);

  useEffect(() => {
    charger();
  }, [charger]);

  const nbPretes = classesStatuts.filter((c) => c.pret).length;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Bulletins à préparer</h1>

      <div>
        <label className="block text-sm font-medium mb-1">Trimestre</label>
        <select
          value={trimestre}
          onChange={(e) => setTrimestre(parseInt(e.target.value))}
          className="w-full border rounded-lg p-2"
        >
          <option value={1}>Trimestre 1</option>
          <option value={2}>Trimestre 2</option>
          <option value={3}>Trimestre 3</option>
        </select>
      </div>

      {anneeScolaire && (
        <p className="text-sm text-gray-500">
          {nbPretes} classe(s) prête(s) sur {classesStatuts.length} — Année {anneeScolaire}
        </p>
      )}

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Chargement...</p>}

      {!loading && classesStatuts.length === 0 && (
        <p className="text-gray-500 text-sm">Aucune classe trouvée.</p>
      )}

      {!loading && classesStatuts.length > 0 && (
        <div className="space-y-2">
          {classesStatuts.map((c) => (
            <div key={c.classe_id} className="border rounded-lg p-3 flex justify-between items-center">
              <div>
                <div className="font-medium">{c.classe_nom}</div>
                <div className="text-xs text-gray-500">
                  {c.nb_validees}/{c.nb_matieres} matière(s) validée(s)
                </div>
              </div>
              <div className="flex items-center gap-3">
                {c.pret ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                    ✅ Prêt
                  </span>
                ) : (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
                    En attente
                  </span>
                )}
                <Link href="/chef/bulletins" className="text-blue-600 text-sm">
                  Voir bulletins →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
      }
