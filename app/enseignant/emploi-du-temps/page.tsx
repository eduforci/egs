'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import EnseignantNav from '@/components/enseignant-nav';

type Creneau = {
  id: string;
  jour: string;
  heure_debut: string;
  heure_fin: string;
  salle: string | null;
  classe_id: string | null;
  matiere_id: string | null;
  enseignant_id: string | null;
  classes?: { nom: string } | null;
  matieres?: { nom: string } | null;
};

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_LABEL: Record<string, string> = {
  lundi: 'Lundi',
  mardi: 'Mardi',
  mercredi: 'Mercredi',
  jeudi: 'Jeudi',
  vendredi: 'Vendredi',
  samedi: 'Samedi',
};

export default function EmploiDuTempsEnseignantPage() {
  const supabase = createClient();
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }

      // Classes et matières affectées à l'enseignant : un créneau de l'emploi du temps
      // compte pour lui même si la direction n'a pas indiqué son nom sur le créneau.
      const { data: affectations } = await supabase
        .from('affectations_enseignant')
        .select('classe_id, matiere_id')
        .eq('enseignant_id', uid);

      const paires = new Set(
        (affectations || []).map((a: any) => `${a.classe_id}|${a.matiere_id}`)
      );
      const classeIds = Array.from(
        new Set((affectations || []).map((a: any) => a.classe_id).filter(Boolean))
      ) as string[];

      let requete = supabase
        .from('emploi_du_temps')
        .select(
          'id, jour, heure_debut, heure_fin, salle, classe_id, matiere_id, enseignant_id, classes(nom), matieres(nom)'
        )
        .order('heure_debut');

      requete =
        classeIds.length > 0
          ? requete.or(
              `enseignant_id.eq.${uid},and(enseignant_id.is.null,classe_id.in.(${classeIds.join(',')}))`
            )
          : requete.eq('enseignant_id', uid);

      const { data, error } = await requete;

      if (error) {
        setErreur(error.message);
        setLoading(false);
        return;
      }

      const liste = ((data as any) || []).filter(
        (c: Creneau) =>
          c.enseignant_id === uid || paires.has(`${c.classe_id}|${c.matiere_id}`)
      );
      setCreneaux(liste);
      setLoading(false);
    };
    load();
  }, [supabase]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  const joursAvecCours = JOURS.filter((j) => creneaux.some((c) => c.jour === j));

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <div className="print:hidden">
        <EnseignantNav />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Mon emploi du temps</h1>
        {creneaux.length > 0 && (
          <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden px-3 py-1.5 rounded-lg bg-gray-800 text-white text-sm"
          >
            Imprimer
          </button>
        )}
      </div>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      {creneaux.length === 0 && !erreur && (
        <p className="text-gray-500 text-sm">Aucun cours planifié.</p>
      )}

      {/* Affichage à l'écran : une carte par cours */}
      <div className="space-y-4 print:hidden">
        {joursAvecCours.map((jour) => (
          <div key={jour} className="space-y-2">
            <h2 className="font-semibold text-gray-700">{JOURS_LABEL[jour]}</h2>
            {creneaux
              .filter((c) => c.jour === jour)
              .map((c) => (
                <div key={c.id} className="border rounded-lg p-3 bg-white">
                  <div className="font-medium">
                    {c.heure_debut.slice(0, 5)} - {c.heure_fin.slice(0, 5)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {c.matieres?.nom} — {c.classes?.nom}
                  </div>
                  {c.salle && <div className="text-xs text-gray-500">{c.salle}</div>}
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* Version imprimable : un tableau */}
      {creneaux.length > 0 && (
        <table className="hidden print:table w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-black p-2 text-left">Jour</th>
              <th className="border border-black p-2 text-left">Heures</th>
              <th className="border border-black p-2 text-left">Classe</th>
              <th className="border border-black p-2 text-left">Matière</th>
              <th className="border border-black p-2 text-left">Salle</th>
            </tr>
          </thead>
          <tbody>
            {joursAvecCours.flatMap((jour) =>
              creneaux
                .filter((c) => c.jour === jour)
                .map((c) => (
                  <tr key={c.id}>
                    <td className="border border-black p-2">{JOURS_LABEL[jour]}</td>
                    <td className="border border-black p-2">
                      {c.heure_debut.slice(0, 5)} - {c.heure_fin.slice(0, 5)}
                    </td>
                    <td className="border border-black p-2">{c.classes?.nom}</td>
                    <td className="border border-black p-2">{c.matieres?.nom}</td>
                    <td className="border border-black p-2">{c.salle ?? ''}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
