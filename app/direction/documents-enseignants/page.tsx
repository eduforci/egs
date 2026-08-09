'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Enseignant = {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  specialite: string | null;
  sexe: string | null;
  date_embauche: string | null;
};

type Etablissement = {
  nom: string;
  ville: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  code_etablissement: string | null;
  dren: string | null;
  type_etablissement: string | null;
  annee_scolaire_active: string | null;
};

type DocumentGenere = {
  id: string;
  type: string;
  numero: string;
  enseignant_id: string;
  poste: string | null;
  classes_tenues: string | null;
  date_debut_contrat: string | null;
  date_fin_contrat: string | null;
  ville_signature: string | null;
  date_emission: string;
  annee_scolaire: string;
};

const TYPES_DOCUMENT = [
  { value: 'attestation_fin_contrat', label: 'Attestation de fin de contrat' },
  { value: 'certificat_travail', label: 'Certificat de travail' },
];

const TITRES_DOCUMENT: Record<string, string> = {
  attestation_fin_contrat: 'ATTESTATION DE FIN DE CONTRAT',
  certificat_travail: 'CERTIFICAT DE TRAVAIL',
};

const TITRES_SIGNATAIRE = [
  'Directeur des Études',
  'Directrice des Études',
  "Chef d'établissement",
  'Directeur',
  'Directrice',
];

