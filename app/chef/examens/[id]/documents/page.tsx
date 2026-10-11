'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Examen = {
  nom: string; categorie: string; type: string; niveau: string; serie: string | null;
  annee_scolaire: string; session: string | null; date_debut: string | null; date_fin: string | null;
  organisateur: string | null; etablissement_id: string;
};
type Centre = { nom_centre: string | null; code_centre: string | null; ville: string | null; drena: string | null; president_jury: string | null; secretaire: string | null; };
type Candidat = { eleve_id: string; nom: string; prenom: string; matricule: string; classe_nom: string; numero_table: string | null };
type Resultat = { eleve_id: string; nom: string; prenom: string; matricule: string; classe_nom: string; moyenne: number; mention: string; rang: number | null; decision: string; };
type Stats = { inscrits: number; presents: number; absents: number; exclus: number; admis: number; ajournes: number; pourcentage_admis: number; moyenne_generale: number; };
type MoyenneGroupe = { classe_nom?: string; serie?: string; nb_candidats: number; moyenne: number; taux_admission: number };
type MoyenneMatiere = { matiere_nom: string; epreuve_nom: string; moyenne: number; nb_notes: number };

const DOCUMENTS = [
  { value: 'liste', label: 'Liste des candidats' },
  { value: 'emargement', label: "Émargement simple" },
  { value: 'emargement_epreuves', label: 'Émargement par matière (15/salle)' },
  { value: 'convocations', label: 'Convocations' },
  { value: 'etiquettes', label: 'Étiquettes tables' },
  { value: 'pv', label: 'Procès-verbal' },
  { value: 'releves', label: 'Relevés de notes' },
  { value: 'palmares', label: 'Palmarès' },
  { value: 'rapport', label: 'Rapport statistique' },
];

const MATIERES_BEPC_DEFAULT = ["Anglais","Orthographe","Hist-Géo","SVT","Allemand","Espagnol","EDHC","Maths","Phys-Chimie"];
const MATIERES_BAC_DEFAULT = ["Français","Philosophie","Hist-Géo","LV1","LV2","Anglais","Mathématiques","Phys-Chimie","SVT"];
const TAILLE_SALLE = 15;

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for(let i=0; i<arr.length; i+=size) res.push(arr.slice(i, i+size));
  return res;
}

