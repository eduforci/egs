'use client';

import { useState, useEffect, useCallback } from 'react';
import { formaterMontant, formaterDateCourte } from '@/lib/sms-texte';

type Ligne = {
  eleve_id: string;
  eleve_nom: string;
  eleve_prenom: string;
  classe_nom: string;
  nb_echeances: number;
  total_restant: number;
  plus_ancienne: string;
  jours_retard_max: number;
  parent_nom: string | null;
  telephone: string | null;
  message: string;
  segments: number;
  dernier_sms: string | null;
  deja_relance_aujourdhui: boolean;
};

type Issue = { eleve_id: string; nom: string; statut: string; erreur?: string };

export default function RelancesSmsPage() {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [historiqueDispo, setHistoriqueDispo] = useState(true);
  const [smsConfigure, setSmsConfigure] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState<string[]>([]);
  const [messageOuvert, setMessageOuvert] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const reponse = await fetch('/api/sms/relances', { cache: 'no-store' });
      const data = await reponse.json();
      if (!reponse.ok) {
        setMessage({ type: 'error', text: data?.error || 'Impossible de charger les retards.' });
        setLignes([]);
      } else {
        setLignes(data.lignes ?? []);
        setHistoriqueDispo(data.historiqueDispo !== false);
        setSmsConfigure(data.smsConfigure !== false);
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const envoyer = async (ids: string[]) => {
    if (ids.length === 0) return;
    const cibles = lignes.filter((l) => ids.includes(l.eleve_id));
    const totalSms = cibles.reduce((s, l) => s + l.segments, 0);
    const accord = window.confirm(
      `Envoyer ${cibles.length} SMS de relance aux parents ?\n(environ ${totalSms} SMS facturés)`
    );
    if (!accord) return;

    setEnvoiEnCours(ids);
    setMessage(null);
    try {
      const reponse = await fetch('/api/sms/relances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eleveIds: ids }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setMessage({ type: 'error', text: data?.error || "Échec de l'envoi." });
      } else {
        const echecs: Issue[] = (data.resultats ?? []).filter((r: Issue) => r.statut === 'echec');
        let texte = `${data.nbEnvoyes} SMS envoyé(s).`;
        if (data.nbIgnores > 0) texte += ` ${data.nbIgnores} ignoré(s) (sans numéro ou déjà relancé aujourd'hui).`;
        if (data.nbEchecs > 0) {
          texte += ` ${data.nbEchecs} échec(s)${echecs[0]?.erreur ? ' : ' + echecs[0].erreur : ''}.`;
        }
        setMessage({ type: data.nbEchecs > 0 && data.nbEnvoyes === 0 ? 'error' : 'success', text: texte });
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau pendant l\'envoi.' });
    }
    setEnvoiEnCours([]);
    charger();
  };

  if (loading && lignes.length === 0) return <p className="p-4 text-gray-500">Chargement...</p>;

  const totalRetard = lignes.reduce((s, l) => s + l.total_restant, 0);
  const aRelancer = lignes.filter((l) => l.telephone && !l.deja_relance_aujourdhui);
  const sansNumero = lignes.filter((l) => !l.telephone).length;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Relances impayés par SMS</h1>
        <p className="text-sm text-gray-500">
          Le parent reçoit un SMS sur son téléphone, sans avoir besoin de l'application.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="border rounded-xl p-3 text-center bg-white">
          <div className="text-xl font-bold">{lignes.length}</div>
          <div className="text-xs text-gray-500">Élèves en retard</div>
        </div>
        <div className="border rounded-xl p-3 text-center bg-white">
          <div className="text-xl font-bold">{formaterMontant(totalRetard)} F</div>
          <div className="text-xs text-gray-500">Total impayé</div>
        </div>
        <div className="border rounded-xl p-3 text-center bg-white">
          <div className="text-xl font-bold">{sansNumero}</div>
          <div className="text-xs text-gray-500">Sans numéro</div>
        </div>
      </div>

      {!smsConfigure && (
        <div className="p-3 rounded-lg text-sm bg-orange-50 text-orange-800 border border-orange-200">
          L'envoi de SMS n'est pas encore configuré (clés Africa's Talking absentes sur Vercel).
        </div>
      )}
      {!historiqueDispo && (
        <div className="p-3 rounded-lg text-sm bg-orange-50 text-orange-800 border border-orange-200">
          L'historique des SMS n'est pas encore installé : exécutez le script SQL « sms_envoyes ». En
          attendant, la protection contre les doubles envois du jour est désactivée.
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

      {aRelancer.length > 0 && (
        <button
          onClick={() => envoyer(aRelancer.map((l) => l.eleve_id))}
          disabled={envoiEnCours.length > 0 || !smsConfigure}
          className="w-full bg-orange-600 text-white py-3 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {envoiEnCours.length > 0 ? 'Envoi en cours...' : `📨 Relancer tous par SMS (${aRelancer.length})`}
        </button>
      )}

      {lignes.length === 0 && <p className="text-gray-500 text-sm">Aucun retard de paiement. 🎉</p>}

      <div className="space-y-2">
        {lignes.map((l) => {
          const enCours = envoiEnCours.includes(l.eleve_id);
          return (
            <div key={l.eleve_id} className="border rounded-lg p-3 bg-white">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="font-medium">
                    {l.eleve_nom} {l.eleve_prenom}
                  </div>
                  <div className="text-xs text-gray-500">
                    {l.classe_nom} — {l.nb_echeances} échéance(s) en retard
                  </div>
                </div>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full whitespace-nowrap">
                  {l.jours_retard_max}j de retard
                </span>
              </div>

              <div className="text-sm mt-2">
                Restant dû : <strong>{formaterMontant(l.total_restant)} F</strong>
              </div>
              <div className="text-xs text-gray-500">
                Plus ancienne échéance : {formaterDateCourte(l.plus_ancienne)}
              </div>

              <div className="text-xs mt-2">
                {l.telephone ? (
                  <span className="text-gray-700">
                    📱 {l.parent_nom ? `${l.parent_nom} · ` : ''}
                    {l.telephone}
                  </span>
                ) : (
                  <span className="text-red-600">
                    Aucun numéro de parent.{' '}
                    <a href={`/chef/eleves/${l.eleve_id}`} className="underline">
                      Ouvrir la fiche
                    </a>
                  </span>
                )}
              </div>

              <div className="text-xs text-gray-500 mt-1">
                {l.dernier_sms
                  ? `Dernier SMS : ${formaterDateCourte(l.dernier_sms)}`
                  : 'Aucun SMS envoyé'}
                {l.deja_relance_aujourdhui && (
                  <span className="ml-2 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                    déjà relancé aujourd'hui
                  </span>
                )}
              </div>

              <button
                onClick={() => setMessageOuvert(messageOuvert === l.eleve_id ? null : l.eleve_id)}
                className="text-xs text-blue-600 underline mt-2"
              >
                {messageOuvert === l.eleve_id ? 'Masquer le message' : 'Voir le message'}
              </button>
              {messageOuvert === l.eleve_id && (
                <p className="text-xs bg-gray-50 border rounded-md p-2 mt-1 text-gray-700">
                  {l.message}
                  <span className="block text-gray-400 mt-1">
                    {l.message.length} caractères · {l.segments} SMS
                  </span>
                </p>
              )}

              <button
                onClick={() => envoyer([l.eleve_id])}
                disabled={enCours || !l.telephone || !smsConfigure}
                className="mt-2 w-full bg-orange-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {enCours ? 'Envoi...' : '📨 Envoyer un SMS'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
