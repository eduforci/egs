'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type PointageLigne = {
  id: string;
  profile_id: string;
  nom: string;
  prenom: string;
  role: string;
  type_evenement: string;
  heure_pointage: string;
  periode_libelle: string;
  statut: string;
  appareil_nom: string;
};

type PersonneSansPointage = {
  id: string;
  nom: string;
  prenom: string;
  role: string;
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

const STATUT_STYLE: Record<string, { label: string; classe: string }> = {
  a_l_heure: { label: 'À l\'heure', classe: 'bg-green-100 text-green-700' },
  retard: { label: 'Retard', classe: 'bg-red-100 text-red-700' },
  depart_normal: { label: 'Départ normal', classe: 'bg-green-100 text-green-700' },
  depart_anticipe: { label: 'Départ anticipé', classe: 'bg-orange-100 text-orange-700' },
  enregistre: { label: 'Enregistré', classe: 'bg-gray-100 text-gray-700' },
};

export default function SuiviPointagePage() {
  const supabase = createClient();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pointages, setPointages] = useState<PointageLigne[]>([]);
  const [personnesSansPointage, setPersonnesSansPointage] = useState<PersonneSansPointage[]>([]);
  const [filtreRole, setFiltreRole] = useState('');
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

    const { data: pointagesData, error } = await supabase
      .from('pointages')
      .select('id, profile_id, type_evenement, heure_pointage, statut, periode_id, device_id')
      .eq('etablissement_id', profil.etablissement_id)
      .eq('date_pointage', date)
      .order('heure_pointage', { ascending: false });

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

    const idsPeriodes = Array.from(new Set((pointagesData || []).map((p) => p.periode_id).filter(Boolean)));
    const { data: periodesData } = idsPeriodes.length > 0
      ? await supabase.from('pointage_periodes').select('id, libelle').in('id', idsPeriodes)
      : { data: [] };
    const periodesParId = new Map((periodesData || []).map((p) => [p.id, p]));

    const idsDevices = Array.from(new Set((pointagesData || []).map((p) => p.device_id).filter(Boolean)));
    const { data: devicesData } = idsDevices.length > 0
      ? await supabase.from('pointage_devices').select('id, nom').in('id', idsDevices)
      : { data: [] };
    const devicesParId = new Map((devicesData || []).map((d) => [d.id, d]));

    const liste: PointageLigne[] = (pointagesData || []).map((p: any) => {
      const prof = profsParId.get(p.profile_id);
      const periode = periodesParId.get(p.periode_id);
      const device = devicesParId.get(p.device_id);
      return {
        id: p.id,
        profile_id: p.profile_id,
        nom: prof?.nom || '',
        prenom: prof?.prenom || '',
        role: prof?.role || '',
        type_evenement: p.type_evenement,
        heure_pointage: p.heure_pointage,
        periode_libelle: periode?.libelle || '',
        statut: p.statut,
        appareil_nom: device?.nom || '',
      };
    });

    setPointages(liste);

    // Personnel soumis au pointage mais n'ayant pas encore badgé aujourd'hui
    const { data: config } = await supabase
      .from('pointage_configurations')
      .select('pointage_enseignants, pointage_educateurs, pointage_direction, pointage_administration')
      .eq('etablissement_id', profil.etablissement_id)
      .maybeSingle();

    const rolesAttendus: string[] = [];
    if (config?.pointage_enseignants) rolesAttendus.push('enseignant');
    if (config?.pointage_educateurs) rolesAttendus.push('educateur');
    if (config?.pointage_direction) rolesAttendus.push('chef', 'directeur_etudes');
    if (config?.pointage_administration) rolesAttendus.push('secretaire', 'comptable', 'caissier');

    if (rolesAttendus.length > 0) {
      const { data: tousLePersonnel } = await supabase
        .from('profiles')
        .select('id, nom, prenom, role')
        .eq('etablissement_id', profil.etablissement_id)
        .in('role', rolesAttendus);

      const idsAvecPointage = new Set((pointagesData || []).map((p) => p.profile_id));
      const sansPointage = (tousLePersonnel || []).filter((p) => !idsAvecPointage.has(p.id));
      setPersonnesSansPointage(sansPointage);
    }

    setLoading(false);
  }, [supabase, date]);

  useEffect(() => {
    charger();
  }, [charger]);

  const pointagesFiltres = filtreRole
    ? pointages.filter((p) => p.role === filtreRole)
    : pointages;

  const personnesSansPointageFiltrees = filtreRole
    ? personnesSansPointage.filter((p) => p.role === filtreRole)
    : personnesSansPointage;

  const rolesDisponibles = Array.from(new Set(pointages.map((p) => p.role)));

  const nbArrivees = pointages.filter((p) => p.type_evenement === 'entree').length;
  const nbRetards = pointages.filter((p) => p.statut === 'retard').length;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Suivi des pointages</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Rôle</label>
          <select
            value={filtreRole}
            onChange={(e) => setFiltreRole(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="">Tous les rôles</option>
            {rolesDisponibles.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="border rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{nbArrivees}</div>
          <div className="text-xs text-gray-500">Arrivées</div>
        </div>
        <div className="border rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{nbRetards}</div>
          <div className="text-xs text-gray-500">Retards</div>
        </div>
        <div className="border rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{personnesSansPointage.length}</div>
          <div className="text-xs text-gray-500">Pas encore badgé</div>
        </div>
      </div>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Chargement...</p>}

      {!loading && (
        <>
          {personnesSansPointageFiltrees.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold text-gray-700 text-sm">N'ont pas encore badgé</h2>
              {personnesSansPointageFiltrees.map((p) => (
                <div key={p.id} className="border rounded-lg p-3 flex justify-between items-center bg-gray-50">
                  <div>
                    <div className="text-sm font-medium">{p.nom} {p.prenom}</div>
                    <div className="text-xs text-gray-500">{ROLE_LABEL[p.role] || p.role}</div>
                  </div>
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                    Absent du pointage
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h2 className="font-semibold text-gray-700 text-sm">Pointages enregistrés</h2>
            {pointagesFiltres.length === 0 && (
              <p className="text-gray-500 text-sm">Aucun pointage pour cette date.</p>
            )}
            {pointagesFiltres.map((p) => {
              const style = STATUT_STYLE[p.statut] || { label: p.statut, classe: 'bg-gray-100 text-gray-700' };
              return (
                <div key={p.id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-medium">{p.nom} {p.prenom}</div>
                      <div className="text-xs text-gray-500">{ROLE_LABEL[p.role] || p.role}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${style.classe}`}>
                      {style.label}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {p.type_evenement === 'entree' ? '🟢 Arrivée' : '🔴 Départ'} à {p.heure_pointage.slice(0, 5)}
                    {p.periode_libelle && ` — ${p.periode_libelle}`}
                  </div>
                  {p.appareil_nom && (
                    <div className="text-xs text-gray-400 mt-1">Via {p.appareil_nom}</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
                                                         }
