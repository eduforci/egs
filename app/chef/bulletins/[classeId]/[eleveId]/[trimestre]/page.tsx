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
    photo_url: string | null;
  };
  assiduite: {
    absences_justifiées: number;      // ✅ CORRIGÉ
    absences_non_justifiées: number;   // ✅ CORRIGÉ
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
  matieres: MatiereLigne[] | null;
  bilans: BilanGroupe[] | null;
  totaux: {
    coef_total: number;
    total_general: number;
    moyenne_generale: number;
    rang: number;
    mention: string;
    decision: string;
  } | null;
  classe_stats: {
    moyenne_classe: number | null;
    moyenne_mini: number | null;
    moyenne_maxi: number | null;
  };
};

const MENTIONS_DISTINCTION = [
  { value: 'tableau_honneur_felicitations', label: 'Tabl. Honneur + Félicitations' },
  { value: 'tableau_honneur_encouragements', label: 'Tabl. Honneur + Encouragements' },
  { value: 'tableau_honneur', label: 'Tableau d\'Honneur' },
  { value: 'avertissement_travail', label: 'Avertissement travail' },
  { value: 'avertissement_conduite', label: 'Avertissement conduite' },
  { value: 'blame_travail', label: 'Blâme travail' },
  { value: 'blame_conduite', label: 'Blâme conduite' },
];

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return '-';
  return n.toFixed(2);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '-';
  const [annee, mois, jour] = d.split('-');
  if (!annee || !mois || !jour) return d;
  return `${jour}/${mois}/${annee}`;
}
export default function BulletinPage() {
  const params = useParams();
  const classeId = params?.classeId as string;
  const eleveId = params?.eleveId as string;
  const trimestre = Number(params?.trimestre);

  const [bulletin, setBulletin] = useState<BulletinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [anneeScolaire, setAnneeScolaire] = useState<string>('');
  const [modeEdition, setModeEdition] = useState(false);
  const [enseignants, setEnseignants] = useState<{ id: string; nom: string; prenom: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [formAbsJust, setFormAbsJust] = useState('0');
  const [formAbsNonJust, setFormAbsNonJust] = useState('0');
  const [formAppreciation, setFormAppreciation] = useState('');
  const [formMention, setFormMention] = useState('');
  const [formProfPrincipalId, setFormProfPrincipalId] = useState('');
  const [formRedoublant, setFormRedoublant] = useState(false);

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
      setEtablissementId(eleveRow.etablissement_id);

      const { data: etabRow, error: etabError } = await supabase
        .from('etablissements')
        .select('annee_scolaire_active')
        .eq('id', eleveRow.etablissement_id)
        .single();

      if (etabError) throw new Error(`Erreur récupération établissement : ${etabError.message}`);
      setAnneeScolaire(etabRow.annee_scolaire_active);

      const { data: profsData } = await supabase
        .from('profiles')
        .select('id, nom, prenom')
        .eq('etablissement_id', eleveRow.etablissement_id)
        .in('role', ['enseignant', 'educateur']);
      setEnseignants(profsData ?? []);

      const { data, error: rpcError } = await supabase.rpc('generer_bulletin', {
        p_eleve_id: eleveId,
        p_trimestre: trimestre,
        p_annee_scolaire: etabRow.annee_scolaire_active,
      });

      if (rpcError) throw new Error(`Erreur génération bulletin : ${rpcError.message}`);

      const bulletinData = data as BulletinData | null;

      if (!bulletinData) {
        setBulletin(null);
        setError("Aucune note n'a encore été saisie pour cet élève ce trimestre. Le bulletin ne peut pas encore être généré.");
        return;
      }

      setBulletin(bulletinData);

      // ✅ CORRIGÉ
      setFormAbsJust(String(bulletinData.assiduite.absences_justifiées ?? 0));
      setFormAbsNonJust(String(bulletinData.assiduite.absences_non_justifiées ?? 0));
      setFormAppreciation(bulletinData.conseil.appreciation ?? '');
      setFormMention(bulletinData.conseil.mention_distinction ?? '');
      setFormRedoublant(bulletinData.eleve.redoublant ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [eleveId, trimestre, supabase]);

  useEffect(() => {
    chargerBulletin();
  }, [chargerBulletin]);

  async function enregistrerInfosManuelles() {
    if (!etablissementId || !classeId) return;
    setSaving(true);
    setSaveError(null);

    const { error: upsertError } = await supabase.from('bulletins_infos').upsert(
      {
        eleve_id: eleveId,
        classe_id: classeId,
        trimestre,
        annee_scolaire: anneeScolaire,
        etablissement_id: etablissementId,
        absences_justifiees: parseFloat(formAbsJust) || 0,           // ✅ CORRIGÉ
        absences_non_justifiees: parseFloat(formAbsNonJust) || 0,     // ✅ CORRIGÉ
        appreciation_conseil: formAppreciation.trim() || null,
        mention_distinction: formMention || null,
        professeur_principal_id: formProfPrincipalId || null,
        redoublant: formRedoublant,
      },
      { onConflict: 'eleve_id,trimestre,annee_scolaire' }
    );

    setSaving(false);

    if (upsertError) {
      setSaveError(`Erreur enregistrement : ${upsertError.message}`);
      return;
    }

    setModeEdition(false);
    chargerBulletin();
  }

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

  const matieres = bulletin.matieres ?? [];
  const bilans = bulletin.bilans ?? [];

  const matieresLettres = matieres.filter((m) => m.groupe_bilan === 'Lettres');
  const matieresSciences = matieres.filter((m) => m.groupe_bilan === 'Sciences');
  const matieresAutres = matieres.filter((m) => !m.groupe_bilan);

  const bilanLettres = bilans.find((b) => b.groupe === 'Lettres');
  const bilanSciences = bilans.find((b) => b.groupe === 'Sciences');

  const renderLigneMatiere = (m: MatiereLigne, i: number) => (
    <tr key={i} className="border-t">
      <td className="px-1.5 py-1">{m.matiere}</td>
      <td className="px-1.5 py-1 text-center">{fmt(m.moyenne)}</td>
      <td className="px-1.5 py-1 text-center">{fmt(m.coefficient)}</td>
      <td className="px-1.5 py-1 text-center">{fmt(m.total)}</td>
      <td className="px-1.5 py-1 text-center">{m.rang ? `${m.rang}e` : '-'}</td>
      <td className="px-1.5 py-1">{m.appreciation ?? '-'}</td>
      <td className="px-1.5 py-1 text-[9px]">{m.professeur ?? '-'}</td>
      <td className="px-1.5 py-1 border-l"></td>
    </tr>
  );

  const renderLigneBilan = (label: string, bilan: BilanGroupe | undefined) => (
    <tr className="bg-gray-100 font-semibold border-t border-b">
      <td className="px-1.5 py-1" colSpan={2}>{label}</td>
      <td className="px-1.5 py-1 text-center">{bilan ? `${bilan.moyenne}/20` : '-'}</td>
      <td className="px-1.5 py-1 text-center">{bilan ? bilan.total : '-'}</td>
      <td className="px-1.5 py-1 text-center" colSpan={4}>
        RANG : {bilan ? `${bilan.rang}e` : '-'}
      </td>
    </tr>
  );

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto print:p-0 print:max-w-none">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 8mm;
          }
          html, body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="flex justify-end gap-2 mb-4 print:hidden">
        <button
          onClick={() => setModeEdition((v) => !v)}
          className="bg-gray-700 text-white text-sm px-4 py-2 rounded-md"
        >
          {modeEdition ? 'Fermer l\'édition' : 'Modifier'}
        </button>
        <button
          onClick={() => window.print()}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md"
        >
          Imprimer / PDF
        </button>
      </div>

      {modeEdition && (
        <div className="border rounded-lg p-4 mb-4 bg-yellow-50 print:hidden text-sm space-y-3">
          <p className="font-semibold">Modifier les informations du bulletin</p>

          {saveError && (
            <div className="bg-red-50 border border-red-300 text-red-700 text-xs rounded-md p-2">
              {saveError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Absences justifiées (h)</label>
              <input
                type="number"
                value={formAbsJust}
                onChange={(e) => setFormAbsJust(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Absences non justifiées (h)</label>
              <input
                type="number"
                value={formAbsNonJust}
                onChange={(e) => setFormAbsNonJust(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Professeur principal</label>
            <select
              value={formProfPrincipalId}
              onChange={(e) => setFormProfPrincipalId(e.target.value)}
              className="w-full border rounded-md px-2 py-1.5"
            >
              <option value="">Non renseigné</option>
              {enseignants.map((p) => (
                <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Mention du conseil de classe</label>
            <select
              value={formMention}
              onChange={(e) => setFormMention(e.target.value)}
              className="w-full border rounded-md px-2 py-1.5"
            >
              <option value="">Aucune</option>
              {MENTIONS_DISTINCTION.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Appréciation du conseil de classe</label>
            <textarea
              value={formAppreciation}
              onChange={(e) => setFormAppreciation(e.target.value)}
              rows={2}
              className="w-full border rounded-md px-2 py-1.5"
            />
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={formRedoublant}
              onChange={(e) => setFormRedoublant(e.target.checked)}
            />
            Élève redoublant(e)
          </label>

          <button
            onClick={enregistrerInfosManuelles}
            disabled={saving}
            className="w-full bg-black text-white rounded-md py-2 disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      )}

      <div className="border rounded-lg p-4 md:p-6 print:p-0 print:border-none bg-white text-[11px] print:text-[9px] leading-tight">
        {/* En-tête ministériel */}
        <div className="flex justify-between items-start border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            {bulletin.etablissement.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bulletin.etablissement.logo_url}
                alt="Logo établissement"
                className="h-12 w-12 print:h-9 print:w-9 object-contain"
              />
            )}
            <div>
              <p className="text-[9px] font-semibold uppercase leading-tight">
                Ministère de l&apos;Éducation Nationale, de l&apos;Enseignement
                <br />
                Technique et de la Formation Professionnelle
              </p>
              {bulletin.etablissement.dren && (
                <p className="text-[9px] text-gray-600">{bulletin.etablissement.dren}</p>
              )}
            </div>
          </div>
          <div className="text-right text-[9px]">
            <p>Année scolaire</p>
            <p className="font-semibold">{bulletin.annee_scolaire}</p>
            {bulletin.etablissement.code && <p>Code : {bulletin.etablissement.code}</p>}
            {bulletin.etablissement.telephone && <p>Tél : {bulletin.etablissement.telephone}</p>}
          </div>
        </div>

        <div className="text-center mb-2">
          <h1 className="text-sm font-bold">BULLETIN TRIMESTRIEL DE NOTES</h1>
          <p className="text-[10px]">Trimestre {bulletin.trimestre}</p>
        </div>

        {/* Infos établissement */}
        <div className="text-[9px] mb-2">
          <p><strong>Établissement :</strong> {bulletin.etablissement.nom}</p>
          <p><strong>Adresse :</strong> {bulletin.etablissement.adresse}, {bulletin.etablissement.ville} · {bulletin.etablissement.telephone}</p>
        </div>

        {/* Infos élève */}
        <div className="border-t border-b py-1.5 mb-2 flex justify-between items-start gap-2">
          <div>
            <p className="font-bold uppercase text-[11px]">
              {bulletin.eleve.nom} {bulletin.eleve.prenom}
            </p>
            <div className="grid grid-cols-2 gap-x-4 text-[9px]">
              <p>Matricule : {bulletin.eleve.matricule}</p>
              <p>Sexe : {bulletin.eleve.sexe ?? '-'}</p>
              <p>Classe : {bulletin.eleve.classe}</p>
              <p>Effectif : {bulletin.eleve.effectif}</p>
              <p>Né(e) le : {fmtDate(bulletin.eleve.date_naissance)} à {bulletin.eleve.lieu_naissance ?? '-'}</p>
              <p>Nationalité : {bulletin.eleve.nationalite ?? '-'}</p>
              <p>Régime : {bulletin.eleve.regime ?? '-'}</p>
              <p>Redoublant(e) : {bulletin.eleve.redoublant ? 'Oui' : 'Non'}</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(
                `EGS|${bulletin.eleve.matricule}|T${bulletin.trimestre}|${bulletin.annee_scolaire}`
              )}`}
              alt="QR code de vérification"
              className="h-10 w-10 print:h-9 print:w-9"
            />
            {bulletin.eleve.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bulletin.eleve.photo_url}
                alt="Photo élève"
                className="h-16 w-14 print:h-14 print:w-12 object-cover border flex-shrink-0 grayscale"
              />
            ) : (
              <div className="h-16 w-14 print:h-14 print:w-12 border flex items-center justify-center text-[8px] text-gray-400 flex-shrink-0">
                Photo
              </div>
            )}
          </div>
        </div>

        {/* Tableau des matières */}
        <table className="w-full border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-1.5 py-1 text-left">Matière</th>
              <th className="px-1.5 py-1">Moy.</th>
              <th className="px-1.5 py-1">Coef</th>
              <th className="px-1.5 py-1">Total</th>
              <th className="px-1.5 py-1">Rang</th>
              <th className="px-1.5 py-1 text-left">Appréciation</th>
              <th className="px-1.5 py-1 text-left">Professeur</th>
              <th className="px-1.5 py-1 text-left print:w-16">Signature</th>
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
              <td className="px-1.5 py-1" colSpan={2}>TOTAUX</td>
              <td className="px-1.5 py-1 text-center">{bulletin.totaux?.coef_total ?? '-'}</td>
              <td className="px-1.5 py-1 text-center">{fmt(bulletin.totaux?.total_general ?? null)}</td>
              <td className="px-1.5 py-1 text-center" colSpan={4}></td>
            </tr>
          </tfoot>
        </table>

        {/* Résultats */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="border rounded p-1.5">
            <p className="font-semibold">Moyenne trimestrielle</p>
            {bulletin.totaux ? (
              <>
                <p className="text-sm font-bold">{fmt(bulletin.totaux.moyenne_generale)}/20</p>
                <p>Rang : {bulletin.totaux.rang}e sur {bulletin.eleve.effectif}</p>
                <p>Mention : {bulletin.totaux.mention}</p>
                <p className="font-semibold">
                  Décision :{' '}
                  <span className={bulletin.totaux.decision === 'Admis(e)' ? 'text-green-600' : 'text-red-600'}>
                    {bulletin.totaux.decision}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-gray-400">Aucune note saisie ce trimestre.</p>
            )}
          </div>
          <div className="border rounded p-1.5">
            <p className="font-semibold">Résultats de classe</p>
            
      <p>Moyenne classe : {fmt(bulletin.classe_stats.moyenne_classe)}/20</p>
            <p>Moyenne mini : {fmt(bulletin.classe_stats.moyenne_mini)}/20</p>
            <p>Moyenne maxi : {fmt(bulletin.classe_stats.moyenne_maxi)}/20</p>
          </div>
        </div>

        {/* Assiduité */}
        <div className="mt-2 border rounded p-1.5">
          <p className="font-semibold">Assiduité</p>
          <div className="flex gap-4 text-[9px]">
            <p>Absences justifiées : {bulletin.assiduite.absences_justifiees}h</p>
            <p>Absences non justifiées : {bulletin.assiduite.absences_non_justifiees}h</p>
          </div>
        </div>

        {/* Mentions du conseil */}
        <div className="mt-2 border rounded p-1.5">
          <p className="font-semibold">Mentions du conseil de classe</p>
          <div className="grid grid-cols-2 gap-x-4 text-[9px]">
            <div>
              <p className="font-medium">Distinctions</p>
              <div className="space-y-0.5">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={formMention === 'tableau_honneur_felicitations'} readOnly />
                  Tabl. Honneur + Félicitations
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={formMention === 'tableau_honneur_encouragements'} readOnly />
                  Tabl. Honneur + Encouragements
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={formMention === 'tableau_honneur'} readOnly />
                  Tableau d'Honneur
                </label>
              </div>
            </div>
            <div>
              <p className="font-medium">Sanctions</p>
              <div className="space-y-0.5">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={formMention === 'avertissement_travail'} readOnly />
                  Avertissement travail
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={formMention === 'avertissement_conduite'} readOnly />
                  Avertissement conduite
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={formMention === 'blame_travail'} readOnly />
                  Blâme travail
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={formMention === 'blame_conduite'} readOnly />
                  Blâme conduite
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Appréciation */}
        <div className="mt-2 border rounded p-1.5">
          <p className="font-semibold">Appréciation du conseil de classe</p>
          <p>{bulletin.conseil.appreciation || '-'}</p>
        </div>

        {/* Pied de page */}
        <div className="mt-2 flex justify-between text-[8px] border-t pt-1.5">
          <div>
            <p>Professeur principal : {bulletin.conseil.professeur_principal || '-'}</p>
          </div>
          <div className="text-right">
            <p>Fait le {fmtDate(bulletin.date_edition)}</p>
            <p className="font-semibold">{bulletin.chef_etablissement || '-'}</p>
            <p>Chef d'établissement</p>
          </div>
        </div>
      </div>
    </div>
  );
                  }
