'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type MatiereLigne = {
  matiere: string;
  coefficient: number;
  moyenne: number | null;
  total: number | null;
  rang: number | null;
  groupe_bilan: string | null;
  appreciation: string | null;
  professeur: string | null;
};

type BilanGroupe = {
  groupe: string;
  total: number;
  moyenne: number;
  rang: number;
};

type BulletinData = {
  etablissement: {
    nom: string;
    ville: string;
    adresse: string;
    telephone: string;
    code: string | null;
    dren: string | null;
    logo_url: string | null;
    systeme_enseignement: string;
    type_etablissement: string;
    titre_responsable: string;
  };
  eleve: {
    nom: string;
    prenom: string;
    matricule: string;
    sexe: string | null;
    date_naissance: string | null;
    lieu_naissance: string | null;
    nationalite: string | null;
    regime: string | null;
    interne: boolean;
    classe: string;
    effectif: number;
    redoublant: boolean;
  };
  assiduite: {
    heures_absence_justifiees: number;
    heures_absence_non_justifiees: number;
  };
  conseil: {
    appreciation: string | null;
    mention_distinction: string | null;
    professeur_principal: string | null;
  };
  chef_etablissement: string | null;
  trimestre: number;
  annee_scolaire: string;
  date_edition: string;
  matieres: MatiereLigne[];
  bilans: BilanGroupe[];
  totaux: {
    coef_total: number;
    total_general: number;
    moyenne_generale: number;
    rang: number;
    mention: string;
    decision: string;
  };
  classe_stats: {
    moyenne_classe: number;
    moyenne_mini: number;
    moyenne_maxi: number;
  };
};

const MENTIONS_DISTINCTION = [
  { value: 'tableau_honneur_felicitations', label: 'Tableau d\'Honneur + Félicitations' },
  { value: 'tableau_honneur_encouragements', label: 'Tableau d\'Honneur + Encouragements' },
  { value: 'tableau_honneur', label: 'Tableau d\'Honneur' },
  { value: 'avertissement_travail', label: 'Avertissement travail' },
  { value: 'avertissement_conduite', label: 'Avertissement conduite' },
  { value: 'blame_travail', label: 'Blâme travail' },
  { value: 'blame_conduite', label: 'Blâme conduite' },
];

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return '-';
  return n.toString();
}

