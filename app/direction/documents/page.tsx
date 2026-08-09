'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Eleve = { id: string; matricule: string; nom: string; prenom: string; classe_nom: string | null; classe_id: string | null; sexe: string | null };
type Etablissement = {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  code_etablissement: string | null;
  dren: string | null;
  type_etablissement: string | null;
  annee_scolaire_active: string | null;
  titre_responsable: string | null;
};
type DocumentGenere = {
  id: string;
  type: string;
  numero: string;
  eleve_id: string;
  classe_nom: string | null;
  motif: string | null;
  date_emission: string;
  annee_scolaire: string;
};

const TYPES_DOCUMENT = [
  { value: 'certificat_scolarite', label: 'Certificat de scolarité' },
  { value: 'attestation_reussite', label: 'Attestation de réussite' },
  { value: 'certificat_radiation', label: 'Certificat de radiation' },
];

const TITRES_DOCUMENT: Record<string, string> = {
  certificat_scolarite: 'CERTIFICAT DE SCOLARITÉ',
  attestation_reussite: 'ATTESTATION DE RÉUSSITE',
  certificat_radiation: 'CERTIFICAT DE RADIATION',
};

export default function DocumentsAdministratifsPage() {
  const supabase = createClient();

  const [etablissement, setEtablissement] = useState<Etablissement | null>(null);
  const [etablissementId, setEtablissementId] = useState('');
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [eleveId, setEleveId] = useState('');
  const [typeDocument, setTypeDocument] = useState('certificat_scolarite');
  const [motif, setMotif] = useState('');
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
        .select('nom, adresse, telephone, code_etablissement, dren, type_etablissement, annee_scolaire_active, titre_responsable')
        .eq('id', profil.etablissement_id)
        .single();
      setEtablissement(etab || null);

      const { data: elevesData, error: elevesError } = await supabase
        .from('eleves')
        .select('id, matricule, classe_id, sexe, classes(nom)')
        .eq('etablissement_id', profil.etablissement_id);

      if (elevesError) {
        setMessage({ type: 'error', text: 'Erreur chargement élèves: ' + elevesError.message });
        setLoading(false);
        return;
      }

      const ids = (elevesData || []).map((e) => e.id);
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, nom, prenom')
        .in('id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);

      const profsParId = new Map((profs || []).map((p) => [p.id, p]));

      const listeEleves: Eleve[] = (elevesData || [])
        .map((e: any) => {
          const p = profsParId.get(e.id);
          return {
            id: e.id,
            matricule: e.matricule,
            nom: p?.nom ?? '',
            prenom: p?.prenom ?? '',
            classe_nom: e.classes?.nom ?? null,
            classe_id: e.classe_id,
            sexe: e.sexe,
          };
        })
        .sort((a, b) => a.nom.localeCompare(b.nom));

      setEleves(listeEleves);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const eleveSelectionne = eleves.find((e) => e.id === eleveId);
  const estFille = eleveSelectionne?.sexe === 'F';

  const chargerHistorique = useCallback(async () => {
    if (!eleveId) {
      setHistorique([]);
      return;
    }
    const { data } = await supabase
      .from('documents_administratifs')
      .select('id, type, numero, eleve_id, classe_nom, motif, date_emission, annee_scolaire')
      .eq('eleve_id', eleveId)
      .order('created_at', { ascending: false });
    setHistorique(data || []);
  }, [eleveId, supabase]);

  useEffect(() => {
    chargerHistorique();
    setDocumentGenere(null);
  }, [chargerHistorique]);

  const genererDocument = async () => {
    if (!eleveId || !eleveSelectionne) {
      setMessage({ type: 'error', text: 'Sélectionnez un élève.' });
      return;
    }

    if (typeDocument === 'certificat_radiation' && !motif.trim()) {
      setMessage({ type: 'error', text: 'Précisez le motif de radiation.' });
      return;
    }

    setGenerating(true);
    setMessage(null);

    const { data: userData } = await supabase.auth.getUser();

    const { data: numeroGenere, error: numeroError } = await supabase.rpc('generer_numero_document', {
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
      eleve_id: eleveId,
      type: typeDocument,
      numero: numeroGenere,
      annee_scolaire: etablissement?.annee_scolaire_active || new Date().getFullYear().toString(),
      classe_nom: eleveSelectionne.classe_nom,
      motif: motif.trim() || null,
      genere_par: userData?.user?.id,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('documents_administratifs')
      .insert(nouveauDocument)
      .select()
      .single();

    if (insertError) {
      setMessage({ type: 'error', text: 'Erreur enregistrement: ' + insertError.message });
      setGenerating(false);
      return;
    }

    setDocumentGenere(inserted);
    setMotif('');
    setGenerating(false);
    chargerHistorique();
  };

  const reimprimer = (doc: DocumentGenere) => {
    setDocumentGenere(doc);
    setTimeout(() => window.print(), 200);
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
        <h1 className="text-2xl font-bold">Documents administratifs</h1>

        <div>
          <label className="block text-sm font-medium mb-1">Élève</label>
          <select
            value={eleveId}
            onChange={(e) => setEleveId(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="">-- Sélectionner un élève --</option>
            {eleves.map((e) => (
              <option key={e.id} value={e.id}>{e.nom} {e.prenom} — {e.matricule}</option>
            ))}
          </select>
        </div>

        {eleveId && (
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

            {(typeDocument === 'certificat_radiation' || typeDocument === 'attestation_reussite') && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  {typeDocument === 'certificat_radiation' ? 'Motif de radiation' : 'Mention / décision (optionnel)'}
                </label>
                <input
                  type="text"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  className="w-full border rounded-lg p-2"
                  placeholder={typeDocument === 'certificat_radiation' ? 'Ex: Transfert, abandon...' : 'Ex: Admis en classe supérieure'}
                />
              </div>
            )}

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
                <h3 className="font-semibold text-sm text-gray-700">Documents déjà générés pour cet élève</h3>
                {historique.map((doc) => (
                  <div key={doc.id} className="border rounded-lg p-3 flex justify-between items-center text-sm">
                    <div>
                      <div className="font-medium">{TITRES_DOCUMENT[doc.type]}</div>
                      <div className="text-xs text-gray-500">{doc.numero} — {new Date(doc.date_emission).toLocaleDateString('fr-FR')}</div>
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
      {documentGenere && eleveSelectionne && etablissement && (
        <div className="space-y-4 border-t pt-6 mt-6">
          <button
            onClick={() => window.print()}
            className="no-print w-full bg-green-600 text-white py-2.5 rounded-lg font-medium"
          >
            🖨️ Imprimer ce document
          </button>

          <div className="border p-8 space-y-6">
            <div className="text-center text-xs font-bold leading-tight">
              <div>MINISTÈRE DE L'ÉDUCATION NATIONALE ET DE L'ALPHABÉTISATION</div>
              {etablissement.dren && <div>DRENA {etablissement.dren.toUpperCase()}</div>}
            </div>

            <div className="flex justify-between items-start text-sm border-b pb-3">
              <div>
                <div className="font-bold">{etablissement.nom}</div>
                {etablissement.telephone && <div className="text-xs">Tél : {etablissement.telephone}</div>}
                {etablissement.adresse && <div className="text-xs">{etablissement.adresse}</div>}
              </div>
              <div className="text-right text-xs">
                <div>Année Scolaire : {documentGenere.annee_scolaire}</div>
                {etablissement.code_etablissement && <div>Code : {etablissement.code_etablissement}</div>}
                {etablissement.type_etablissement && <div>Statut : {etablissement.type_etablissement}</div>}
                <div className="mt-1 font-medium">N° {documentGenere.numero}</div>
              </div>
            </div>

            <h2 className="text-center font-bold text-xl underline">
              {TITRES_DOCUMENT[documentGenere.type]}
            </h2>

            <div className="text-sm leading-relaxed pt-4">
              <p>
                Le {etablissement.titre_responsable || 'Chef d\'établissement'} de {etablissement.nom} certifie que :
              </p>

              <p className="mt-4">
                <strong>{eleveSelectionne.nom.toUpperCase()} {eleveSelectionne.prenom}</strong>, matricule N° {eleveSelectionne.matricule},
              </p>

              {documentGenere.type === 'certificat_scolarite' && (
                <p className="mt-4">
                  est régulièrement {estFille ? 'inscrite' : 'inscrit'} dans notre établissement au titre de l'année scolaire {documentGenere.annee_scolaire},
                  en classe de <strong>{documentGenere.classe_nom || eleveSelectionne.classe_nom}</strong>.
                </p>
              )}

              {documentGenere.type === 'attestation_reussite' && (
                <p className="mt-4">
                  a {estFille ? 'suivie' : 'suivi'} avec succès les enseignements de la classe de <strong>{documentGenere.classe_nom || eleveSelectionne.classe_nom}</strong> au
                  titre de l'année scolaire {documentGenere.annee_scolaire}.
                  {documentGenere.motif && <> {documentGenere.motif}.</>}
                </p>
              )}

              {documentGenere.type === 'certificat_radiation' && (
                <p className="mt-4">
                  a été {estFille ? 'radiée' : 'radié'} des effectifs de notre établissement, où {estFille ? 'elle' : 'il'} était {estFille ? 'inscrite' : 'inscrit'} en classe de{' '}
                  <strong>{documentGenere.classe_nom || eleveSelectionne.classe_nom}</strong>, au titre de l'année scolaire {documentGenere.annee_scolaire}.
                  {documentGenere.motif && <> Motif : {documentGenere.motif}.</>}
                </p>
              )}

              <p className="mt-6">
                En foi de quoi, le présent {documentGenere.type === 'certificat_radiation' || documentGenere.type === 'certificat_scolarite' ? 'certificat' : 'attestation'} lui est {estFille ? 'délivrée' : 'délivré'} pour servir et valoir ce que de droit.
              </p>
            </div>

            <div className="flex justify-end pt-8">
              <div className="text-center text-sm">
                <div>Fait le {new Date(documentGenere.date_emission).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div className="mt-1">Le {etablissement.titre_responsable || "Chef d'établissement"}</div>
                <div className="mt-16">___________________________</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  }
