'use client';

import { useState, useEffect } from 'react';
import { simplifierPourSms, compterSegments } from '@/lib/sms-texte';

type Classe = { id: string; nom: string };

type Apercu = {
  nbDestinataires: number;
  nbSansNumero: number;
  segmentsParSms: number;
  totalSms: number;
  messageFinal: string;
};

const CIBLES = [
  { value: 'parents_tous', label: "Tous les parents de l'école" },
  { value: 'parents_classe', label: "Les parents d'une classe" },
  { value: 'personnel', label: "Le personnel de l'école" },
];

export default function MessageLibreSmsPage() {
  const [classes, setClasses] = useState<Classe[]>([]);
  const [ecole, setEcole] = useState('');
  const [smsConfigure, setSmsConfigure] = useState(true);

  const [cible, setCible] = useState('parents_tous');
  const [classeId, setClasseId] = useState('');
  const [texte, setTexte] = useState('');

  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const charger = async () => {
      try {
        const reponse = await fetch('/api/sms/message', { cache: 'no-store' });
        const data = await reponse.json();
        if (reponse.ok) {
          setClasses(data.classes ?? []);
          setEcole(data.ecole ?? '');
          setSmsConfigure(data.smsConfigure !== false);
        }
      } catch {
        /* le formulaire reste utilisable, seule la liste des classes manque */
      }
    };
    charger();
  }, []);

  // Dès que le texte ou les destinataires changent, l'aperçu précédent n'est plus valable.
  const reinitialiser = () => {
    setApercu(null);
    setMessage(null);
  };

  const texteFinal = simplifierPourSms(`${ecole || 'Ecole'} : ${texte.trim()}`);
  const segments = compterSegments(texteFinal);

  const appeler = async (simulation: boolean) => {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/sms/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cible, classeId, message: texte, apercu: simulation }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setMessage({ type: 'error', text: data?.error || 'Une erreur est survenue.' });
      } else if (simulation) {
        setApercu(data as Apercu);
      } else {
        let texteRetour = `${data.nbEnvoyes} SMS envoyé(s) (environ ${data.totalSms} SMS facturés).`;
        if (data.nbEchecs > 0) {
          texteRetour += ` ${data.nbEchecs} échec(s)${data.erreurs?.[0] ? ' : ' + data.erreurs[0] : ''}.`;
        }
        if (data.nbSansNumero > 0) texteRetour += ` ${data.nbSansNumero} personne(s) sans numéro valide.`;
        setMessage({ type: data.nbEnvoyes === 0 ? 'error' : 'success', text: texteRetour });
        if (data.nbEnvoyes > 0) {
          setTexte('');
          setApercu(null);
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setEnCours(false);
  };

  const confirmerEtEnvoyer = () => {
    if (!apercu) return;
    const accord = window.confirm(
      `Envoyer ce SMS à ${apercu.nbDestinataires} personne(s) ?\n(environ ${apercu.totalSms} SMS facturés)`
    );
    if (accord) appeler(false);
  };

  const peutVerifier =
    texte.trim().length > 0 && (cible !== 'parents_classe' || classeId !== '') && !enCours;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Message libre par SMS</h1>
        <p className="text-sm text-gray-500">
          Écrivez un message : il part par SMS sur le téléphone des destinataires.
        </p>
      </div>

      {!smsConfigure && (
        <div className="p-3 rounded-lg text-sm bg-orange-50 text-orange-800 border border-orange-200">
          L'envoi de SMS n'est pas encore configuré (clés Africa's Talking absentes sur Vercel).
        </div>
      )}

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="border rounded-xl p-4 bg-white space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Destinataires</label>
          <select
            value={cible}
            onChange={(e) => {
              setCible(e.target.value);
              reinitialiser();
            }}
            className="w-full border rounded-lg p-2 text-sm"
          >
            {CIBLES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {cible === 'parents_classe' && (
          <div>
            <label className="block text-sm font-medium mb-1">Classe</label>
            <select
              value={classeId}
              onChange={(e) => {
                setClasseId(e.target.value);
                reinitialiser();
              }}
              className="w-full border rounded-lg p-2 text-sm"
            >
              <option value="">Choisir une classe...</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Message</label>
          <textarea
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value);
              reinitialiser();
            }}
            rows={5}
            maxLength={400}
            placeholder="Ex : Réunion des parents ce samedi à 9h à l'école."
            className="w-full border rounded-lg p-2 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Le nom de l'école est ajouté automatiquement au début. {texteFinal.length} caractères ·{' '}
            {segments} SMS par personne.
          </p>
          {texte.trim().length > 0 && (
            <p className="text-xs bg-gray-50 border rounded-md p-2 mt-2 text-gray-700">{texteFinal}</p>
          )}
        </div>

        <button
          onClick={() => appeler(true)}
          disabled={!peutVerifier}
          className="w-full bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {enCours && !apercu ? 'Vérification...' : 'Vérifier les destinataires'}
        </button>
      </div>

      {apercu && (
        <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 space-y-3">
          <p className="text-sm">
            <strong>{apercu.nbDestinataires}</strong> personne(s) recevront ce SMS
            {apercu.nbSansNumero > 0 && (
              <span className="text-gray-600"> ({apercu.nbSansNumero} sans numéro valide, ignorée(s))</span>
            )}
            .
          </p>
          <p className="text-sm">
            Coût estimé : environ <strong>{apercu.totalSms}</strong> SMS facturés.
          </p>
          <button
            onClick={confirmerEtEnvoyer}
            disabled={enCours || apercu.nbDestinataires === 0 || !smsConfigure}
            className="w-full bg-orange-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {enCours ? 'Envoi en cours...' : '💬 Envoyer maintenant'}
          </button>
        </div>
      )}
    </div>
  );
}