export default function DocumentsEnseignantsPage() {
  const supabase = createClient();

  const [etablissement, setEtablissement] = useState<Etablissement | null>(null);
  const [etablissementId, setEtablissementId] = useState('');
  const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
  const [enseignantId, setEnseignantId] = useState('');
  const [typeDocument, setTypeDocument] = useState('attestation_fin_contrat');

  const [nomSignataire, setNomSignataire] = useState('');
  const [titreSignataire, setTitreSignataire] = useState('Directeur des Études');
  const [poste, setPoste] = useState('');
  const [classesTenues, setClassesTenues] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [villeSignature, setVilleSignature] = useState('');

  const [documentGenere, setDocumentGenere] = useState<DocumentGenere | null>(null);
  const [historique, setHistorique] = useState<DocumentGenere[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', userData.user.id)
        .single();

      if (!profil?.etablissement_id) return;
      setEtablissementId(profil.etablissement_id);

      const { data: etab } = await supabase
        .from('etablissements')
        .select('nom, ville, adresse, telephone, email, code_etablissement, dren, type_etablissement, annee_scolaire_active')
        .eq('id', profil.etablissement_id)
        .single();
      setEtablissement(etab || null);
      setVilleSignature(etab?.ville || '');

      const { data: ens, error } = await supabase
        .from('enseignants')
        .select('id, matricule, specialite, sexe, date_embauche')
        .eq('etablissement_id', profil.etablissement_id);

      if (error) {
        setMessage({ type: 'error', text: 'Erreur chargement enseignants: ' + error.message });
        setLoading(false);
        return;
      }

      if (!ens || ens.length === 0) {
        setEnseignants([]);
        setLoading(false);
        return;
      }

      const idsEns = ens.map((e) => e.id);
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, nom, prenom')
        .in('id', idsEns);

      const profsParId = new Map((profs || []).map((p) => [p.id, p]));

      const liste: Enseignant[] = ens
        .map((e) => {
          const p = profsParId.get(e.id);
          return {
            id: e.id,
            matricule: e.matricule,
            specialite: e.specialite,
            sexe: e.sexe,
            date_embauche: e.date_embauche,
            nom: p?.nom ?? '',
            prenom: p?.prenom ?? '',
          };
        })
        .sort((a, b) => a.nom.localeCompare(b.nom));

      setEnseignants(liste);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const enseignantSelectionne = enseignants.find((e) => e.id === enseignantId);
  const estFille = enseignantSelectionne?.sexe === 'F';

  const chargerHistorique = useCallback(async () => {
    if (!enseignantId) {
      setHistorique([]);
      return;
    }
    const { data } = await supabase
      .from('documents_enseignants')
      .select('id, type, numero, enseignant_id, poste, classes_tenues, date_debut_contrat, date_fin_contrat, ville_signature, date_emission, annee_scolaire')
      .eq('enseignant_id', enseignantId)
      .order('created_at', { ascending: false });
    setHistorique(data || []);
  }, [enseignantId, supabase]);

  useEffect(() => {
    chargerHistorique();
    setDocumentGenere(null);
    if (enseignantSelectionne) {
      setPoste(enseignantSelectionne.specialite ? `Professeur de ${enseignantSelectionne.specialite}` : '');
      setDateDebut(enseignantSelectionne.date_embauche || '');
    }
  }, [enseignantId, chargerHistorique]);

  const genererDocument = async () => {
    if (!enseignantId || !enseignantSelectionne) {
      setMessage({ type: 'error', text: 'Sélectionnez un enseignant.' });
      return;
    }
    if (!nomSignataire.trim()) {
      setMessage({ type: 'error', text: 'Indiquez le nom du signataire.' });
      return;
    }
    if (!dateDebut || !dateFin) {
      setMessage({ type: 'error', text: 'Précisez les dates de début et de fin.' });
      return;
    }
    if (typeDocument === 'certificat_travail' && !poste.trim()) {
      setMessage({ type: 'error', text: 'Précisez le poste occupé.' });
      return;
    }

    setGenerating(true);
    setMessage(null);

    const { data: userData } = await supabase.auth.getUser();

    const { data: numeroGenere, error: numeroError } = await supabase.rpc('generer_numero_document_enseignant', {
      p_etablissement_id: etablissementId,
      p_type: typeDocument,
    });

    if (numeroError) {
      setMessage({ type: 'error', text: 'Erreur génération numéro: ' + numeroError.message });
      setGenerating(false);
      return;
    }

    const nouveauDocument = {
      etablissement_id: etablissementId,
      enseignant_id: enseignantId,
      type: typeDocument,
      numero: numeroGenere,
      annee_scolaire: etablissement?.annee_scolaire_active || new Date().getFullYear().toString(),
      poste: poste.trim() || null,
      classes_tenues: classesTenues.trim() || null,
      date_debut_contrat: dateDebut,
      date_fin_contrat: dateFin,
      ville_signature: villeSignature.trim() || null,
      nom_signataire: nomSignataire.trim(),
      titre_signataire: titreSignataire,
      genere_par: userData?.user?.id,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('documents_enseignants')
      .insert(nouveauDocument)
      .select()
      .single();

    if (insertError) {
      setMessage({ type: 'error', text: 'Erreur enregistrement: ' + insertError.message });
      setGenerating(false);
      return;
    }

    setDocumentGenere(inserted);
    setGenerating(false);
    chargerHistorique();
  };

  const reimprimer = (doc: any) => {
    setDocumentGenere(doc);
    setTimeout(() => window.print(), 200);
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          @page { margin: 15mm; }
        }
      `}</style>

      <div className="no-print space-y-3">
        <h1 className="text-2xl font-bold">Documents enseignants</h1>

        <div>
          <label className="block text-sm font-medium mb-1">Enseignant</label>
          <select
            value={enseignantId}
            onChange={(e) => setEnseignantId(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="">-- Sélectionner un enseignant --</option>
            {enseignants.map((e) => (
              <option key={e.id} value={e.id}>{e.nom} {e.prenom} — {e.matricule}</option>
            ))}
          </select>
        </div>

        {enseignantId && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Type de document</label>
              <select
                value={typeDocument}
                onChange={(e) => setTypeDocument(e.target.value)}
                className="w-full border rounded-lg p-2"
              >
                {TYPES_DOCUMENT.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Signataire</p>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Nom complet du signataire</label>
                  <input
                    type="text"
                    value={nomSignataire}
                    onChange={(e) => setNomSignataire(e.target.value)}
                    className="w-full border rounded-lg p-2"
                    placeholder="Ex: Gueugba Manha Herman"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Titre du signataire</label>
                  <select
                    value={titreSignataire}
                    onChange={(e) => setTitreSignataire(e.target.value)}
                    className="w-full border rounded-lg p-2"
                  >
                    {TITRES_SIGNATAIRE.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Poste occupé (par l'enseignant)</label>
              <input
                type="text"
                value={poste}
                onChange={(e) => setPoste(e.target.value)}
                className="w-full border rounded-lg p-2"
                placeholder="Ex: Professeur d'anglais"
              />
            </div>

            {typeDocument === 'certificat_travail' && (
              <div>
                <label className="block text-sm font-medium mb-1">Classes tenues</label>
                <input
                  type="text"
                  value={classesTenues}
                  onChange={(e) => setClassesTenues(e.target.value)}
                  className="w-full border rounded-lg p-2"
                  placeholder="Ex: 6e à la 3e"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1">Date de début</label>
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="w-full border rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date de fin</label>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="w-full border rounded-lg p-2"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Ville de signature</label>
              <input
                type="text"
                value={villeSignature}
                onChange={(e) => setVilleSignature(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
            </div>

            {message && (
              <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {message.text}
              </div>
            )}

            <button
              onClick={genererDocument}
              disabled={generating}
              className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
            >
              {generating ? 'Génération...' : 'Générer le document'}
            </button>

            {historique.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <h3 className="font-semibold text-sm text-gray-700">Documents déjà générés</h3>
                {historique.map((doc: any) => (
                  <div key={doc.id} className="border rounded-lg p-3 flex justify-between items-center text-sm">
                    <div>
                      <div className="font-medium">{TITRES_DOCUMENT[doc.type]}</div>
                      <div className="text-xs text-gray-500">{doc.numero} — {formatDate(doc.date_emission)}</div>
                    </div>
                    <button onClick={() => reimprimer(doc)} className="text-blue-600 text-sm">
                      🖨️ Réimprimer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* APERCU IMPRIMABLE */}
      {documentGenere && enseignantSelectionne && etablissement && (
        <div className="space-y-4 border-t pt-6 mt-6">
          <button
            onClick={() => window.print()}
            className="no-print w-full bg-green-600 text-white py-2.5 rounded-lg font-medium"
          >
            🖨️ Imprimer ce document
          </button>

          <div className="border p-8 space-y-6">
            <div className="flex justify-between items-start text-xs">
              <div className="leading-tight">
                <div className="font-bold">MINISTÈRE DE L'ÉDUCATION NATIONALE</div>
                <div>{etablissement.dren ? `DREN ${etablissement.dren.toUpperCase()}` : ''}</div>
                <div className="mt-2">{etablissement.nom}</div>
                {etablissement.email && <div>Email : {etablissement.email}</div>}
                {etablissement.telephone && <div>Tél : {etablissement.telephone}</div>}
                {etablissement.code_etablissement && <div>Code : {etablissement.code_etablissement}</div>}
              </div>
              <div className="text-right leading-tight">
                <div className="font-bold">RÉPUBLIQUE DE CÔTE D'IVOIRE</div>
                <div>Union - Discipline - Travail</div>
                <div className="mt-2">Année scolaire : {(documentGenere as any).annee_scolaire}</div>
                <div className="mt-1 font-medium">N° {(documentGenere as any).numero}</div>
              </div>
            </div>

            <h2 className="text-center font-bold text-xl border-2 inline-block px-6 py-2 mx-auto block w-fit">
              {TITRES_DOCUMENT[(documentGenere as any).type]}
            </h2>

            <div className="text-sm leading-relaxed pt-4">
              {(documentGenere as any).type === 'attestation_fin_contrat' ? (
                <>
                  <p>Je soussigné(e),</p>
                  <p className="mt-2">
                    <strong>{(documentGenere as any).nom_signataire || nomSignataire},</strong>
                  </p>
                  <p className="mt-1">
                    {(documentGenere as any).titre_signataire || titreSignataire}{' '}
                    {etablissement.type_etablissement === 'college' ? 'du Collège' : "de l'établissement"}{' '}
                    <strong>{etablissement.nom}</strong>
                    {etablissement.ville && <> (Situé à {etablissement.ville}),</>}
                  </p>
                  <p className="mt-2">Atteste que :</p>
                  <p className="mt-2">
                    <strong>M. {enseignantSelectionne.nom.toUpperCase()} {enseignantSelectionne.prenom}</strong>,
                  </p>
                  <p className="mt-1">{(documentGenere as any).poste || 'Enseignant'},</p>
                  <p className="mt-3">
                    a exercé au sein de notre établissement du <strong>{formatDate((documentGenere as any).date_debut_contrat)}</strong> au{' '}
                    <strong>{formatDate((documentGenere as any).date_fin_contrat)}</strong>, dans le cadre d'un contrat de travail à durée déterminée.
                  </p>
                  <p className="mt-3">
                    Durant cette période, {estFille ? 'elle' : 'il'} a assuré ses fonctions avec sérieux, professionnalisme et engagement.
                    {estFille ? ' Elle a contribué' : ' Il a contribué'} à la formation académique des élèves et au bon fonctionnement de l'établissement.
                  </p>
                  <p className="mt-3">
                    Le présent contrat est arrivé à son terme le <strong>{formatDate((documentGenere as any).date_fin_contrat)}</strong>.
                  </p>
                  <p className="mt-3">
                    La présente attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Je soussigné(e) <strong>{(documentGenere as any).nom_signataire || nomSignataire}</strong>, en qualité de{' '}
                    {(documentGenere as any).titre_signataire || titreSignataire} de <strong>{etablissement.nom}</strong>, certifie que :
                  </p>
                  <p className="mt-3">
                    <strong>M. {enseignantSelectionne.nom.toUpperCase()} {enseignantSelectionne.prenom}</strong> a été {estFille ? 'employée' : 'employé'}{' '}
                    dans notre établissement du <strong>{formatDate((documentGenere as any).date_debut_contrat)}</strong> au{' '}
                    <strong>{formatDate((documentGenere as any).date_fin_contrat)}</strong> et a occupé le poste de <strong>{(documentGenere as any).poste}</strong>
                    {(documentGenere as any).classes_tenues && <> et a tenu les classes de <strong>{(documentGenere as any).classes_tenues}</strong></>}.
                  </p>
                  <p className="mt-3">
                    {estFille ? 'Elle' : 'Il'} nous quitte à la date du <strong>{formatDate((documentGenere as any).date_fin_contrat)}</strong>.
                  </p>
                  <p className="mt-3">
                    En foi de quoi, nous lui délivrons ce certificat pour servir et valoir ce que de droit.
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end pt-8">
              <div className="text-center text-sm">
                <div>Fait à {(documentGenere as any).ville_signature || etablissement.ville || '—'}, le {new Date((documentGenere as any).date_emission).toLocaleDateString('fr-FR')}</div>
                <div className="mt-1">Signature et cachet du {(documentGenere as any).titre_signataire || titreSignataire}</div>
                <div className="mt-16">___________________________</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
