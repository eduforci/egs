'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type StatPersonne = {
  profile_id: string;
  nom: string;
  prenom: string;
  role: string;
  nb_jours_presents: number;
  nb_retards: number;
  nb_departs_anticipes: number;
  taux_ponctualite: number;
};

const ROLE_LABEL: Record<string, string> = {
  enseignant: 'Enseignant',
  educateur: 'Éducateur',
  chef: 'Chef',
  directeur_etudes: 'Directeur des études',
  secretaire: 'Secrétaire',
  comptable: 'Comptable',
  caissier: 'Caissier',
};

function moisEnCours() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function RapportsPointagePage() {
  const supabase = createClient();

  const [mois, setMois] = useState(moisEnCours());
  const [stats, setStats] = useState<StatPersonne[]>([]);
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

    const [annee, moisNum] = mois.split('-').map(Number);
    const premierJour = `${mois}-01`;
    const dernierJourDate = new Date(annee, moisNum, 0).getDate();
    const dernierJour = `${mois}-${String(dernierJourDate).padStart(2, '0')}`;

    const { data: pointagesData, error } = await supabase
      .from('pointages')
      .select('profile_id, date_pointage, type_evenement, statut')
      .eq('etablissement_id', profil.etablissement_id)
      .gte('date_pointage', premierJour)
      .lte('date_pointage', dernierJour);

    if (error) {
      setErreur(error.message);
      setLoading(false);
      return;
    }

    const idsProfils = Array.from(new Set((pointagesData || []).map((p) => p.profile_id)));
    const { data: profs } = idsProfils.length > 0
      ? await supabase.from('profiles').select('id, nom, prenom, role').in('id', idsProfils)
      : { data: [] };
    const profsParId = new Map((profs || []).map((p) => [p.id, p]));

    const grouped = new Map<string, {
      jours: Set<string>;
      retards: number;
      departsAnticipes: number;
      arrivees: number;
    }>();

    (pointagesData || []).forEach((p) => {
      if (!grouped.has(p.profile_id)) {
        grouped.set(p.profile_id, { jours: new Set(), retards: 0, departsAnticipes: 0, arrivees: 0 });
      }
      const g = grouped.get(p.profile_id)!;
      if (p.type_evenement === 'entree') {
        g.jours.add(p.date_pointage);
        g.arrivees++;
        if (p.statut === 'retard') g.retards++;
      }
      if (p.type_evenement === 'sortie' && p.statut === 'depart_anticipe') {
        g.departsAnticipes++;
      }
    });

    const liste: StatPersonne[] = Array.from(grouped.entries()).map(([profileId, g]) => {
      const prof = profsParId.get(profileId);
      const tauxPonctualite = g.arrivees > 0
        ? Math.round(((g.arrivees - g.retards) / g.arrivees) * 100)
        : 0;
      return {
        profile_id: profileId,
        nom: prof?.nom || '',
        prenom: prof?.prenom || '',
        role: prof?.role || '',
        nb_jours_presents: g.jours.size,
        nb_retards: g.retards,
        nb_departs_anticipes: g.departsAnticipes,
        taux_ponctualite: tauxPonctualite,
      };
    }).sort((a, b) => a.taux_ponctualite - b.taux_ponctualite);

    setStats(liste);
    setLoading(false);
  }, [supabase, mois]);

  useEffect(() => {
    charger();
  }, [charger]);

  const moyenneGenerale = stats.length > 0
    ? Math.round(stats.reduce((s, p) => s + p.taux_ponctualite, 0) / stats.length)
    : 0;

  const totalRetards = stats.reduce((s, p) => s + p.nb_retards, 0);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Rapport de ponctualité</h1>

      <div>
        <label className="block text-sm font-medium mb-1">Mois</label>
        <input
          type="month"
          value={mois}
          onChange={(e) => setMois(e.target.value)}
          className="w-full border rounded-lg p-2"
        />
      </div>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Chargement...</p>}

      {!loading && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{stats.length}</div>
              <div className="text-xs text-gray-500">Personnes actives</div>
            </div>
            <div className="border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{moyenneGenerale}%</div>
              <div className="text-xs text-gray-500">Ponctualité moy.</div>
            </div>
            <div className="border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{totalRetards}</div>
              <div className="text-xs text-gray-500">Retards cumulés</div>
            </div>
          </div>

          {stats.length === 0 && (
            <p className="text-gray-500 text-sm">Aucun pointage pour ce mois.</p>
          )}

          <div className="space-y-2">
            {stats.map((p) => (
              <div key={p.profile_id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium">{p.nom} {p.prenom}</div>
                    <div className="text-xs text-gray-500">{ROLE_LABEL[p.role] || p.role}</div>
                  </div>
                  <span className={`text-sm font-bold ${
                    p.taux_ponctualite >= 90 ? 'text-green-700' :
                    p.taux_ponctualite >= 70 ? 'text-orange-600' : 'text-red-700'
                  }`}>
                    {p.taux_ponctualite}%
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-gray-600 mt-2">
                  <span>{p.nb_jours_presents} jour(s) présent(s)</span>
                  <span>•</span>
                  <span>{p.nb_retards} retard(s)</span>
                  <span>•</span>
                  <span>{p.nb_departs_anticipes} départ(s) anticipé(s)</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
      }
