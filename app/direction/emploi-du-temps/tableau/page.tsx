'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Ligne = {
  id: string;
  jour: string;
  heure_debut: string;
  heure_fin: string;
  salle: string | null;
  classe_id: string;
  classes?: { nom: string };
  matieres?: { nom: string };
  profiles?: { nom: string; prenom: string };
};

const JOURS_ORDRE: Record<string, number> = {
  lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};
const JOURS_LABEL: Record<string, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer',
  jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam',
};

export default function TableauEmploiDuTempsPage() {
  const supabase = createClient();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [filtreClasse, setFiltreClasse] = useState('');
  const [filtreEnseignant, setFiltreEnseignant] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', userData.user.id)
        .single();

      if (!profil?.etablissement_id) return;

      const { data, error } = await supabase
        .from('emploi_du_temps')
        .select('id, jour, heure_debut, heure_fin, salle, classe_id, classes(nom), matieres(nom), profiles(nom, prenom)')
        .eq('etablissement_id', profil.etablissement_id);

      if (error) {
        setErreur(error.message);
        setLoading(false);
        return;
      }

      const triees = ((data as any) || []).sort((a: Ligne, b: Ligne) => {
        const classeCompare = (a.classes?.nom || '').localeCompare(b.classes?.nom || '');
        if (classeCompare !== 0) return classeCompare;
        const jourCompare = JOURS_ORDRE[a.jour] - JOURS_ORDRE[b.jour];
        if (jourCompare !== 0) return jourCompare;
        return a.heure_debut.localeCompare(b.heure_debut);
      });

      setLignes(triees);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const classesUniques = useMemo(() => {
    const set = new Map<string, string>();
    lignes.forEach((l) => { if (l.classes?.nom) set.set(l.classe_id, l.classes.nom); });
    return Array.from(set.entries());
  }, [lignes]);

  const enseignantsUniques = useMemo(() => {
    const set = new Set<string>();
    lignes.forEach((l) => {
      if (l.profiles) set.add(`${l.profiles.nom} ${l.profiles.prenom}`);
    });
    return Array.from(set);
  }, [lignes]);

  const lignesFiltrees = lignes.filter((l) => {
    if (filtreClasse && l.classe_id !== filtreClasse) return false;
    if (filtreEnseignant && `${l.profiles?.nom} ${l.profiles?.prenom}` !== filtreEnseignant) return false;
    return true;
  });

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Tous les emplois du temps</h1>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          value={filtreClasse}
          onChange={(e) => setFiltreClasse(e.target.value)}
          className="border rounded-lg p-2 text-sm"
        >
          <option value="">Toutes les classes</option>
          {classesUniques.map(([id, nom]) => (
            <option key={id} value={id}>{nom}</option>
          ))}
        </select>

        <select
          value={filtreEnseignant}
          onChange={(e) => setFiltreEnseignant(e.target.value)}
          className="border rounded-lg p-2 text-sm"
        >
          <option value="">Tous les enseignants</option>
          {enseignantsUniques.map((nom) => (
            <option key={nom} value={nom}>{nom}</option>
          ))}
        </select>
      </div>

      {lignesFiltrees.length === 0 && (
        <p className="text-gray-500 text-sm">Aucun créneau trouvé.</p>
      )}

      {lignesFiltrees.length > 0 && (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-2 whitespace-nowrap">Classe</th>
                <th className="text-left p-2 whitespace-nowrap">Jour</th>
                <th className="text-left p-2 whitespace-nowrap">Horaire</th>
                <th className="text-left p-2 whitespace-nowrap">Matière</th>
                <th className="text-left p-2 whitespace-nowrap">Enseignant</th>
                <th className="text-left p-2 whitespace-nowrap">Salle</th>
                <th className="text-left p-2 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {lignesFiltrees.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{l.classes?.nom}</td>
                  <td className="p-2 whitespace-nowrap">{JOURS_LABEL[l.jour]}</td>
                  <td className="p-2 whitespace-nowrap">{l.heure_debut.slice(0, 5)}-{l.heure_fin.slice(0, 5)}</td>
                  <td className="p-2 whitespace-nowrap">{l.matieres?.nom}</td>
                  <td className="p-2 whitespace-nowrap">{l.profiles?.nom} {l.profiles?.prenom}</td>
                  <td className="p-2 whitespace-nowrap">{l.salle || '—'}</td>
                  <td className="p-2 whitespace-nowrap">
                    <Link
                      href={`/direction/emploi-du-temps?classe=${l.classe_id}`}
                      className="text-blue-600 underline"
                    >
                      Modifier
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        {lignesFiltrees.length} créneau(x) affiché(s) sur {lignes.length} au total.
      </p>
    </div>
  );
                               }
