'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mentions = Record<string, number>;

export default function ExamenParametresPage() {
  const params = useParams();
  const router = useRouter();
  const examenId = params?.id as string;
  const supabase = createClient();

  const [examenNom, setExamenNom] = useState('');
  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [statutExamen, setStatutExamen] = useState('');

  const [pourcentageAdmission, setPourcentageAdmission] = useState('50');
  const [exclureNonNotees, setExclureNonNotees] = useState(false);
  const [mentions, setMentions] = useState<Mentions>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: examen, error: examenError } = await supabase
        .from('examens')
        .select('nom, etablissement_id, statut, pourcentage_admission, exclure_epreuves_non_notees')
        .eq('id', examenId)
        .single();

      if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
      setExamenNom(examen.nom);
      setEtablissementId(examen.etablissement_id);
      setStatutExamen(examen.statut);
      setPourcentageAdmission(String(examen.pourcentage_admission));
      setExclureNonNotees(examen.exclure_epreuves_non_notees);

      const { data: parametres, error: parametresError } = await supabase
        .from('parametres_pedagogiques')
        .select('seuils_mentions')
        .eq('etablissement_id', examen.etablissement_id)
        .maybeSingle();

      if (parametresError) throw new Error(`Erreur mentions : ${parametresError.message}`);
      setMentions((parametres?.seuils_mentions as Mentions) ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [examenId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function enregistrerSeuil() {
    setSaving(true);
    setError(null);
    setSucces(null);

    const { error: updateError } = await supabase
      .from('examens')
      .update({
        pourcentage_admission: parseFloat(pourcentageAdmission) || 50,
        exclure_epreuves_non_notees: exclureNonNotees,
      })
      .eq('id', examenId);

    setSaving(false);

    if (updateError) {
      setError(`Erreur enregistrement : ${updateError.message}`);
      return;
    }
    setSucces('Paramètres de calcul enregistrés.');
  }

  function modifierMention(nom: string, valeur: string) {
    setMentions((prev) => ({ ...prev, [nom]: parseFloat(valeur) || 0 }));
  }

  function renommerMention(ancienNom: string, nouveauNom: string) {
    if (!nouveauNom.trim() || nouveauNom === ancienNom) return;
    setMentions((prev) => {
      const copie: Mentions = {};
      Object.entries(prev).forEach(([k, v]) => {
        copie[k === ancienNom ? nouveauNom : k] = v;
      });
      return copie;
    });
  }

  function ajouterMention() {
    setMentions((prev) => ({ ...prev, ['Nouvelle mention']: 0 }));
  }

  function retirerMention(nom: string) {
    setMentions((prev) => {
      const copie = { ...prev };
      delete copie[nom];
      return copie;
    });
  }

  async function enregistrerMentions() {
    if (!etablissementId) return;
    setSaving(true);
    setError(null);
    setSucces(null);

    const { error: upsertError } = await supabase
      .from('parametres_pedagogiques')
      .upsert(
        { etablissement_id: etablissementId, seuils_mentions: mentions },
        { onConflict: 'etablissement_id' }
      );

    setSaving(false);

    if (upsertError) {
      setError(`Erreur enregistrement mentions : ${upsertError.message}`);
      return;
    }
    setSucces('Mentions enregistrées — appliquées à cet examen et aux bulletins de l\'établissement.');
  }

  async function verrouillerTout() {
    setSaving(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('verrouiller_toutes_matieres_examen', {
      p_examen_id: examenId,
    });
    setSaving(false);
    if (rpcError) {
      setError(`Erreur : ${rpcError.message}`);
      return;
    }
    setSucces(`${data} matière(s) verrouillée(s).`);
  }

  async function deverrouillerTout() {
    setSaving(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('deverrouiller_toutes_matieres_examen', {
      p_examen_id: examenId,
    });
    setSaving(false);
    if (rpcError) {
      setError(`Erreur : ${rpcError.message}`);
      return;
    }
    setSucces(`${data} matière(s) déverrouillée(s).`);
  }

  async function basculerArchivage() {
    const nouveauStatut = statutExamen === 'archive' ? 'preparation' : 'archive';
    const { error: updateError } = await supabase
      .from('examens')
      .update({ statut: nouveauStatut })
      .eq('id', examenId);

    if (updateError) {
      setError(`Erreur : ${updateError.message}`);
      return;
    }
    setStatutExamen(nouveauStatut);
    setSucces(nouveauStatut === 'archive' ? 'Examen archivé.' : 'Examen désarchivé.');
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Paramètres — {examenNom}</h1>
      <p className="text-sm text-gray-500 mb-4">
        Tout ce qui est réglable ici s'applique immédiatement, sans modification du code.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {/* Validation / mode de calcul */}
      <div className="border rounded-lg p-4 mb-4">
        <p className="font-semibold text-sm mb-3">Validation & mode de calcul</p>

        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">
            Seuil d'admission (% de la moyenne, ex: 50 pour BEPC/BAC/CEPE)
          </label>
          <input
            type="number"
            step="1"
            value={pourcentageAdmission}
            onChange={(e) => setPourcentageAdmission(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-start gap-2 text-sm mb-3">
          <input
            type="checkbox"
            checked={exclureNonNotees}
            onChange={(e) => setExclureNonNotees(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Exclure du total les épreuves sans note saisie (au lieu de les compter comme 0)
          </span>
        </label>

        <button
          onClick={enregistrerSeuil}
          disabled={saving}
          className="w-full bg-black text-white text-sm py-2 rounded-md disabled:opacity-50"
        >
          Enregistrer
        </button>
      </div>

      {/* Mentions */}
      <div className="border rounded-lg p-4 mb-4">
        <p className="font-semibold text-sm mb-1">Mentions</p>
        <p className="text-xs text-gray-500 mb-3">
          Communes à tout l'établissement — s'appliquent aussi bien aux bulletins qu'aux examens.
        </p>

        <div className="space-y-2 mb-3">
          {Object.entries(mentions)
            .sort((a, b) => b[1] - a[1])
            .map(([nom, seuil]) => (
              <div key={nom} className="flex gap-2 items-center">
                <input
                  type="text"
                  defaultValue={nom}
                  onBlur={(e) => renommerMention(nom, e.target.value)}
                  className="flex-1 border rounded-md px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  step="0.5"
                  value={seuil}
                  onChange={(e) => modifierMention(nom, e.target.value)}
                  className="w-20 border rounded-md px-2 py-1.5 text-sm text-center"
                />
                <span className="text-xs text-gray-400">/20</span>
                <button onClick={() => retirerMention(nom)} className="text-red-600 text-xs">
                  Retirer
                </button>
              </div>
            ))}
        </div>

        <div className="flex gap-2">
          <button onClick={ajouterMention} className="flex-1 border text-sm py-2 rounded-md">
            + Ajouter une mention
          </button>
          <button
            onClick={enregistrerMentions}
            disabled={saving}
            className="flex-1 bg-black text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>

      {/* Verrouillage global */}
      <div className="border rounded-lg p-4 mb-4">
        <p className="font-semibold text-sm mb-3">Verrouillage</p>
        <p className="text-xs text-gray-500 mb-3">
          Verrouille ou déverrouille toutes les matières de l'examen en une seule fois, plutôt qu'une par une.
        </p>
        <div className="flex gap-2">
          <button
            onClick={verrouillerTout}
            disabled={saving}
            className="flex-1 bg-amber-600 text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            Tout verrouiller
          </button>
          <button
            onClick={deverrouillerTout}
            disabled={saving}
            className="flex-1 border border-amber-600 text-amber-700 text-sm py-2 rounded-md disabled:opacity-50"
          >
            Tout déverrouiller
          </button>
        </div>
      </div>

      {/* Archivage */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-1">Archivage</p>
        <p className="text-xs text-gray-500 mb-3">
          Statut actuel : <strong>{statutExamen === 'archive' ? 'Archivé' : 'Actif'}</strong>
        </p>
        <button
          onClick={basculerArchivage}
          className={`w-full text-sm py-2 rounded-md ${
            statutExamen === 'archive' ? 'border' : 'bg-red-600 text-white'
          }`}
        >
          {statutExamen === 'archive' ? "Désarchiver l'examen" : "Archiver l'examen"}
        </button>
      </div>
    </main>
  );
  }
      
