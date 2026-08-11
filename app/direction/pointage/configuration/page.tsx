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

type Message = {
type: 'success' | 'error';
text: string;
};

const CONFIG_VIDE: Configuration = {
id: null,
pointage_actif: false,
pointage_enseignants: true,
pointage_educateurs: true,
pointage_direction: false,
pointage_administration: true,
pointage_eleves: false,
tolerance_retard_minutes: 10,
tolerance_depart_anticipe_minutes: 10,
};

function genererCodeDevice() {
const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let code = 'DEV-';

for (let i = 0; i < 8; i++) {
code += caracteres.charAt(
Math.floor(Math.random() * caracteres.length)
);
}

return code;
}

export default function ConfigurationPointagePage() {
const supabase = createClient();

const [etablissementId, setEtablissementId] = useState('');
const [config, setConfig] = useState<Configuration>(CONFIG_VIDE);
const [periodes, setPeriodes] = useState<Periode[]>([]);
const [devices, setDevices] = useState<Device[]>([]);

const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [message, setMessage] = useState<Message | null>(null);

const [showFormPeriode, setShowFormPeriode] = useState(false);
const [formPeriode, setFormPeriode] = useState({
libelle: '',
heure_debut: '07:30',
heure_fin: '12:15',
});

const [showFormDevice, setShowFormDevice] = useState(false);
const [formDevice, setFormDevice] = useState({
nom: '',
description: '',
});

const afficherErreur = (text: string) => {
setMessage({ type: 'error', text });
};

const afficherSucces = (text: string) => {
setMessage({ type: 'success', text });
};

const charger = useCallback(async () => {
setLoading(true);
setMessage(null);

try {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    afficherErreur('Vous devez être connecté.');
    return;
  }

  const { data: profil, error: profilError } = await supabase
    .from('profiles')
    .select('etablissement_id, role')
    .eq('id', user.id)
    .single();

  if (profilError) {
    throw profilError;
  }

  if (!profil?.etablissement_id) {
    afficherErreur(
      "Votre profil n'est associé à aucun établissement."
    );
    return;
  }

  const rolesAutorises = [
    'super_admin',
    'chef',
    'directeur_etudes',
  ];

  if (!rolesAutorises.includes(profil.role)) {
    afficherErreur(
      "Vous n'avez pas l'autorisation d'accéder à cette configuration."
    );
    return;
  }

  setEtablissementId(profil.etablissement_id);

  const [
    configResult,
    periodesResult,
    devicesResult,
  ] = await Promise.all([
    supabase
      .from('pointage_configurations')
      .select('*')
      .eq('etablissement_id', profil.etablissement_id)
      .maybeSingle(),

    supabase
      .from('pointage_periodes')
      .select('*')
      .eq('etablissement_id', profil.etablissement_id)
      .order('ordre', { ascending: true }),

    supabase
      .from('pointage_devices')
      .select('*')
      .eq('etablissement_id', profil.etablissement_id)
      .order('created_at', { ascending: true }),
  ]);

  if (configResult.error) {
    throw configResult.error;
  }

  if (periodesResult.error) {
    throw periodesResult.error;
  }

  if (devicesResult.error) {
    throw devicesResult.error;
  }

  if (configResult.data) {
    setConfig(configResult.data);
  } else {
    setConfig(CONFIG_VIDE);
  }

  setPeriodes(periodesResult.data || []);
  setDevices(devicesResult.data || []);
} catch (error) {
  console.error(error);

  afficherErreur(
    error instanceof Error
      ? error.message
      : 'Une erreur est survenue lors du chargement.'
  );
} finally {
  setLoading(false);
}

}, [supabase]);

useEffect(() => {
charger();
}, [charger]);

