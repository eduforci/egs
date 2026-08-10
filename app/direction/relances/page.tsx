'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Retard = {
  eleve_id: string;
  echeance_id: string;
  numero_echeance: number;
  montant: number;
  montant_paye: number;
  montant_restant: number;
  date_echeance: string;
  jours_retard: number;
  eleve_nom: string;
  eleve_prenom: string;
  classe_nom: string;
};

export default function RelancesPage() {
  const supabase = createClient();
  const [retards, setRetards] = useState<Retard[]>([]);
  const [etablissementId, setEtablissementId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState<string | null>(null);

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

    const { data: retardsData, error } = await supabase.rpc('eleves_en_retard_paiement', {
      p_etablissement_id: profil.etablissement_id,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
      setLoading(false);
      return;
    }

    const idsEleves = Array.from(new Set((retardsData || []).map((r: any) => r.eleve_id)));
    const { data: elevesData } = idsEleves.length > 0
      ? await supabase.from('eleves').select('id, classe_id, classes(nom)').in('id', idsEleves)
      : { data: [] };
    const { data: profs } = idsEleves.length > 0
      ? await supabase.from('profiles').select('id, nom, prenom').in('id', idsEleves)
      : { data: [] };

    const elevesParId = new Map((elevesData || []).map((e: any) => [e.id, e]));
    const profsParId = new Map((profs || []).map((p) => [p.id, p]));

    const liste: Retard[] = (retardsData || []).map((r: any) => {
      const e = elevesParId.get(r.eleve_id);
      const p = profsParId.get(r.eleve_id);
      return {
        ...r,
        eleve_nom: p?.nom || '',
        eleve_prenom: p?.prenom || '',
        classe_nom: e?.classes?.nom || '',
      };
    });

    setRetards(liste);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const envoyerRelance = async (r: Retard) => {
    setEnvoiEnCours(r.echeance_id);
    setMessage(null);

    const { data: userData } = await supabase.auth.getUser();

    const messageTexte = `Rappel : l'échéance n°${r.numero_echeance} de ${r.montant_restant} F CFA est en retard de ${r.jours_retard} jour(s) (échue le ${new Date(r.date_echeance).toLocaleDateString('fr-FR')}). Merci de régulariser rapidement.`;

    const { error } = await supabase.from('relances_paiement').insert({
      etablissement_id: etablissementId,
      eleve_id: r.eleve_id,
      echeance_id: r.echeance_id,
      message: messageTexte,
      envoye_par: userData?.user?.id,
    });

    if (error) {
      setMessage({ type: 'error', text: 'Erreur: ' + error.message });
      setEnvoiEnCours(null);
      return;
    }

    setMessage({ type: 'success', text: `Relance envoyée pour ${r.eleve_nom} ${r.eleve_prenom}.` });
    setEnvoiEnCours(null);
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  const totalRetard = retards.reduce((sum, r) => sum + r.montant_restant, 0);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Relances de paiement</h1>

      <div className="grid grid-cols-2 gap-2">
        <div className="border rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{retards.length}</div>
          <div className="text-xs text-gray-500">Échéances en retard</div>
        </div>
        <div className="border rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{totalRetard.toLocaleString('fr-FR')} F</div>
          <div className="text-xs text-gray-500">Total impayé</div>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {retards.length === 0 && (
        <p className="text-gray-500 text-sm">Aucun retard de paiement. 🎉</p>
      )}

      <div className="space-y-2">
        {retards.map((r) => (
          <div key={r.echeance_id} className="border rounded-lg p-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{r.eleve_nom} {r.eleve_prenom}</div>
                <div className="text-xs text-gray-500">{r.classe_nom} — Échéance n°{r.numero_echeance}</div>
              </div>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                {r.jours_retard}j de retard
              </span>
            </div>
            <div className="text-sm mt-2">
              Restant dû : <strong>{r.montant_restant.toLocaleString('fr-FR')} F</strong> sur {r.montant.toLocaleString('fr-FR')} F
            </div>
            <div className="text-xs text-gray-500">
              Échéance du {new Date(r.date_echeance).toLocaleDateString('fr-FR')}
            </div>
            <button
              onClick={() => envoyerRelance(r)}
              disabled={envoiEnCours === r.echeance_id}
              className="mt-2 w-full bg-orange-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {envoiEnCours === r.echeance_id ? 'Envoi...' : '📨 Envoyer une relance'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
        }
