'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Examen = {
  nom: string; categorie: string; type: string; niveau: string; serie: string | null;
  annee_scolaire: string; session: string | null; date_debut: string | null; date_fin: string | null;
  organisateur: string | null; etablissement_id: string;
};
type Centre = {
  nom_centre: string | null; code_centre: string | null; ville: string | null;
  drena: string | null; president_jury: string | null; secretaire: string | null;
};
type Candidat = { eleve_id: string; nom: string; prenom: string; matricule: string; classe_nom: string };
type Resultat = {
  eleve_id: string; nom: string; prenom: string; matricule: string; classe_nom: string;
  moyenne: number; mention: string; rang: number | null; decision: string;
};
type Stats = {
  inscrits: number; presents: number; absents: number; exclus: number;
  admis: number; ajournes: number; pourcentage_admis: number; moyenne_generale: number;
};
type MoyenneGroupe = { classe_nom?: string; serie?: string; nb_candidats: number; moyenne: number; taux_admission: number };
type MoyenneMatiere = { matiere_nom: string; epreuve_nom: string; moyenne: number; nb_notes: number };

const DOCUMENTS = [
  { value: 'liste', label: 'Liste des candidats' },
  { value: 'emargement', label: "Feuille d'émargement" },
  { value: 'convocations', label: 'Convocations' },
  { value: 'pv', label: 'Procès-verbal' },
  { value: 'releves', label: 'Relevés de notes' },
  { value: 'palmares', label: 'Palmarès' },
  { value: 'rapport', label: 'Rapport statistique' },
];

