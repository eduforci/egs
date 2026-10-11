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
type Candidat = { eleve_id: string; nom: string; prenom: string; matricule: string; classe_nom: string; numero_table: string | null };
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
  { value: 'emargement', label: "Émargement simple" },
  { value: 'emargement_epreuves', label: 'Émargement par matière (9 cases)' },
  { value: 'convocations', label: 'Convocations' },
  { value: 'etiquettes', label: 'Étiquettes tables' },
  { value: 'pv', label: 'Procès-verbal' },
  { value: 'releves', label: 'Relevés de notes' },
  { value: 'palmares', label: 'Palmarès' },
  { value: 'rapport', label: 'Rapport statistique' },
];

const MATIERES_BEPC_DEFAULT = ["Anglais","Orthographe","Hist-Géo","SVT","Allemand","Espagnol","EDHC","Maths","Phys-Chimie"];
const MATIERES_BAC_DEFAULT = ["Français","Philosophie","Hist-Géo","LV1","LV2","Anglais","Mathématiques","Phys-Chimie","SVT"];

function telechargerCSV(nomFichier: string, lignes: string[][]) {
  const contenu = lignes.map((ligne) => ligne.map((c) => `"${(c?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
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

  const [document, setDocument] = useState('emargement_epreuves');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matieresEpreuves, setMatieresEpreuves] = useState<string[]>(Array(9).fill(''));

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

      const nomUp = (examenData.nom + ' ' + examenData.niveau + ' ' + examenData.type).toUpperCase();
      if(nomUp.includes('BEPC')){
        setMatieresEpreuves(MATIERES_BEPC_DEFAULT);
      } else if(nomUp.includes('BAC')){
        setMatieresEpreuves(MATIERES_BAC_DEFAULT);
      } else {
        setMatieresEpreuves(MATIERES_BAC_DEFAULT);
      }

      const { data: etabData } = await supabase.from('etablissements').select('nom').eq('id', examenData.etablissement_id).single();
      setEtablissementNom(etabData?.nom?? '');

      if (examenData.categorie!== 'interne') {
        const { data: centreData } = await supabase.from('examens_centre').select('nom_centre, code_centre, ville, drena, president_jury, secretaire').eq('examen_id', examenId).maybeSingle();
        setCentre(centreData);
      }

      const { data: candData, error: candError } = await supabase.from('examens_candidats').select('eleve_id, numero_table, eleves(matricule, classes(nom))').eq('examen_id', examenId);
      if (candError) throw new Error(`Erreur candidats : ${candError.message}`);

      type RowC = { eleve_id: string; numero_table: string | null; eleves: { matricule: string; classes: { nom: string } | { nom: string }[] | null } | { matricule: string; classes: { nom: string } | { nom: string }[] | null }[] | null };
      const brut = (candData?? []) as unknown as RowC[];
      const eleveIds = brut.map((r) => r.eleve_id);
      const { data: profilesData } = await supabase.from('profiles').select('id, nom, prenom').in('id', eleveIds.length > 0? eleveIds : ['00000000-0000-0000-0000-000000000000']);
      const profilesMap = new Map((profilesData?? []).map((p) => [p.id, p]));
      const listeCandidats: Candidat[] = brut.map((r) => {
        const ele = Array.isArray(r.eleves)? r.eleves[0] : r.eleves;
        const cl = ele?.classes? (Array.isArray(ele.classes)? ele.classes[0] : ele.classes) : null;
        const profil = profilesMap.get(r.eleve_id);
        return { eleve_id: r.eleve_id, nom: profil?.nom?? 'Inconnu', prenom: profil?.prenom?? '', matricule: ele?.matricule?? '-', classe_nom: cl?.nom?? '-', numero_table: r.numero_table };
      });
      listeCandidats.sort((a, b) => (a.numero_table?? '').localeCompare(b.numero_table?? '') || a.nom.localeCompare(b.nom));
      setCandidats(listeCandidats);

      const [resResultats, resStats, resClasse, resSerie, resMatiere] = await Promise.all([
        supabase.rpc('calculer_resultats_examen', { p_examen_id: examenId }),
        supabase.rpc('calculer_statistiques_examen', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_classe', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_serie', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_matiere', { p_examen_id: examenId }),
      ]);
      setResultats((resResultats.data as Resultat[])?? []);
      setStats(resStats.data as Stats);
      setParClasse((resClasse.data as MoyenneGroupe[])?? []);
      setParSerie((resSerie.data as MoyenneGroupe[])?? []);
      setParMatiere((resMatiere.data as MoyenneMatiere[])?? []);
    } catch (err) { setError(err instanceof Error? err.message : 'Erreur inconnue'); } finally { setLoading(false); }
  }, [examenId, supabase]);

  useEffect(() => { charger(); }, [charger]);

  function exporterEmargementEpreuvesCSV() {
    const lignes = [
      ['N°', 'N° Table', 'Matricule', 'Nom', 'Prénom',...matieresEpreuves],
     ...candidats.map((c,i) => [String(i+1), c.numero_table?? '', c.matricule, c.nom, c.prenom,...Array(matieresEpreuves.length).fill('')])
    ];
    telechargerCSV(`emargement_epreuves_${examen?.nom?? 'examen'}.csv`, lignes);
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;
  if (!examen) return <p className="p-6 text-sm text-red-600">Examen introuvable.</p>;
  const classes = resultats.filter((r) => r.decision === 'Admis' || r.decision === 'Ajourné' || r.decision === 'Refusé');
  const major = classes[0];

  return (
    <main className="p-4 md:p-6 max-w-[1400px] mx-auto pb-16">
      <div className="print:hidden">
        <h1 className="text-xl font-bold mb-1">Documents — {examen.nom}</h1>
        <p className="text-sm text-gray-500 mb-4">Génère et imprime les documents officiels.</p>
        {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}
        <div className="flex flex-wrap gap-1 mb-4">
          {DOCUMENTS.map((d) => (
            <button key={d.value} onClick={() => setDocument(d.value)} className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${document === d.value? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}>{d.label}</button>
          ))}
        </div>

        {document === 'emargement_epreuves' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="font-semibold text-sm mb-2">Configurer les 9 matières (glisse ton ordre) :</p>
            <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
              {matieresEpreuves.map((m,i) => (
                <input key={i} value={m} onChange={(e)=>{ const c=[...matieresEpreuves]; c[i]=e.target.value; setMatieresEpreuves(c); }} placeholder={`Matière ${i+1}`} className="border rounded px-2 py-1.5 text-xs bg-white" />
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={()=>setMatieresEpreuves(MATIERES_BEPC_DEFAULT)} className="text-xs border px-2 py-1 rounded bg-white">Modèle BEPC</button>
              <button onClick={()=>setMatieresEpreuves(MATIERES_BAC_DEFAULT)} className="text-xs border px-2 py-1 rounded bg-white">Modèle BAC</button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={async () => {
              if (!examen) return;
              if (!confirm(`Générer les N° Table pour ${candidats.length} candidats?`)) return;
              setGenerating(true);
              const anneeSuffix = examen.annee_scolaire?.split('-')[1]?.slice(-2) || examen.annee_scolaire?.slice(-2) || '27';
              const nomUp = (examen.nom + ' ' + examen.niveau + ' ' + examen.type).toUpperCase();
              const prefix = nomUp.includes('BEPC')? 'BE' : nomUp.includes('BAC')? 'BA' : nomUp.includes('CEPE')? 'CE' : 'EX';
              try {
                for (const c of candidats) {
                  if (!c.numero_table || c.numero_table === '-') {
                    const suffix = c.matricule? c.matricule.slice(-5) : c.eleve_id.slice(0,5).toUpperCase();
                    const nouveau = `${prefix}${anneeSuffix}-${suffix}`;
                    await supabase.from('examens_candidats').update({ numero_table: nouveau }).eq('examen_id', examenId).eq('eleve_id', c.eleve_id);
                  }
                }
                alert('N° Table générés!'); window.location.reload();
              } catch (e: any) { alert('Erreur: '+e.message); } finally { setGenerating(false); }
            }} disabled={generating} className="px-3 py-2 bg-orange-600 text-white rounded text-sm disabled:opacity-50">
            {generating? 'Génération...' : 'Générer N° Table'}
          </button>
          <button onClick={() => window.print()} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md">Imprimer / Export PDF</button>
          {document === 'emargement_epreuves' && <button onClick={exporterEmargementEpreuvesCSV} className="border text-sm px-4 py-2 rounded-md bg-white">Export Excel (CSV)</button>}
        </div>
      </div>

      <div className="border rounded-lg p-2 md:p-4 print:border-none print:p-0 bg-white text-[11px]">
        <div className="text-center mb-3 border-b pb-2">
          <p className="text-[10px] font-semibold uppercase">{examen.organisateur?? etablissementNom}</p>
          <h2 className="text-sm font-bold mt-1">{examen.nom} — Fiche d'émargement par épreuve</h2>
          <p className="text-[10px] text-gray-500">{examen.niveau}{examen.serie? ` — ${examen.serie}` : ''} · {examen.annee_scolaire} · {candidats.length} candidats</p>
        </div>

        {document === 'emargement_epreuves' && (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border border-black">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-black px-1 py-1 w-6">#</th>
                  <th className="border border-black px-1 py-1 w-20">N° Table</th>
                  <th className="border border-black px-1 py-1 w-20">Matricule</th>
                  <th className="border border-black px-1 py-1 text-left">Nom</th>
                  <th className="border border-black px-1 py-1 text-left">Prénom</th>
                  {matieresEpreuves.map((mat,i) => (
                    <th key={i} className="border border-black px-1 py-1 min-w-[65px] bg-yellow-50">{mat || `Mat ${i+1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidats.map((c, idx) => (
                  <tr key={c.eleve_id} className="h-7">
                    <td className="border border-black px-1 text-center">{idx+1}</td>
                    <td className="border border-black px-1 font-mono font-bold text-center">{c.numero_table?? '-'}</td>
                    <td className="border border-black px-1 text-center">{c.matricule}</td>
                    <td className="border border-black px-1">{c.nom}</td>
                    <td className="border border-black px-1">{c.prenom}</td>
                    {matieresEpreuves.map((_,i) => (
                      <td key={i} className="border border-black px-1"></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[9px] mt-2 text-gray-500">Chaque candidat émarge dans la case de la matière au début de chaque épreuve. Total: {candidats.length} lignes x {matieresEpreuves.length} épreuves.</p>
          </div>
        )}

        {document === 'liste' && (
          <table className="w-full text-xs border"><thead className="bg-gray-100"><tr><th className="text-left px-2 py-1.5">#</th><th className="text-left px-2 py-1.5">N° Table</th><th className="text-left px-2 py-1.5">Nom</th><th className="text-left px-2 py-1.5">Prénom</th><th className="text-left px-2 py-1.5">Matricule</th><th className="text-left px-2 py-1.5">Classe</th></tr></thead><tbody>{candidats.map((c,i)=><tr key={c.eleve_id} className="border-t"><td className="px-2 py-1.5">{i+1}</td><td className="px-2 py-1.5 font-mono font-bold">{c.numero_table?? '-'}</td><td className="px-2 py-1.5">{c.nom}</td><td className="px-2 py-1.5">{c.prenom}</td><td className="px-2 py-1.5">{c.matricule}</td><td className="px-2 py-1.5">{c.classe_nom}</td></tr>)}</tbody></table>
        )}

        {document === 'emargement' && (
          <table className="w-full text-xs border"><thead className="bg-gray-100"><tr><th className="text-left px-2 py-1.5">#</th><th className="text-left px-2 py-1.5">N° Table</th><th className="text-left px-2 py-1.5">Nom et prénom</th><th className="text-left px-2 py-1.5">Signature</th></tr></thead><tbody>{candidats.map((c,i)=><tr key={c.eleve_id} className="border-t"><td className="px-2 py-2">{i+1}</td><td className="px-2 py-2 font-mono font-bold">{c.numero_table?? '-'}</td><td className="px-2 py-2">{c.nom} {c.prenom}</td><td className="px-2 py-2 border-l"></td></tr>)}</tbody></table>
        )}

        {document === 'etiquettes' && (
          <div className="grid grid-cols-3 gap-3">{candidats.map((c)=><div key={c.eleve_id} className="border-2 border-dashed border-black h-[92px] flex justify-center items-center"><span className="text-[26px] font-black font-mono">{c.numero_table||'-'}</span></div>)}</div>
        )}
      </div>

      <style jsx global>{`@media print { @page { size: A4 landscape; margin: 8mm; } body { -webkit-print-color-adjust: exact; } }`}</style>
    </main>
  );
}
