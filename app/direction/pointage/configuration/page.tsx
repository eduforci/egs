'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Configuration = {
  id: string | null;
  pointage_actif: boolean;
  pointage_enseignants: boolean;
  pointage_educateurs: boolean;
  pointage_direction: boolean;
  pointage_administration: boolean;
  pointage_eleves: boolean;
  tolerance_retard_minutes: number;
  tolerance_depart_anticipe_minutes: number;
};

type Periode = {
  id: string;
  libelle: string;
  heure_debut: string;
  heure_fin: string;
  ordre: number;
  actif: boolean;
};

type Device = {
  id: string;
  nom: string;
  description: string | null;
  code_device: string;
  actif: boolean;
  dernier_pointage_at: string | null;
};

const CONFIG_VIDE: Configuration = {
  id: null,
  pointage_actif: false,
  pointage_enseignants: true,
  pointage_educateurs: true,
  pointage_direction: true,
  pointage_administration: true,
  pointage_eleves: false,
  tolerance_retard_minutes: 10,
  tolerance_depart_anticipe_minutes: 10,
};

function genererCodeDevice() {
  return 'DEV-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function ConfigurationPointagePage() {
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState('');
  const [config, setConfig] = useState<Configuration>(CONFIG_VIDE);
  const [periodes, setPeriodes] = useState<Periode[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showFormPeriode, setShowFormPeriode] = useState(false);
  const [formPeriode, setFormPeriode] = useState({ libelle: '', heure_debut: '07:30', heure_fin: '12:15' });

  const [showFormDevice, setShowFormDevice] = useState(false);
  const [formDevice, setFormDevice] = useState({ nom: '', description: '' });

  const charger = useCallback(async () => {
    setLoading(true);
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
    setEtablissementId(profil.etablissement_id);

    const { data: configData } = await supabase
      .from('pointage_configurations')
      .select('*')
      .eq('etablissement_id', profil.etablissement_id)
      .maybeSingle();

    if (configData) {
      setConfig(configData);
    } else {
      setConfig({ ...CONFIG_VIDE });
    }

    const { data: periodesData } = await supabase
      .from('pointage_periodes')
      .select('*')
      .eq('etablissement_id', profil.etablissement_id)
      .order('ordre');
    setPeriodes(periodesData || []);

    const { data: devicesData } = await supabase
      .from('pointage_devices')
      .select('*')
      .eq('etablissement_id', profil.etablissement_id)
      .order('created_at');
    setDevices(devicesData || []);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const sauvegarderConfig = async () => {
    setSaving(true);
    setMessage(null);

    const payload = {
      etablissement_id: etablissementId,
      pointage_actif: config.pointage_actif,
      pointage_enseignants: config.pointage_enseignants,
      pointage_educateurs: config.pointage_educateurs,
      pointage_direction: config.pointage_direction,
      pointage_administration: config.pointage_administration,
      pointage_eleves: config.pointage_eleves,
      tolerance_retard_minutes: config.tolerance_retard_minutes,
      tolerance_depart_anticipe_minutes: config.tolerance_depart_anticipe_minutes,
    };

    let error;
    if (config.id) {
      ({ error } = await supabase.from('pointage_configurations').update(payload).eq('id', config.id));
    } else {
      const { data, error: insertError } = await supabase
        .from('pointage_configurations')
        .insert(payload)
        .select()
        .single();
      error = insertError;
      if (data) setConfig({ ...config, id: data.id });
    }

    if (error) {
      setMessage({ type: 'error', text: 'Erreur: ' + error.message });
      setSaving(false);
      return;
    }

    setMessage({ type: 'success', text: 'Configuration enregistrée.' });
    setSaving(false);
  };

  const ajouterPeriode = async () => {
    if (!formPeriode.libelle.trim()) {
      setMessage({ type: 'error', text: 'Donnez un libellé (ex: Matin).' });
      return;
    }
    if (formPeriode.heure_fin <= formPeriode.heure_debut) {
      setMessage({ type: 'error', text: "L'heure de fin doit être après le début." });
      return;
    }

    const prochainOrdre = periodes.length > 0 ? Math.max(...periodes.map((p) => p.ordre)) + 1 : 1;

    const { error } = await supabase.from('pointage_periodes').insert({
      etablissement_id: etablissementId,
      libelle: formPeriode.libelle.trim(),
      heure_debut: formPeriode.heure_debut,
      heure_fin: formPeriode.heure_fin,
      ordre: prochainOrdre,
      actif: true,
    });

    if (error) {
      setMessage({ type: 'error', text: 'Erreur: ' + error.message });
      return;
    }

    setFormPeriode({ libelle: '', heure_debut: '07:30', heure_fin: '12:15' });
    setShowFormPeriode(false);
    charger();
  };

  const supprimerPeriode = async (id: string) => {
    await supabase.from('pointage_periodes').delete().eq('id', id);
    charger();
  };

  const ajouterDevice = async () => {
    if (!formDevice.nom.trim()) {
      setMessage({ type: 'error', text: 'Donnez un nom (ex: Entrée principale).' });
      return;
    }

    const code = genererCodeDevice();

    const { error } = await supabase.from('pointage_devices').insert({
      etablissement_id: etablissementId,
      nom: formDevice.nom.trim(),
      description: formDevice.description.trim() || null,
      code_device: code,
      actif: true,
    });

    if (error) {
      setMessage({ type: 'error', text: 'Erreur: ' + error.message });
      return;
    }

    setFormDevice({ nom: '', description: '' });
    setShowFormDevice(false);
    setMessage({ type: 'success', text: `Appareil créé avec le code ${code}.` });
    charger();
  };

  const basculerDeviceActif = async (device: Device) => {
    await supabase.from('pointage_devices').update({ actif: !device.actif }).eq('id', device.id);
    charger();
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Configuration du pointage</h1>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* PARAMETRES GENERAUX */}
      <div className="border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Paramètres généraux</h2>

        <label className="flex items-center justify-between py-1">
          <span className="text-sm">Activer le pointage pour l'établissement</span>
          <input
            type="checkbox"
            checked={config.pointage_actif}
            onChange={(e) => setConfig({ ...config, pointage_actif: e.target.checked })}
            className="h-5 w-5"
          />
        </label>

        <div className="border-t pt-3 space-y-2">
          <p className="text-sm font-medium text-gray-700">Rôles soumis au pointage</p>
          {[
            { key: 'pointage_enseignants', label: 'Enseignants' },
            { key: 'pointage_educateurs', label: 'Éducateurs' },
            { key: 'pointage_direction', label: 'Direction (directeur des études, chef)' },
            { key: 'pointage_administration', label: 'Administration (secrétaire, comptable, caissier)' },
            { key: 'pointage_eleves', label: 'Élèves (système distinct à venir)' },
          ].map((role) => (
            <label key={role.key} className="flex items-center justify-between py-1">
              <span className="text-sm">{role.label}</span>
              <input
                type="checkbox"
                checked={(config as any)[role.key]}
                onChange={(e) => setConfig({ ...config, [role.key]: e.target.checked })}
                className="h-5 w-5"
              />
            </label>
          ))}
        </div>

        <div className="border-t pt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium mb-1">Tolérance retard (min)</label>
            <input
              type="number"
              min="0"
              value={config.tolerance_retard_minutes}
              onChange={(e) => setConfig({ ...config, tolerance_retard_minutes: parseInt(e.target.value) || 0 })}
              className="w-full border rounded-lg p-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tolérance départ anticipé (min)</label>
            <input
              type="number"
              min="0"
              value={config.tolerance_depart_anticipe_minutes}
              onChange={(e) => setConfig({ ...config, tolerance_depart_anticipe_minutes: parseInt(e.target.value) || 0 })}
              className="w-full border rounded-lg p-2"
            />
          </div>
        </div>

        <button
          onClick={sauvegarderConfig}
          disabled={saving}
          className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
        </button>
      </div>

      {/* PERIODES */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Périodes de travail</h2>
          <button onClick={() => setShowFormPeriode(!showFormPeriode)} className="text-sm text-blue-600">
            {showFormPeriode ? 'Annuler' : '+ Ajouter'}
          </button>
        </div>

        {showFormPeriode && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <input
              type="text"
              placeholder="Libellé (ex: Matin)"
              value={formPeriode.libelle}
              onChange={(e) => setFormPeriode({ ...formPeriode, libelle: e.target.value })}
              className="w-full border rounded-lg p-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                value={formPeriode.heure_debut}
                onChange={(e) => setFormPeriode({ ...formPeriode, heure_debut: e.target.value })}
                className="w-full border rounded-lg p-2 text-sm"
              />
              <input
                type="time"
                value={formPeriode.heure_fin}
                onChange={(e) => setFormPeriode({ ...formPeriode, heure_fin: e.target.value })}
                className="w-full border rounded-lg p-2 text-sm"
              />
            </div>
            <button onClick={ajouterPeriode} className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium">
              Ajouter la période
            </button>
          </div>
        )}

        {periodes.length === 0 && <p className="text-sm text-gray-500">Aucune période configurée.</p>}
        {periodes.map((p) => (
          <div key={p.id} className="flex justify-between items-center border-b py-2 text-sm">
            <span>{p.libelle} — {p.heure_debut.slice(0, 5)} à {p.heure_fin.slice(0, 5)}</span>
            <button onClick={() => supprimerPeriode(p.id)} className="text-red-600 text-xs">Supprimer</button>
          </div>
        ))}
      </div>

      {/* APPAREILS */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Appareils autorisés</h2>
          <button onClick={() => setShowFormDevice(!showFormDevice)} className="text-sm text-blue-600">
            {showFormDevice ? 'Annuler' : '+ Ajouter'}
          </button>
        </div>

        {showFormDevice && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <input
              type="text"
              placeholder="Nom (ex: Entrée principale)"
              value={formDevice.nom}
              onChange={(e) => setFormDevice({ ...formDevice, nom: e.target.value })}
              className="w-full border rounded-lg p-2 text-sm"
            />
            <input
              type="text"
              placeholder="Description (optionnel)"
              value={formDevice.description}
              onChange={(e) => setFormDevice({ ...formDevice, description: e.target.value })}
              className="w-full border rounded-lg p-2 text-sm"
            />
            <button onClick={ajouterDevice} className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium">
              Créer l'appareil
            </button>
          </div>
        )}

        {devices.length === 0 && <p className="text-sm text-gray-500">Aucun appareil enregistré.</p>}
        {devices.map((d) => (
          <div key={d.id} className="border-b py-2">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-medium">{d.nom}</div>
                <div className="text-xs text-gray-500 font-mono">{d.code_device}</div>
              </div>
              <button
                onClick={() => basculerDeviceActif(d)}
                className={`text-xs px-2 py-1 rounded-full ${d.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
              >
                {d.actif ? 'Actif' : 'Inactif'}
              </button>
            </div>
            {d.dernier_pointage_at && (
              <div className="text-xs text-gray-400 mt-1">
                Dernier pointage : {new Date(d.dernier_pointage_at).toLocaleString('fr-FR')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