function telechargerCSV(nomFichier: string, lignes: string[][]) {
  const contenu = lignes.map((ligne) => ligne.map((c) => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + contenu], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExamenDocumentsPage() {
  const params = useParams();
  const examenId = params?.id as string;
  const supabase = createClient();

  const [examen, setExamen] = useState<Examen | null>(null);
  const [centre, setCentre] = useState<Centre | null>(null);
  const [etablissementNom, setEtablissementNom] = useState('');
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [parClasse, setParClasse] = useState<MoyenneGroupe[]>([]);
  const [parSerie, setParSerie] = useState<MoyenneGroupe[]>([]);
  const [parMatiere, setParMatiere] = useState<MoyenneMatiere[]>([]);

  const [document, setDocument] = useState('liste');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: examenData, error: examenError } = await supabase
        .from('examens')
        .select('nom, categorie, type, niveau, serie, annee_scolaire, session, date_debut, date_fin, organisateur, etablissement_id')
        .eq('id', examenId)
        .single();

      if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
      setExamen(examenData);

      const { data: etabData } = await supabase
        .from('etablissements')
        .select('nom')
        .eq('id', examenData.etablissement_id)
        .single();
      setEtablissementNom(etabData?.nom ?? '');

      if (examenData.categorie !== 'interne') {
        const { data: centreData } = await supabase
          .from('examens_centre')
          .select('nom_centre, code_centre, ville, drena, president_jury, secretaire')
          .eq('examen_id', examenId)
          .maybeSingle();
        setCentre(centreData);
      }

      const { data: candData, error: candError } = await supabase
        .from('examens_candidats')
        .select('eleve_id, eleves(matricule, classes(nom))')
        .eq('examen_id', examenId);

      if (candError) throw new Error(`Erreur candidats : ${candError.message}`);

      type RowC = { eleve_id: string; eleves: { matricule: string; classes: { nom: string } | { nom: string }[] | null } | { matricule: string; classes: { nom: string } | { nom: string }[] | null }[] | null };
      const brut = (candData ?? []) as unknown as RowC[];
      const eleveIds = brut.map((r) => r.eleve_id);

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, nom, prenom')
        .in('id', eleveIds.length > 0 ? eleveIds : ['00000000-0000-0000-0000-000000000000']);
      const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

      const listeCandidats: Candidat[] = brut.map((r) => {
        const ele = Array.isArray(r.eleves) ? r.eleves[0] : r.eleves;
        const cl = ele?.classes ? (Array.isArray(ele.classes) ? ele.classes[0] : ele.classes) : null;
        const profil = profilesMap.get(r.eleve_id);
        return {
          eleve_id: r.eleve_id,
          nom: profil?.nom ?? 'Inconnu',
          prenom: profil?.prenom ?? '',
          matricule: ele?.matricule ?? '-',
          classe_nom: cl?.nom ?? '-',
        };
      });
      listeCandidats.sort((a, b) => a.nom.localeCompare(b.nom));
      setCandidats(listeCandidats);

      const [resResultats, resStats, resClasse, resSerie, resMatiere] = await Promise.all([
        supabase.rpc('calculer_resultats_examen', { p_examen_id: examenId }),
        supabase.rpc('calculer_statistiques_examen', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_classe', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_serie', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_matiere', { p_examen_id: examenId }),
      ]);

      setResultats((resResultats.data as Resultat[]) ?? []);
      setStats(resStats.data as Stats);
      setParClasse((resClasse.data as MoyenneGroupe[]) ?? []);
      setParSerie((resSerie.data as MoyenneGroupe[]) ?? []);
      setParMatiere((resMatiere.data as MoyenneMatiere[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [examenId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  function exporterListeCandidatsCSV() {
    const lignes = [
      ['Nom', 'Prénom', 'Matricule', 'Classe'],
      ...candidats.map((c) => [c.nom, c.prenom, c.matricule, c.classe_nom]),
    ];
    telechargerCSV(`liste_candidats_${examen?.nom ?? 'examen'}.csv`, lignes);
  }

  function exporterResultatsCSV() {
    const lignes = [
      ['Rang', 'Nom', 'Prénom', 'Matricule', 'Classe', 'Moyenne', 'Mention', 'Décision'],
      ...resultats.map((r) => [
        r.rang?.toString() ?? '', r.nom, r.prenom, r.matricule, r.classe_nom,
        r.moyenne.toString(), r.mention, r.decision,
      ]),
    ];
    telechargerCSV(`resultats_${examen?.nom ?? 'examen'}.csv`, lignes);
  }

  function exporterRapportCSV() {
    const lignes: string[][] = [
      ['Statistiques générales'],
      ['Inscrits', String(stats?.inscrits ?? 0)],
      ['Présents', String(stats?.presents ?? 0)],
      ['Absents', String(stats?.absents ?? 0)],
      ['Exclus', String(stats?.exclus ?? 0)],
      ['Admis', String(stats?.admis ?? 0)],
      ['Non admis', String(stats?.ajournes ?? 0)],
      ['Taux de réussite (%)', String(stats?.pourcentage_admis ?? 0)],
      ['Moyenne générale', String(stats?.moyenne_generale ?? 0)],
      [],
      ['Par classe'],
      ['Classe', 'Candidats', 'Moyenne', 'Taux admission'],
      ...parClasse.map((c) => [c.classe_nom ?? '', String(c.nb_candidats), String(c.moyenne), String(c.taux_admission)]),
      [],
      ['Par série'],
      ['Série', 'Candidats', 'Moyenne', 'Taux admission'],
      ...parSerie.map((s) => [s.serie ?? '', String(s.nb_candidats), String(s.moyenne), String(s.taux_admission)]),
      [],
      ['Par matière'],
      ['Matière', 'Épreuve', 'Moyenne', 'Notes saisies'],
      ...parMatiere.map((m) => [m.matiere_nom, m.epreuve_nom, String(m.moyenne), String(m.nb_notes)]),
    ];
    telechargerCSV(`rapport_${examen?.nom ?? 'examen'}.csv`, lignes);
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;
  if (!examen) return <p className="p-6 text-sm text-red-600">Examen introuvable.</p>;

  const classes = resultats.filter((r) => r.decision === 'Admis' || r.decision === 'Ajourné' || r.decision === 'Refusé');
  const major = classes[0];

  return (
    <main className="p-4 md:p-6 max-w-4xl mx-auto pb-16">
      <div className="print:hidden">
        <h1 className="text-xl font-bold mb-1">Documents — {examen.nom}</h1>
        <p className="text-sm text-gray-500 mb-4">Génère et imprime les documents officiels de l'examen.</p>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
        )}

        <div className="flex flex-wrap gap-1 mb-4">
          {DOCUMENTS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDocument(d.value)}
              className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${
                document === d.value ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => window.print()} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md">
            Imprimer / Export PDF
          </button>
          {document === 'liste' && (
            <button onClick={exporterListeCandidatsCSV} className="border text-sm px-4 py-2 rounded-md">
              Export Excel (CSV)
            </button>
          )}
          {(document === 'releves' || document === 'palmares') && (
            <button onClick={exporterResultatsCSV} className="border text-sm px-4 py-2 rounded-md">
              Export Excel (CSV)
            </button>
          )}
          {document === 'rapport' && (
            <button onClick={exporterRapportCSV} className="border text-sm px-4 py-2 rounded-md">
              Export Excel (CSV)
            </button>
          )}
        </div>
      </div>

      {/* En-tête commun à tous les documents imprimés */}
      <div className="border rounded-lg p-4 print:border-none print:p-0 bg-white text-sm">
        <div className="text-center mb-4 border-b pb-3">
          <p className="text-xs font-semibold uppercase">{examen.organisateur ?? etablissementNom}</p>
          <h2 className="text-base font-bold mt-1">{examen.nom}</h2>
          <p className="text-xs text-gray-500">
            {examen.niveau}{examen.serie ? ` — Série ${examen.serie}` : ''} · {examen.session ?? ''} · {examen.annee_scolaire}
          </p>
        </div>

        {/* LISTE DES CANDIDATS */}
        {document === 'liste' && (
          <>
            <h3 className="font-semibold mb-2">Liste des candidats ({candidats.length})</h3>
            <table className="w-full text-xs border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-2 py-1.5">#</th>
                  <th className="text-left px-2 py-1.5">Nom</th>
                  <th className="text-left px-2 py-1.5">Prénom</th>
                  <th className="text-left px-2 py-1.5">Matricule</th>
                  <th className="text-left px-2 py-1.5">Classe</th>
                </tr>
              </thead>
              <tbody>
                {candidats.map((c, i) => (
                  <tr key={c.eleve_id} className="border-t">
                    <td className="px-2 py-1.5">{i + 1}</td>
                    <td className="px-2 py-1.5">{c.nom}</td>
                    <td className="px-2 py-1.5">{c.prenom}</td>
                    <td className="px-2 py-1.5">{c.matricule}</td>
                    <td className="px-2 py-1.5">{c.classe_nom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* FEUILLE D'ÉMARGEMENT */}
        {document === 'emargement' && (
          <>
            <h3 className="font-semibold mb-2">Feuille d'émargement — Candidats</h3>
            <table className="w-full text-xs border mb-6">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-2 py-1.5">#</th>
                  <th className="text-left px-2 py-1.5">Nom et prénom</th>
                  <th className="text-left px-2 py-1.5">Matricule</th>
                  <th className="text-left px-2 py-1.5">Classe</th>
                  <th className="text-left px-2 py-1.5 w-32">Signature</th>
                </tr>
              </thead>
              <tbody>
                {candidats.map((c, i) => (
                  <tr key={c.eleve_id} className="border-t">
                    <td className="px-2 py-2">{i + 1}</td>
                    <td className="px-2 py-2">{c.nom} {c.prenom}</td>
                    <td className="px-2 py-2">{c.matricule}</td>
                    <td className="px-2 py-2">{c.classe_nom}</td>
                    <td className="px-2 py-2 border-l"></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="font-semibold mb-2">Feuille d'émargement — Surveillants</h3>
            <table className="w-full text-xs border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-2 py-1.5">#</th>
                  <th className="text-left px-2 py-1.5">Nom et prénom</th>
                  <th className="text-left px-2 py-1.5">Fonction</th>
                  <th className="text-left px-2 py-1.5 w-32">Signature</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4].map((n) => (
                  <tr key={n} className="border-t">
                    <td className="px-2 py-3">{n}</td>
                    <td className="px-2 py-3"></td>
                    <td className="px-2 py-3"></td>
                    <td className="px-2 py-3 border-l"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* CONVOCATIONS */}
        {document === 'convocations' && (
          <>
            <h3 className="font-semibold mb-3">Convocations</h3>
            <div className="space-y-4">
              {candidats.map((c) => (
                <div key={c.eleve_id} className="border-2 rounded-lg p-4 break-inside-avoid">
                  <p className="text-center font-semibold text-xs uppercase mb-2">
                    {examen.organisateur ?? etablissementNom}
                  </p>
                  <p className="text-center font-bold mb-3">CONVOCATION</p>
                  <p className="mb-1">Le/la candidat(e) <strong>{c.nom} {c.prenom}</strong> ({c.matricule}, {c.classe_nom})</p>
                  <p className="mb-1">est convoqué(e) pour participer à : <strong>{examen.nom}</strong></p>
                  <p className="mb-1">
                    Du {examen.date_debut ?? '-'} au {examen.date_fin ?? '-'}
                  </p>
                  {centre?.nom_centre && <p className="mb-1">Centre : {centre.nom_centre} ({centre.ville})</p>}
                  <p className="text-xs text-gray-500 mt-3">
                    Se présenter muni(e) d'une pièce d'identité et du matériel requis.
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* PROCÈS-VERBAL */}
        {document === 'pv' && stats && (
          <>
            <h3 className="font-semibold text-center mb-3">PROCÈS-VERBAL DE L'EXAMEN</h3>
            <div className="space-y-1 mb-4">
              <p><span className="text-gray-500">Examen :</span> {examen.nom}</p>
              <p><span className="text-gray-500">Niveau :</span> {examen.niveau}{examen.serie ? ` — Série ${examen.serie}` : ''}</p>
              <p><span className="text-gray-500">Organisateur :</span> {examen.organisateur ?? etablissementNom}</p>
              {centre?.nom_centre && <p><span className="text-gray-500">Centre :</span> {centre.nom_centre} ({centre.code_centre})</p>}
              {centre?.drena && <p><span className="text-gray-500">DRENA :</span> {centre.drena}</p>}
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                ['Inscrits', stats.inscrits], ['Présents', stats.presents],
                ['Absents', stats.absents], ['Exclus', stats.exclus],
                ['Admis', stats.admis], ['Non admis', stats.ajournes],
                ['Taux réussite', `${stats.pourcentage_admis}%`], ['Moyenne', `${stats.moyenne_generale}/20`],
              ].map(([label, val]) => (
                <div key={label as string} className="border rounded p-2 text-center">
                  <p className="font-bold">{val}</p>
                  <p className="text-[9px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            <p className="mb-4">
              Le jury certifie que les épreuves se sont déroulées conformément à la réglementation en vigueur
              et que les résultats ci-dessus reflètent fidèlement les prestations des candidats.
            </p>

            <div className="grid grid-cols-3 gap-4 mt-8 text-center text-xs">
              <div>
                <p className="border-t pt-1">Président du jury</p>
                <p className="text-gray-500">{centre?.president_jury ?? ''}</p>
              </div>
              <div>
                <p className="border-t pt-1">Secrétaire</p>
                <p className="text-gray-500">{centre?.secretaire ?? ''}</p>
              </div>
              <div>
                <p className="border-t pt-1">Chef d'établissement</p>
              </div>
            </div>
          </>
        )}

        {/* RELEVÉS DE NOTES */}
        {document === 'releves' && (
          <>
            <h3 className="font-semibold mb-2">Relevés de notes — Résultats individuels</h3>
            <table className="w-full text-xs border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-2 py-1.5">Rang</th>
                  <th className="text-left px-2 py-1.5">Nom</th>
                  <th className="text-left px-2 py-1.5">Prénom</th>
                  <th className="text-left px-2 py-1.5">Matricule</th>
                  <th className="text-left px-2 py-1.5">Classe</th>
                  <th className="text-left px-2 py-1.5">Moyenne</th>
                  <th className="text-left px-2 py-1.5">Mention</th>
                  <th className="text-left px-2 py-1.5">Décision</th>
                </tr>
              </thead>
              <tbody>
                {resultats.map((r) => (
                  <tr key={r.eleve_id} className="border-t">
                    <td className="px-2 py-1.5">{r.rang ?? '-'}</td>
                    <td className="px-2 py-1.5">{r.nom}</td>
                    <td className="px-2 py-1.5">{r.prenom}</td>
                    <td className="px-2 py-1.5">{r.matricule}</td>
                    <td className="px-2 py-1.5">{r.classe_nom}</td>
                    <td className="px-2 py-1.5">{r.moyenne}/20</td>
                    <td className="px-2 py-1.5">{r.mention}</td>
                    <td className="px-2 py-1.5">{r.decision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* PALMARÈS */}
        {document === 'palmares' && (
          <>
            <h3 className="font-semibold text-center mb-3">PALMARÈS OFFICIEL</h3>
            {major && (
              <div className="border-2 border-amber-400 bg-amber-50 rounded-lg p-3 text-center mb-4">
                <p className="text-[10px] text-amber-700 font-semibold uppercase">Major de l'examen</p>
                <p className="font-bold">{major.nom} {major.prenom} — {major.moyenne}/20</p>
              </div>
            )}
            <table className="w-full text-xs border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-2 py-1.5">Rang</th>
                  <th className="text-left px-2 py-1.5">Nom</th>
                  <th className="text-left px-2 py-1.5">Prénom</th>
                  <th className="text-left px-2 py-1.5">Classe</th>
                  <th className="text-left px-2 py-1.5">Moyenne</th>
                </tr>
              </thead>
              <tbody>
                {classes.slice(0, 20).map((r) => (
                  <tr key={r.eleve_id} className="border-t">
                    <td className="px-2 py-1.5">{r.rang}</td>
                    <td className="px-2 py-1.5">{r.nom}</td>
                    <td className="px-2 py-1.5">{r.prenom}</td>
                    <td className="px-2 py-1.5">{r.classe_nom}</td>
                    <td className="px-2 py-1.5">{r.moyenne}/20</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* RAPPORT STATISTIQUE */}
        {document === 'rapport' && stats && (
          <>
            <h3 className="font-semibold mb-3">Rapport statistique</h3>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                ['Inscrits', stats.inscrits], ['Présents', stats.presents],
                ['Absents', stats.absents], ['Exclus', stats.exclus],
                ['Admis', stats.admis], ['Non admis', stats.ajournes],
                ['Taux réussite', `${stats.pourcentage_admis}%`], ['Moyenne', `${stats.moyenne_generale}/20`],
              ].map(([label, val]) => (
                <div key={label as string} className="border rounded p-2 text-center">
                  <p className="font-bold">{val}</p>
                  <p className="text-[9px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            <p className="font-semibold mb-1">Par classe</p>
            <table className="w-full text-xs border mb-4">
              <thead className="bg-gray-100">
                <tr><th className="text-left px-2 py-1">Classe</th><th className="text-left px-2 py-1">Candidats</th><th className="text-left px-2 py-1">Moyenne</th><th className="text-left px-2 py-1">Taux</th></tr>
              </thead>
              <tbody>
                {parClasse.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1">{c.classe_nom}</td><td className="px-2 py-1">{c.nb_candidats}</td>
                    <td className="px-2 py-1">{c.moyenne}/20</td><td className="px-2 py-1">{c.taux_admission}%</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="font-semibold mb-1">Par série</p>
            <table className="w-full text-xs border mb-4">
              <thead className="bg-gray-100">
                <tr><th className="text-left px-2 py-1">Série</th><th className="text-left px-2 py-1">Candidats</th><th className="text-left px-2 py-1">Moyenne</th><th className="text-left px-2 py-1">Taux</th></tr>
              </thead>
              <tbody>
                {parSerie.map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1">{s.serie}</td><td className="px-2 py-1">{s.nb_candidats}</td>
                    <td className="px-2 py-1">{s.moyenne}/20</td><td className="px-2 py-1">{s.taux_admission}%</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="font-semibold mb-1">Par matière</p>
            <table className="w-full text-xs border">
              <thead className="bg-gray-100">
                <tr><th className="text-left px-2 py-1">Matière</th><th className="text-left px-2 py-1">Épreuve</th><th className="text-left px-2 py-1">Moyenne</th></tr>
              </thead>
              <tbody>
                {parMatiere.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1">{m.matiere_nom}</td><td className="px-2 py-1">{m.epreuve_nom}</td><td className="px-2 py-1">{m.moyenne}/20</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </main>
  );
              }