export default function BulletinPage() {
  const params = useParams();
  const eleveId = params?.eleveId as string;
  const trimestre = Number(params?.trimestre);

  const [bulletin, setBulletin] = useState<BulletinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const chargerBulletin = useCallback(async () => {
    if (!eleveId || !trimestre) return;
    setLoading(true);
    setError(null);

    try {
      const { data: eleveRow, error: eleveError } = await supabase
        .from('eleves')
        .select('etablissement_id')
        .eq('id', eleveId)
        .single();

      if (eleveError) throw new Error(`Erreur récupération élève : ${eleveError.message}`);

      const { data: etabRow, error: etabError } = await supabase
        .from('etablissements')
        .select('annee_scolaire_active')
        .eq('id', eleveRow.etablissement_id)
        .single();

      if (etabError) throw new Error(`Erreur récupération établissement : ${etabError.message}`);

      const { data, error: rpcError } = await supabase.rpc('generer_bulletin', {
        p_eleve_id: eleveId,
        p_trimestre: trimestre,
        p_annee_scolaire: etabRow.annee_scolaire_active,
      });

      if (rpcError) throw new Error(`Erreur génération bulletin : ${rpcError.message}`);

      setBulletin(data as BulletinData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [eleveId, trimestre, supabase]);

  useEffect(() => {
    chargerBulletin();
  }, [chargerBulletin]);

  if (loading) {
    return <p className="p-6 text-sm text-gray-500">Génération du bulletin en cours...</p>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3">
          <strong>Erreur :</strong> {error}
        </div>
      </div>
    );
  }

  if (!bulletin) {
    return <p className="p-6 text-sm text-gray-500">Aucune donnée disponible.</p>;
  }

  const matieresLettres = bulletin.matieres.filter((m) => m.groupe_bilan === 'Lettres');
  const matieresSciences = bulletin.matieres.filter((m) => m.groupe_bilan === 'Sciences');
  const matieresAutres = bulletin.matieres.filter((m) => !m.groupe_bilan);

  const bilanLettres = bulletin.bilans.find((b) => b.groupe === 'Lettres');
  const bilanSciences = bulletin.bilans.find((b) => b.groupe === 'Sciences');

  const renderLigneMatiere = (m: MatiereLigne, i: number) => (
    <tr key={i} className="border-t">
      <td className="px-2 py-1.5">{m.matiere}</td>
      <td className="px-2 py-1.5 text-center">{fmt(m.coefficient)}</td>
      <td className="px-2 py-1.5 text-center">{fmt(m.moyenne)}</td>
      <td className="px-2 py-1.5 text-center">{fmt(m.total)}</td>
      <td className="px-2 py-1.5 text-center">{m.rang ? `${m.rang}e` : '-'}</td>
      <td className="px-2 py-1.5">{m.appreciation ?? '-'}</td>
      <td className="px-2 py-1.5 text-xs">{m.professeur ?? '-'}</td>
    </tr>
  );

  const renderLigneBilan = (label: string, bilan: BilanGroupe | undefined) => (
    <tr className="bg-gray-100 font-semibold border-t border-b">
      <td className="px-2 py-1.5" colSpan={2}>{label}</td>
      <td className="px-2 py-1.5 text-center">{bilan ? `${bilan.moyenne}/20` : '-'}</td>
      <td className="px-2 py-1.5 text-center">{bilan ? bilan.total : '-'}</td>
      <td className="px-2 py-1.5 text-center" colSpan={3}>
        RANG : {bilan ? `${bilan.rang}e` : '-'}
      </td>
    </tr>
  );

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto print:p-0">
      <div className="flex justify-end mb-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md"
        >
          Imprimer / PDF
        </button>
      </div>

      <div className="border rounded-lg p-4 md:p-6 bg-white">
        {/* En-tête ministériel */}
        <div className="text-center mb-4 border-b pb-4">
          {bulletin.etablissement.dren && (
            <p className="text-xs text-gray-600">{bulletin.etablissement.dren}</p>
          )}
          <h1 className="text-lg font-bold mt-1">BULLETIN TRIMESTRIEL DE NOTES</h1>
          <p className="text-sm">Trimestre {bulletin.trimestre}</p>
          <p className="text-xs text-gray-500">Année scolaire {bulletin.annee_scolaire}</p>
        </div>

        {/* Infos établissement */}
        <div className="flex justify-between text-xs mb-4 flex-wrap gap-2">
          <div>
            <p><strong>Établissement :</strong> {bulletin.etablissement.nom}</p>
            <p><strong>Adresse :</strong> {bulletin.etablissement.adresse}, {bulletin.etablissement.ville}</p>
            <p><strong>Téléphone :</strong> {bulletin.etablissement.telephone}</p>
          </div>
          {bulletin.etablissement.code && (
            <div>
              <p><strong>Code :</strong> {bulletin.etablissement.code}</p>
            </div>
          )}
        </div>

        {/* Infos élève */}
        <div className="border-t border-b py-3 mb-4 text-sm">
          <p className="font-bold uppercase mb-1">
            {bulletin.eleve.nom} {bulletin.eleve.prenom}
          </p>
          <div className="grid grid-cols-2 gap-x-4 text-xs">
            <p>Matricule : {bulletin.eleve.matricule}</p>
            <p>Sexe : {bulletin.eleve.sexe ?? '-'}</p>
            <p>Classe : {bulletin.eleve.classe}</p>
            <p>Effectif : {bulletin.eleve.effectif}</p>
            <p>Né(e) le : {bulletin.eleve.date_naissance ?? '-'} à {bulletin.eleve.lieu_naissance ?? '-'}</p>
            <p>Nationalité : {bulletin.eleve.nationalite ?? '-'}</p>
            <p>Régime : {bulletin.eleve.regime ?? '-'}</p>
            <p>Redoublant(e) : {bulletin.eleve.redoublant ? 'Oui' : 'Non'}</p>
          </div>
        </div>

        {/* Tableau des matières */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left">Matière</th>
                <th className="px-2 py-1.5">Coef</th>
                <th className="px-2 py-1.5">Moy.</th>
                <th className="px-2 py-1.5">Total</th>
                <th className="px-2 py-1.5">Rang</th>
                <th className="px-2 py-1.5 text-left">Appréciation</th>
                <th className="px-2 py-1.5 text-left">Professeur</th>
              </tr>
            </thead>
            <tbody>
              {matieresLettres.map(renderLigneMatiere)}
              {matieresLettres.length > 0 && renderLigneBilan('BILAN LETTRES', bilanLettres)}

              {matieresSciences.map(renderLigneMatiere)}
              {matieresSciences.length > 0 && renderLigneBilan('BILAN SCIENCES', bilanSciences)}

              {matieresAutres.map(renderLigneMatiere)}
            </tbody>
            <tfoot>
              <tr className="bg-gray-800 text-white font-bold">
                <td className="px-2 py-1.5" colSpan={2}>TOTAUX</td>
                <td className="px-2 py-1.5 text-center">{bulletin.totaux.coef_total}</td>
                <td className="px-2 py-1.5 text-center">{bulletin.totaux.total_general}</td>
                <td className="px-2 py-1.5 text-center" colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Résultats */}
        <div className="grid grid-cols-2 gap-4 mt-4 text-xs">
          <div className="border rounded p-3">
            <p className="font-semibold mb-1">Moyenne trimestrielle</p>
            <p className="text-lg font-bold">{bulletin.totaux.moyenne_generale}/20</p>
            <p>Rang : {bulletin.totaux.rang}e sur {bulletin.eleve.effectif}</p>
            <p>Mention : {bulletin.totaux.mention}</p>
            <p className="font-semibold mt-1">
              Décision :{' '}
              <span className={bulletin.totaux.decision === 'Admis(e)' ? 'text-green-600' : 'text-red-600'}>
                {bulletin.totaux.decision}
              </span>
            </p>
          </div>
          <div className="border rounded p-3">
            <p className="font-semibold mb-1">Résultats de classe</p>
            <p>Moyenne de la classe : {bulletin.classe_stats.moyenne_classe}/20</p>
            <p>Moyenne mini : {bulletin.classe_stats.moyenne_mini}/20</p>
            <p>Moyenne maxi : {bulletin.classe_stats.moyenne_maxi}/20</p>
          </div>
        </div>

        {/* Assiduité */}
        <div className="border rounded p-3 mt-4 text-xs">
          <p className="font-semibold mb-1">Assiduité</p>
          <p>Absences justifiées : {bulletin.assiduite.heures_absence_justifiees}h</p>
          <p>Absences non justifiées : {bulletin.assiduite.heures_absence_non_justifiees}h</p>
        </div>

        {/* Mentions du conseil */}
        <div className="border rounded p-3 mt-4 text-xs">
          <p className="font-semibold mb-2">Mentions du conseil de classe</p>
          <div className="grid grid-cols-2 gap-1">
            {MENTIONS_DISTINCTION.map((m) => (
              <label key={m.value} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={bulletin.conseil.mention_distinction === m.value}
                  readOnly
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        {/* Appréciation du conseil */}
        <div className="border rounded p-3 mt-4 text-xs">
          <p className="font-semibold mb-1">Appréciation du conseil de classe</p>
          <p>{bulletin.conseil.appreciation ?? '-'}</p>
          <p className="mt-2 text-gray-500">
            Professeur principal : {bulletin.conseil.professeur_principal ?? '-'}
          </p>
        </div>

        {/* Signatures */}
        <div className="flex justify-between mt-6 text-xs">
          <p>Fait le {bulletin.date_edition}</p>
          <div className="text-center">
            <p className="font-semibold">{bulletin.etablissement.titre_responsable}</p>
            <p className="mt-8">{bulletin.chef_etablissement ?? ''}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
  