export default function ExamenDocumentsPage() {
  const params = useParams(); const examenId = params?.id as string; const supabase = createClient();
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
  const [matieresEpreuves, setMatieresEpreuves] = useState<string[]>(MATIERES_BAC_DEFAULT);

  const charger = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: examenData, error: examenError } = await supabase.from('examens').select('nom, categorie, type, niveau, serie, annee_scolaire, session, date_debut, date_fin, organisateur, etablissement_id').eq('id', examenId).single();
      if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
      if(!examenData) throw new Error('Examen introuvable');
      setExamen(examenData);
      // FIX ICI : examenData peut être null
      const nomUp = `${examenData.nom||''} ${examenData.niveau||''} ${examenData.type||''}`.toUpperCase();
      if(nomUp.includes('BEPC')) setMatieresEpreuves(MATIERES_BEPC_DEFAULT); else setMatieresEpreuves(MATIERES_BAC_DEFAULT);
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
      setResultats((resResultats.data as Resultat[])?? []); setStats(resStats.data as Stats);
      setParClasse((resClasse.data as MoyenneGroupe[])?? []); setParSerie((resSerie.data as MoyenneGroupe[])?? []); setParMatiere((resMatiere.data as MoyenneMatiere[])?? []);
    } catch (err) { setError(err instanceof Error? err.message : 'Erreur inconnue'); } finally { setLoading(false); }
  }, [examenId, supabase]);

  useEffect(() => { charger(); }, [charger]);

  const salles = chunk(candidats, TAILLE_SALLE);

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;
  if (!examen) return <p className="p-6 text-sm text-red-600">Examen introuvable.</p>;

  return (
    <main className="p-4 md:p-6 max-w-[1600px] mx-auto pb-16">
      <div className="print:hidden">
        <h1 className="text-xl font-bold mb-1">Documents — {examen.nom}</h1>
        <p className="text-sm text-gray-500 mb-1">{candidats.length} candidats • {salles.length} salle(s) de {TAILLE_SALLE} max • {examen.annee_scolaire} • Séries: jamais mélanger A1/A2/C/D</p>
        {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}
        <div className="flex flex-wrap gap-1 mb-4">{DOCUMENTS.map((d) => (<button key={d.value} onClick={() => setDocument(d.value)} className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${document === d.value? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}>{d.label}</button>))}</div>

        {document === 'emargement_epreuves' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="font-semibold text-sm mb-2">Matières à émarger (9 cases - modifiable) : {salles.length} salle(s)</p>
            <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
              {matieresEpreuves.map((m,i) => (<input key={i} value={m} onChange={(e)=>{ const c=[...matieresEpreuves]; c[i]=e.target.value; setMatieresEpreuves(c); }} placeholder={`Matière ${i+1}`} className="border rounded px-2 py-1.5 text-xs bg-white" />))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={()=>setMatieresEpreuves(MATIERES_BEPC_DEFAULT)} className="text-xs border px-2 py-1 rounded bg-white">Modèle BEPC</button>
              <button onClick={()=>setMatieresEpreuves(MATIERES_BAC_DEFAULT)} className="text-xs border px-2 py-1 rounded bg-white">Modèle BAC</button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={async () => {
              if (!examen) return; if (!confirm(`Générer les N° Table pour ${candidats.length} candidats?`)) return; setGenerating(true);
              const anneeSuffix = examen.annee_scolaire?.split('-')[1]?.slice(-2) || examen.annee_scolaire?.slice(-2) || '27';
              const nomUp = `${examen.nom||''} ${examen.niveau||''} ${examen.type||''}`.toUpperCase();
              const prefix = nomUp.includes('BEPC')? 'BE' : nomUp.includes('BAC')? 'BA' : 'EX';
              try { for (const c of candidats) { if (!c.numero_table || c.numero_table === '-') { const suffix = c.matricule? c.matricule.slice(-5) : c.eleve_id.slice(0,5).toUpperCase(); const nouveau = `${prefix}${anneeSuffix}-${suffix}`; await supabase.from('examens_candidats').update({ numero_table: nouveau }).eq('examen_id', examenId).eq('eleve_id', c.eleve_id); } } alert('N° Table générés!'); window.location.reload(); } catch (e: any) { alert('Erreur: '+e.message); } finally { setGenerating(false); }
            }} disabled={generating} className="px-3 py-2 bg-orange-600 text-white rounded text-sm disabled:opacity-50">{generating? 'Génération...' : 'Générer N° Table'}</button>
          <button onClick={() => window.print()} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md">{DOCUMENTS.find(d=>d.value===document)?.label} — Imprimer / PDF</button>
        </div>
      </div>

      <div className="bg-white text-[11px]">
        {/* EMARGEMENT PAR MATIERE */}
        {document === 'emargement_epreuves' && salles.map((groupe, idxSalle) => (
          <div key={idxSalle} className="mb-8 border rounded-lg p-2 md:p-3 print:border-none print:mb-0 print:break-after-page">
            <div className="text-center mb-2 border-b pb-2 flex justify-between items-end">
              <div className="text-left">
                <p className="text-[10px] font-semibold uppercase">{examen.organisateur?? etablissementNom}</p>
                <h2 className="text-[12px] font-bold">SALLE {idxSalle+1} — {examen.nom} — Émargement par épreuve</h2>
                <p className="text-[9px] text-gray-500">{groupe.length} élèves • {examen.annee_scolaire}</p>
              </div>
              <div className="text-right text-[9px]"><p>Président:.................</p><p>Surveillant:.................</p></div>
            </div>
            <table className="w-full text-[9px] border border-black border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-black px-1 py-1 w-6">#</th>
                  <th className="border border-black px-1 py-1 w-[70px]">N° Table</th>
                  <th className="border border-black px-1 py-1 text-left">Nom</th>
                  <th className="border border-black px-1 py-1 text-left">Prénom</th>
                  {matieresEpreuves.map((mat,i) => (<th key={i} className="border border-black px-1 py-1 min-w-[52px] bg-yellow-50">{mat || `Mat ${i+1}`}</th>))}
                </tr>
              </thead>
              <tbody>
                {groupe.map((c, idx) => (
                  <tr key={c.eleve_id} className="h-[28px]">
                    <td className="border border-black px-1 text-center">{idxSalle*TAILLE_SALLE + idx+1}</td>
                    <td className="border border-black px-1 font-mono font-bold text-center text-[8px]">{c.numero_table?? '-'}</td>
                    <td className="border border-black px-1">{c.nom}</td>
                    <td className="border border-black px-1">{c.prenom}</td>
                    {matieresEpreuves.map((_,i) => (<td key={i} className="border border-black px-1"></td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* LISTE */}
        {document === 'liste' && (
          <div className="mb-8">
            <h3 className="font-bold mb-2 text-sm">Liste des candidats — {candidats.length} avec N° Table</h3>
            <table className="w-full text-xs border"><thead className="bg-gray-100"><tr><th className="text-left px-2 py-1.5">#</th><th className="text-left px-2 py-1.5">N° Table</th><th className="text-left px-2 py-1.5">Nom</th><th className="text-left px-2 py-1.5">Prénom</th><th className="text-left px-2 py-1.5">Matricule</th><th className="text-left px-2 py-1.5">Classe</th><th className="text-left px-2 py-1.5">Salle</th></tr></thead><tbody>{candidats.map((c,i)=><tr key={c.eleve_id} className="border-t"><td className="px-2 py-1.5">{i+1}</td><td className="px-2 py-1.5 font-mono font-bold">{c.numero_table?? '-'}</td><td className="px-2 py-1.5">{c.nom}</td><td className="px-2 py-1.5">{c.prenom}</td><td className="px-2 py-1.5">{c.matricule}</td><td className="px-2 py-1.5">{c.classe_nom}</td><td className="px-2 py-1.5">{Math.floor(i/TAILLE_SALLE)+1}</td></tr>)}</tbody></table>
          </div>
        )}

        {/* ETIQUETTES */}
        {document === 'etiquettes' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {candidats.map((c)=>(
              <div key={c.eleve_id} className="border-2 border-black p-6 text-center h-[120px] flex flex-col justify-center items-center bg-white print:break-inside-avoid">
                <div className="text-[10px] font-bold tracking-widest">TABLE N°</div>
                <div className="font-black text-2xl mt-2 tracking-wider">{c.numero_table?? '-'}</div>
              </div>
            ))}
          </div>
        )}
        {/* RELEVES - TOUS LES CANDIDATS ENSEMBLE */}
        {document === 'releves' && (
          <div>
            <h3 className="font-bold text-sm mb-2">Relevés de notes — Tous les candidats et leurs notes ensemble ({resultats.length || candidats.length})</h3>
            <table className="w-full text-[9px] border border-collapse">
              <thead className="bg-gray-100"><tr><th className="border px-1 py-1">N° Table</th><th className="border px-1 py-1">Nom & Prénoms</th><th className="border px-1 py-1">Classe</th>{parMatiere.slice(0,9).map(m=><th key={m.matiere_nom} className="border px-1 py-1">{m.matiere_nom.substring(0,5)}</th>)}<th className="border px-1 py-1">Moy</th><th className="border px-1 py-1">Mention</th><th className="border px-1 py-1">Décision</th></tr></thead>
              <tbody>
                {(resultats.length>0? resultats : candidats.map(c=>({eleve_id:c.eleve_id, nom:c.nom, prenom:c.prenom, matricule:c.matricule, classe_nom:c.classe_nom, moyenne:0, mention:'-', rang:null, decision:'-'} as any))).map((r:any,i)=>(
                  <tr key={r.eleve_id} className="border-t"><td className="border px-1 py-1 font-mono">{candidats.find(c=>c.eleve_id===r.eleve_id)?.numero_table||'-'}</td><td className="border px-1 py-1">{r.nom} {r.prenom}</td><td className="border px-1 py-1">{r.classe_nom}</td>{parMatiere.slice(0,9).map(m=><td key={m.matiere_nom} className="border px-1 py-1"></td>)}<td className="border px-1 py-1 font-bold">{r.moyenne?.toFixed?.(2)??''}</td><td className="border px-1 py-1">{r.mention}</td><td className="border px-1 py-1">{r.decision}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* AUTRES DOCUMENTS SIMPLIFIES POUR BUILD */}
        {['emargement','convocations','pv','palmares','rapport'].includes(document) && (
          <div className="p-4 text-xs">
            <h3 className="font-bold mb-2">{DOCUMENTS.find(d=>d.value===document)?.label} — {candidats.length} candidats • {salles.length} salles</h3>
            <p className="text-gray-600">Le tableau s'affiche par salle de 15 max comme l'émargement.</p>
            {salles.map((g,idx)=><div key={idx} className="mt-4 border p-2"><div className="font-bold">Salle {idx+1} - {g.length} candidats</div><table className="w-full mt-1 text-[10px] border"><thead><tr><th className="border px-1">#</th><th className="border px-1">N° Table</th><th className="border px-1">Nom</th><th className="border px-1">Prénom</th></tr></thead><tbody>{g.map((c:any,i:number)=><tr key={c.eleve_id} className="border-t"><td className="border px-1">{idx*15+i+1}</td><td className="border px-1 font-mono font-bold">{c.numero_table}</td><td className="border px-1">{c.nom}</td><td className="border px-1">{c.prenom}</td></tr>)}</tbody></table></div>)}
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print { @page { size: A4 landscape; margin: 6mm; }.print\\:break-after-page { break-after: page; } body { -webkit-print-color-adjust: exact; } }
      `}</style>
    </main>
  );
   }