const sauvegarderConfig = async () => {
if (!etablissementId) {
afficherErreur('Établissement introuvable.');
return;
}

if (
  config.tolerance_retard_minutes < 0 ||
  config.tolerance_depart_anticipe_minutes < 0
) {
  afficherErreur(
    'Les tolérances ne peuvent pas être négatives.'
  );
  return;
}

setSaving(true);
setMessage(null);

try {
  const payload = {
    etablissement_id: etablissementId,
    pointage_actif: config.pointage_actif,
    pointage_enseignants: config.pointage_enseignants,
    pointage_educateurs: config.pointage_educateurs,
    pointage_direction: config.pointage_direction,
    pointage_administration: config.pointage_administration,
    pointage_eleves: config.pointage_eleves,
    tolerance_retard_minutes:
      config.tolerance_retard_minutes,
    tolerance_depart_anticipe_minutes:
      config.tolerance_depart_anticipe_minutes,
  };

  if (config.id) {
    const { error } = await supabase
      .from('pointage_configurations')
      .update(payload)
      .eq('id', config.id);

    if (error) {
      throw error;
    }
  } else {
    const { data, error } = await supabase
      .from('pointage_configurations')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (data) {
      setConfig(data);
    }
  }

  afficherSucces('Configuration enregistrée avec succès.');
} catch (error) {
  console.error(error);

  afficherErreur(
    error instanceof Error
      ? error.message
      : "Impossible d'enregistrer la configuration."
  );
} finally {
  setSaving(false);
}

};

const ajouterPeriode = async () => {
setMessage(null);

const libelle = formPeriode.libelle.trim();

if (!libelle) {
  afficherErreur('Donnez un libellé, par exemple « Matin ».');
  return;
}

if (formPeriode.heure_fin <= formPeriode.heure_debut) {
  afficherErreur(
    "L'heure de fin doit être après l'heure de début."
  );
  return;
}

const prochainOrdre =
  periodes.length > 0
    ? Math.max(...periodes.map((p) => p.ordre)) + 1
    : 1;

const { error } = await supabase
  .from('pointage_periodes')
  .insert({
    etablissement_id: etablissementId,
    libelle,
    heure_debut: formPeriode.heure_debut,
    heure_fin: formPeriode.heure_fin,
    ordre: prochainOrdre,
    actif: true,
  });

if (error) {
  afficherErreur(
    'Impossible de créer la période : ' + error.message
  );
  return;
}

setFormPeriode({
  libelle: '',
  heure_debut: '07:30',
  heure_fin: '12:15',
});

setShowFormPeriode(false);
afficherSucces('Période ajoutée.');
await charger();

};

const supprimerPeriode = async (periode: Periode) => {
const confirmation = window.confirm(
"Supprimer la période « ${periode.libelle} » ?"
);

if (!confirmation) {
  return;
}

const { error } = await supabase
  .from('pointage_periodes')
  .delete()
  .eq('id', periode.id);

if (error) {
  afficherErreur(
    'Impossible de supprimer la période : ' + error.message
  );
  return;
}

afficherSucces('Période supprimée.');
await charger();

};

const ajouterDevice = async () => {
const nom = formDevice.nom.trim();

if (!nom) {
  afficherErreur(
    "Donnez un nom à l'appareil, par exemple « Entrée principale »."
  );
  return;
}

const code = genererCodeDevice();

const { error } = await supabase
  .from('pointage_devices')
  .insert({
    etablissement_id: etablissementId,
    nom,
    description: formDevice.description.trim() || null,
    code_device: code,
    actif: true,
  });

if (error) {
  afficherErreur(
    "Impossible de créer l'appareil : " + error.message
  );
  return;
}

setFormDevice({
  nom: '',
  description: '',
});

setShowFormDevice(false);

afficherSucces(
  `Appareil créé. Code provisoire : ${code}`
);

await charger();

};

const basculerDeviceActif = async (device: Device) => {
const { error } = await supabase
.from('pointage_devices')
.update({
actif: !device.actif,
})
.eq('id', device.id);

if (error) {
  afficherErreur(
    "Impossible de modifier l'appareil : " + error.message
  );
  return;
}

afficherSucces(
  device.actif
    ? 'Appareil désactivé.'
    : 'Appareil activé.'
);

await charger();

};

if (loading) {
return (
<div className="max-w-2xl mx-auto p-6">
<p className="text-gray-500">
Chargement de la configuration du pointage...
</p>
</div>
);
}

