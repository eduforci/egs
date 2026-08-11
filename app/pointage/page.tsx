'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Profil = {
  id: string;
  nom: string | null;
  prenom: string | null;
  role: string;
  etablissement_id: string | null;
};

type Device = {
  id: string;
  nom: string;
  description: string | null;
  code_device: string;
  actif: boolean;
};

type ResultatPointage = {
  nom: string | null;
  prenom: string | null;
  date: string;
  heure: string;
  periode: string;
  statut: string;
  appareil: string;
};

export default function PointagePage() {
  const supabase = createClient();

  const [profil, setProfil] = useState<Profil | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [codeDevice, setCodeDevice] = useState('');

  const [loading, setLoading] = useState(true);
  const [pointageEnCours, setPointageEnCours] = useState(false);

  const [resultat, setResultat] =
    useState<ResultatPointage | null>(null);

  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [heure, setHeure] = useState('');

  // ---------------------------------------------------------------------------
  // CHARGEMENT
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const charger = async () => {
      setLoading(true);
      setMessage(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage({
          type: 'error',
          text: 'Vous devez être connecté pour pointer.',
        });
        setLoading(false);
        return;
      }

      const { data: profilData, error: profilError } =
        await supabase
          .from('profiles')
          .select(
            'id, nom, prenom, role, etablissement_id'
          )
          .eq('id', user.id)
          .single();

      if (profilError || !profilData) {
        setMessage({
          type: 'error',
          text: 'Impossible de récupérer votre profil.',
        });
        setLoading(false);
        return;
      }

      setProfil(profilData);

      if (!profilData.etablissement_id) {
        setMessage({
          type: 'error',
          text: 'Votre compte n’est associé à aucun établissement.',
        });
        setLoading(false);
        return;
      }

      const { data: devicesData, error: devicesError } =
        await supabase
          .from('pointage_devices')
          .select(
            'id, nom, description, code_device, actif'
          )
          .eq(
            'etablissement_id',
            profilData.etablissement_id
          )
          .eq('actif', true)
          .order('created_at');

      if (devicesError) {
        setMessage({
          type: 'error',
          text: 'Impossible de récupérer les appareils de pointage.',
        });
        setLoading(false);
        return;
      }

      setDevices(devicesData || []);

      if (devicesData && devicesData.length === 1) {
        setDeviceId(devicesData[0].id);
        setCodeDevice(devicesData[0].code_device);
      }

      setLoading(false);
    };

    charger();
  }, [supabase]);

  // ---------------------------------------------------------------------------
  // HORLOGE VISUELLE
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const actualiserHeure = () => {
      const maintenant = new Date();

      setHeure(
        maintenant.toLocaleTimeString('fr-FR', {
          timeZone: 'Africa/Abidjan',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };

    actualiserHeure();

    const interval = setInterval(
      actualiserHeure,
      1000
    );

    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------------------------------------------
  // BADGER
  // ---------------------------------------------------------------------------

  const badger = async (
    typeEvenement: 'arrivee' | 'depart'
  ) => {
    if (!profil) {
      setMessage({
        type: 'error',
        text: 'Profil utilisateur introuvable.',
      });
      return;
    }

    if (!deviceId || !codeDevice) {
      setMessage({
        type: 'error',
        text: 'Aucun appareil de pointage sélectionné.',
      });
      return;
    }

    setPointageEnCours(true);
    setMessage(null);
    setResultat(null);

    try {
      const response = await fetch(
        '/api/pointage/badger',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            device_id: deviceId,
            code_device: codeDevice,
            type_evenement: typeEvenement,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage({
          type: 'error',
          text:
            data?.error ||
            'Le pointage n’a pas pu être enregistré.',
        });

        return;
      }

      setResultat(data.pointage);

      setMessage({
        type: 'success',
        text:
          data.message ||
          'Pointage enregistré avec succès.',
      });
    } catch (error) {
      console.error(error);

      setMessage({
        type: 'error',
        text:
          'Une erreur de connexion est survenue.',
      });
    } finally {
      setPointageEnCours(false);
    }
  };

  // ---------------------------------------------------------------------------
  // CHARGEMENT
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-gray-500">
          Chargement du pointage...
        </div>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // AFFICHAGE
  // ---------------------------------------------------------------------------

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">

        {/* EN-TÊTE */}

        <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">

          <div className="text-sm text-gray-500 mb-2">
            EGS — Pointage
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Bonjour{' '}
            {profil?.prenom || ''}
          </h1>

          <p className="text-gray-500 mt-1">
            {profil?.nom || ''}
          </p>

          {/* HORLOGE */}

          <div className="mt-6">
            <div className="text-4xl font-bold tracking-tight">
              {heure}
            </div>

            <div className="text-xs text-gray-400 mt-1">
              Heure officielle — Côte d’Ivoire
            </div>
          </div>

        </div>

        {/* APPAREIL */}

        <div className="bg-white rounded-2xl shadow-sm border p-5 mt-4">

          <h2 className="font-semibold mb-3">
            Appareil de pointage
          </h2>

          {devices.length === 0 ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              Aucun appareil de pointage actif n’est disponible
              pour votre établissement.
            </div>
          ) : devices.length === 1 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="font-medium text-green-800">
                {devices[0].nom}
              </div>

              {devices[0].description && (
                <div className="text-sm text-green-700 mt-1">
                  {devices[0].description}
                </div>
              )}

              <div className="text-xs text-green-600 mt-2">
                ✓ Appareil actif
              </div>
            </div>
          ) : (
            <select
              value={deviceId}
              onChange={(e) => {
                const id = e.target.value;
                const device = devices.find(
                  (d) => d.id === id
                );

                setDeviceId(id);
                setCodeDevice(
                  device?.code_device || ''
                );
              }}
              className="w-full border rounded-lg p-3"
            >
              <option value="">
                Sélectionner l’appareil
              </option>

              {devices.map((device) => (
                <option
                  key={device.id}
                  value={device.id}
                >
                  {device.nom}
                </option>
              ))}
            </select>
          )}

        </div>

        {/* MESSAGE */}

        {message && (
          <div
            className={`mt-4 rounded-xl p-4 text-sm border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* RESULTAT */}

        {resultat && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 mt-4 text-center">

            <div className="text-5xl mb-3">
              {resultat.statut === 'a_l_heure'
                ? '✅'
                : resultat.statut === 'retard'
                ? '⚠️'
                : resultat.statut === 'depart_normal'
                ? '👋'
                : '⚠️'}
            </div>

            <h2 className="text-xl font-bold">
              {resultat.statut === 'a_l_heure'
                ? 'À L’HEURE'
                : resultat.statut === 'retard'
                ? 'RETARD'
                : resultat.statut ===
                  'depart_normal'
                ? 'DÉPART ENREGISTRÉ'
                : 'DÉPART ANTICIPÉ'}
            </h2>

            <div className="mt-4 text-sm text-gray-600 space-y-1">
              <div>
                Heure :{' '}
                <strong>
                  {resultat.heure}
                </strong>
              </div>

              <div>
                Période :{' '}
                <strong>
                  {resultat.periode}
                </strong>
              </div>

              <div>
                Appareil :{' '}
                <strong>
                  {resultat.appareil}
                </strong>
              </div>
            </div>

          </div>
        )}

        {/* BOUTONS */}

        <div className="grid grid-cols-1 gap-3 mt-4">

          <button
            type="button"
            disabled={
              pointageEnCours ||
              devices.length === 0 ||
              !deviceId
            }
            onClick={() =>
              badger('arrivee')
            }
            className="w-full bg-green-600 hover:bg-green-700 text-white rounded-2xl py-5 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pointageEnCours
              ? 'Enregistrement...'
              : '🟢 POINTER MON ARRIVÉE'}
          </button>

          <button
            type="button"
            disabled={
              pointageEnCours ||
              devices.length === 0 ||
              !deviceId
            }
            onClick={() =>
              badger('depart')
            }
            className="w-full bg-gray-800 hover:bg-gray-900 text-white rounded-2xl py-5 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pointageEnCours
              ? 'Enregistrement...'
              : '🔴 POINTER MON DÉPART'}
          </button>

        </div>

        {/* INFORMATION */}

        <div className="text-center text-xs text-gray-400 mt-6">
          Le pointage est enregistré avec la date et
          l’heure officielles du serveur.
        </div>

      </div>
    </main>
  );
    }