return (
<div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">

  <div>
    <h1 className="text-2xl font-bold">
      Configuration du pointage
    </h1>

    <p className="text-sm text-gray-500 mt-1">
      Configurez les règles de présence de votre établissement.
    </p>
  </div>

  {message && (
    <div
      className={`p-3 rounded-lg text-sm border ${
        message.type === 'success'
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-red-50 text-red-700 border-red-200'
      }`}
    >
      {message.text}
    </div>
  )}

  {/* ======================================================
      PARAMÈTRES GÉNÉRAUX
      ====================================================== */}

  <section className="border rounded-xl p-4 md:p-5 space-y-4">
    <div>
      <h2 className="font-semibold">
        Paramètres généraux
      </h2>

      <p className="text-xs text-gray-500 mt-1">
        Définissez qui est soumis au système de pointage.
      </p>
    </div>

    <label className="flex items-center justify-between py-2">
      <div>
        <span className="text-sm font-medium">
          Activer le pointage
        </span>

        <p className="text-xs text-gray-500">
          Active ou désactive globalement le système.
        </p>
      </div>

      <input
        type="checkbox"
        checked={config.pointage_actif}
        onChange={(e) =>
          setConfig({
            ...config,
            pointage_actif: e.target.checked,
          })
        }
        className="h-5 w-5"
      />
    </label>

    <div className="border-t pt-4 space-y-2">
      <p className="text-sm font-medium text-gray-700">
        Personnel soumis au pointage
      </p>

      {[
        {
          key: 'pointage_enseignants',
          label: 'Enseignants',
        },
        {
          key: 'pointage_educateurs',
          label: 'Éducateurs',
        },
        {
          key: 'pointage_direction',
          label: 'Direction',
        },
        {
          key: 'pointage_administration',
          label:
            'Administration (secrétaire, comptable, caissier)',
        },
      ].map((role) => (
        <label
          key={role.key}
          className="flex items-center justify-between py-2"
        >
          <span className="text-sm">
            {role.label}
          </span>

          <input
            type="checkbox"
            checked={
              config[
                role.key as keyof Configuration
              ] as boolean
            }
            onChange={(e) =>
              setConfig({
                ...config,
                [role.key]: e.target.checked,
              } as Configuration)
            }
            className="h-5 w-5"
          />
        </label>
      ))}

      <div className="border-t pt-3 mt-3">
        <label className="flex items-center justify-between py-2">
          <div>
            <span className="text-sm">
              Élèves
            </span>

            <p className="text-xs text-gray-500">
              Le système de présence des élèves sera traité
              séparément.
            </p>
          </div>

          <input
            type="checkbox"
            checked={config.pointage_eleves}
            onChange={(e) =>
              setConfig({
                ...config,
                pointage_eleves: e.target.checked,
              })
            }
            className="h-5 w-5"
          />
        </label>
      </div>
    </div>

    <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">

      <div>
        <label className="block text-sm font-medium mb-1">
          Tolérance de retard
        </label>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={config.tolerance_retard_minutes}
            onChange={(e) =>
              setConfig({
                ...config,
                tolerance_retard_minutes:
                  Math.max(
                    0,
                    Number(e.target.value)
                  ),
              })
            }
            className="w-full border rounded-lg p-2"
          />

          <span className="text-sm text-gray-500">
            min
          </span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Tolérance de départ anticipé
        </label>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={
              config.tolerance_depart_anticipe_minutes
            }
            onChange={(e) =>
              setConfig({
                ...config,
                tolerance_depart_anticipe_minutes:
                  Math.max(
                    0,
                    Number(e.target.value)
                  ),
              })
            }
            className="w-full border rounded-lg p-2"
          />

          <span className="text-sm text-gray-500">
            min
          </span>
        </div>
      </div>

    </div>

    <button
      onClick={sauvegarderConfig}
      disabled={saving}
      className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
    >
      {saving
        ? 'Enregistrement...'
        : 'Enregistrer les paramètres'}
    </button>
  </section>

  {/* ======================================================
      PÉRIODES DE TRAVAIL
      ====================================================== */}

  <section className="border rounded-xl p-4 md:p-5 space-y-4">

    <div className="flex justify-between items-center gap-3">
      <div>
        <h2 className="font-semibold">
          Périodes de présence
        </h2>

        <p className="text-xs text-gray-500 mt-1">
          Exemple : matin 07h30–12h15, après-midi
          14h00–17h00.
        </p>
      </div>

      <button
        onClick={() =>
          setShowFormPeriode(!showFormPeriode)
        }
        className="text-sm text-blue-600 whitespace-nowrap"
      >
        {showFormPeriode
          ? 'Annuler'
          : '+ Ajouter'}
      </button>
    </div>

    {showFormPeriode && (
      <div className="bg-gray-50 rounded-lg p-3 space-y-3">

        <input
          type="text"
          placeholder="Libellé (ex: Matin)"
          value={formPeriode.libelle}
          onChange={(e) =>
            setFormPeriode({
              ...formPeriode,
              libelle: e.target.value,
            })
          }
          className="w-full border rounded-lg p-2 text-sm"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Heure de début
            </label>

            <input
              type="time"
              value={formPeriode.heure_debut}
              onChange={(e) =>
                setFormPeriode({
                  ...formPeriode,
                  heure_debut: e.target.value,
                })
              }
              className="w-full border rounded-lg p-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Heure de fin
            </label>

            <input
              type="time"
              value={formPeriode.heure_fin}
              onChange={(e) =>
                setFormPeriode({
                  ...formPeriode,
                  heure_fin: e.target.value,
                })
              }
              className="w-full border rounded-lg p-2 text-sm"
            />
          </div>

        </div>

        <button
          onClick={ajouterPeriode}
          className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium"
        >
          Ajouter la période
        </button>
      </div>
    )}

    {periodes.length === 0 ? (
      <p className="text-sm text-gray-500">
        Aucune période configurée.
      </p>
    ) : (
      <div className="space-y-2">
        {periodes.map((p) => (
          <div
            key={p.id}
            className="flex justify-between items-center gap-3 border rounded-lg p-3"
          >
            <div>
              <div className="text-sm font-medium">
                {p.libelle}
              </div>

              <div className="text-xs text-gray-500">
                {p.heure_debut.slice(0, 5)}
                {' → '}
                {p.heure_fin.slice(0, 5)}
              </div>
            </div>

            <button
              onClick={() =>
                supprimerPeriode(p)
              }
              className="text-red-600 text-xs"
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>
    )}

  </section>

  {/* ======================================================
      APPAREILS
      ====================================================== */}

  <section className="border rounded-xl p-4 md:p-5 space-y-4">

    <div className="flex justify-between items-center gap-3">
      <div>
        <h2 className="font-semibold">
          Appareils de pointage
        </h2>

        <p className="text-xs text-gray-500 mt-1">
          Les appareils utilisés comme points de badgeage
          seront enregistrés ici.
        </p>
      </div>

      <button
        onClick={() =>
          setShowFormDevice(!showFormDevice)
        }
        className="text-sm text-blue-600 whitespace-nowrap"
      >
        {showFormDevice
          ? 'Annuler'
          : '+ Ajouter'}
      </button>
    </div>

    {showFormDevice && (
      <div className="bg-gray-50 rounded-lg p-3 space-y-3">

        <input
          type="text"
          placeholder="Nom (ex: Entrée principale)"
          value={formDevice.nom}
          onChange={(e) =>
            setFormDevice({
              ...formDevice,
              nom: e.target.value,
            })
          }
          className="w-full border rounded-lg p-2 text-sm"
        />

        <input
          type="text"
          placeholder="Description (optionnel)"
          value={formDevice.description}
          onChange={(e) =>
            setFormDevice({
              ...formDevice,
              description: e.target.value,
            })
          }
          className="w-full border rounded-lg p-2 text-sm"
        />

        <button
          onClick={ajouterDevice}
          className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium"
        >
          Créer l'appareil
        </button>

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Le code affiché ici est provisoire. Il ne constitue
          pas à lui seul une preuve de présence. La sécurité
          réelle du badgeage sera mise en place côté serveur.
        </p>

      </div>
    )}

    {devices.length === 0 ? (
      <p className="text-sm text-gray-500">
        Aucun appareil enregistré.
      </p>
    ) : (
      <div className="space-y-2">

        {devices.map((d) => (
          <div
            key={d.id}
            className="border rounded-lg p-3"
          >
            <div className="flex justify-between items-start gap-3">

              <div>
                <div className="text-sm font-medium">
                  {d.nom}
                  </div>

                {d.description && (
                  <div className="text-xs text-gray-500 mt-1">
                    {d.description}
                  </div>
                )}

                <div className="text-xs text-gray-500 font-mono mt-1">
                  {d.code_device}
                </div>
              </div>

              <button
                onClick={() =>
                  basculerDeviceActif(d)
                }
                className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                  d.actif
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {d.actif
                  ? 'Actif'
                  : 'Inactif'}
              </button>

            </div>

            {d.dernier_pointage_at && (
              <div className="text-xs text-gray-400 mt-2">
                Dernier pointage :{' '}
                {new Date(
                  d.dernier_pointage_at
                ).toLocaleString('fr-FR')}
              </div>
            )}
          </div>
        ))}

      </div>
    )}

  </section>

</div>
); }
