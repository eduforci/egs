'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Examen = { nom: string; categorie: string; type: string; niveau: string; serie: string | null; annee_scolaire: string; session: string | null; date_debut: string | null; date_fin: string | null; organisateur: string | null; etablissement_id: string; };
type Centre = { nom_centre: string | null; code_centre: string | null; ville: string | null; drena: string | null; president_jury: string | null; secretaire: string | null; };
type Candidat = { eleve_id: string; nom: string; prenom: string; matricule: string; classe_nom: string; numero_table: string | null; serie: string | null; };
type Resultat = { eleve_id: string; nom: string; prenom: string; matricule: string; classe_nom: string; moyenne: number; mention: string; rang: number | null; decision: string; };
type Stats = { inscrits: number; presents: number; absents: number; exclus: number; admis: number; ajournes: number; pourcentage_admis: number; moyenne_generale: number; };
type MoyenneGroupe = { classe_nom?: string; serie?: string; nb_candidats: number; moyenne: number; taux_admission: number };
type MoyenneMatiere = { matiere_nom: string; epreuve_nom: string; moyenne: number; nb_notes: number };

const DOCUMENTS = [
  { value: 'liste', label: 'Liste des candidats' },
  { value: 'emargement', label: 'Émargement simple' },
  { value: 'emargement_epreuves', label: 'Émargement par matière (15/salle)' },
  { value: 'convocations', label: 'Convocations' },
  { value: 'etiquettes', label: 'Étiquettes tables' },
  { value: 'pv', label: 'Procès-verbal' },
  { value: 'releves', label: 'Relevés de notes' },
  { value: 'palmares', label: 'Palmarès' },
  { value: 'rapport', label: 'Rapport statistique' },
];

const MATIERES_BEPC = ["Anglais","Orthographe","Hist-Géo","SVT","Allemand","Espagnol","EDHC","Maths","Phys-Chimie"];
const MATIERES_PAR_SERIE: Record<string,string[]> = {
  A1: ["Français","Philosophie","Hist-Géo","LV1","LV2","Mathématiques","Anglais","",""],
  A2: ["Français","Philosophie","Hist-Géo","LV1","LV2","Anglais","Mathématiques","",""],
  C: ["Mathématiques","Phys-Chimie","SVT","Français","Philosophie","Hist-Géo","LV1","Anglais",""],
  D: ["Mathématiques","Phys-Chimie","SVT","Français","Philosophie","Hist-Géo","LV1","Anglais",""],
}
const TAILLE_SALLE = 15;
const ORDRE_SERIES = ["A1","A2","C","D"];

function chunk<T>(arr: T[], size: number){ const r:T[][]=[]; for(let i=0;i<arr.length;i+=size) r.push(arr.slice(i,i+size)); return r; }
function detectSerie(nomClasse:string, serieBDD:string|null){
  if(serieBDD){ const s=serieBDD.trim().toUpperCase(); if(["A1","A2","C","D"].includes(s)) return s; }
  const up = (nomClasse||'').toUpperCase();
  if(up.includes('A1')) return 'A1'; if(up.includes('A2')) return 'A2';
  if(up.match(/\bC\b/) || up.includes(' TLE C') || up.includes('1ERE C')) return 'C';
  if(up.match(/\bD\b/) || up.includes(' TLE D') || up.includes('1ERE D')) return 'D';
  return null;
}
function BtnPrint({label}:{label:string}){
  return <div className="print:hidden flex gap-2 mb-3"><button onClick={()=>window.print()} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-md">{label} — Imprimer / PDF</button></div>;
}

export default function ExamenDocumentsPage() {
  const params = useParams(); const examenId = params?.id as string; const supabase = createClient();
  const [examen, setExamen] = useState<Examen | null>(null);
  const [centre, setCentre] = useState<Centre | null>(null);
  const [etabNom, setEtabNom] = useState('');
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [parClasse, setParClasse] = useState<MoyenneGroupe[]>([]);
  const [parSerie, setParSerie] = useState<MoyenneGroupe[]>([]);
  const [parMatiere, setParMatiere] = useState<MoyenneMatiere[]>([]);
  const [document, setDocument] = useState('liste');
  const [loading, setLoading] = useState(true); const [matieres, setMatieres] = useState<string[]>(MATIERES_PAR_SERIE["A2"]);

  const charger = useCallback(async () => {
    setLoading(true);
    try{
      const { data: examenData } = await supabase.from('examens').select('nom,categorie,type,niveau,serie,annee_scolaire,session,date_debut,date_fin,organisateur,etablissement_id').eq('id', examenId).single();
      setExamen(examenData as any);
      const isBEPC = (examenData.nom+' '+examenData.niveau).toUpperCase().includes('BEPC');
      if(isBEPC) setMatieres(MATIERES_BEPC); else if(examenData.serie && MATIERES_PAR_SERIE[examenData.serie]) setMatieres(MATIERES_PAR_SERIE[examenData.serie]);

      const { data: etab } = await supabase.from('etablissements').select('nom').eq('id', examenData.etablissement_id).single(); setEtabNom(etab?.nom||'');
      const { data: cd } = await supabase.from('examens_centre').select('nom_centre, code_centre, ville, drena, president_jury, secretaire').eq('examen_id', examenId).maybeSingle(); setCentre(cd as any);

      const { data: candData } = await supabase.from('examens_candidats').select('eleve_id, numero_table, eleves(matricule, serie, classes(nom, serie))').eq('examen_id', examenId);
      const brut = (candData??[]) as any[]; const ids = brut.map(r=>r.eleve_id);
      const { data: profs } = await supabase.from('profiles').select('id,nom,prenom').in('id', ids.length?ids:['00000000-0000-0000-0000-000000000000']);
      const map = new Map((profs??[]).map((p:any)=>[p.id,p]));
      const liste: Candidat[] = brut.map(r=>{
        const ele = Array.isArray(r.eleves)?r.eleves[0]:r.eleves; const cl = ele?.classes? (Array.isArray(ele.classes)?ele.classes[0]:ele.classes):null;
        const p = map.get(r.eleve_id);
        const serie = isBEPC? null : detectSerie(cl?.nom||'', ele?.serie || cl?.serie || null) || examenData.serie || null;
        return { eleve_id:r.eleve_id, nom:p?.nom||'Inconnu', prenom:p?.prenom||'', matricule:ele?.matricule||'-', classe_nom:cl?.nom||'-', numero_table:r.numero_table, serie };
      });
      liste.sort((a,b)=>{ const sA=ORDRE_SERIES.indexOf(a.serie||''), sB=ORDRE_SERIES.indexOf(b.serie||''); if(sA!==sB) return (sA===-1?99:sA)-(sB===-1?99:sB); return a.classe_nom.localeCompare(b.classe_nom); });
      setCandidats(liste);

      const [rRes, rStats, rCl, rSe, rMa] = await Promise.all([
        supabase.rpc('calculer_resultats_examen', { p_examen_id: examenId }),
        supabase.rpc('calculer_statistiques_examen', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_classe', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_serie', { p_examen_id: examenId }),
        supabase.rpc('calculer_moyennes_par_matiere', { p_examen_id: examenId }),
      ]);
      setResultats((rRes.data as any)??[]); setStats(rStats.data as any); setParClasse((rCl.data as any)??[]); setParSerie((rSe.data as any)??[]); setParMatiere((rMa.data as any)??[]);
    }catch(e){ console.error(e); } finally { setLoading(false); }
  }, [examenId, supabase]);
  useEffect(()=>{ charger(); }, [charger]);

  if(loading) return <p className="p-6">Chargement...</p>;
  if(!examen) return <p className="p-6">Examen introuvable</p>;

  const isBEPC = (examen.nom+' '+examen.niveau).toUpperCase().includes('BEPC');
  const groupesMap = new Map<string, Candidat[]>();
  if(isBEPC){ groupesMap.set('BEPC', candidats); }
  else { for(const c of candidats){ const key=`${c.serie||'SS'}__${c.classe_nom}`; if(!groupesMap.has(key)) groupesMap.set(key, []); groupesMap.get(key)!.push(c); } }
  const clesTriees = Array.from(groupesMap.keys()).sort((a,b)=>{ if(isBEPC) return 0; const sA=a.split('__')[0], sB=b.split('__')[0]; return ORDRE_SERIES.indexOf(sA)-ORDRE_SERIES.indexOf(sB) || a.localeCompare(b); });
  const salles: { serie:string; classe:string; candidats:Candidat[]; numSalleSerie:number; global:number }[] = [];
  const compteur = new Map<string, number>(); let globalIdx=1;
  for(const key of clesTriees){ const list=groupesMap.get(key)!; const [serie, classe]=key.split('__'); const chs=chunk(list, TAILLE_SALLE); chs.forEach(g=>{ const num=(compteur.get(serie)||0)+1; compteur.set(serie,num); salles.push({ serie, classe, candidats:g, numSalleSerie:num, global:globalIdx++ }); }); }
  const allCands = salles.flatMap(s=>s.candidats);
  const major = [...resultats].sort((a,b)=>b.moyenne-a.moyenne)[0];

  return (
    <main className="p-4 md:p-6 max-w-[1600px] mx-auto pb-16">
      <div className="print:hidden">
        <h1 className="text-xl font-bold">Documents — {examen.nom} — {candidats.length} candidats — {salles.length} salle(s) de 15 max</h1>
        <p className="text-sm text-gray-500 mb-2">{examen.annee_scolaire} • Séries détectées: {Array.from(new Set(candidats.map(c=>c.serie))).join(', ')||'BEPC'} • Règle CI: jamais mélanger A1/A2/C/D</p>
        <div className="flex flex-wrap gap-1 mb-4">{DOCUMENTS.map(d=><button key={d.value} onClick={()=>setDocument(d.value)} className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${document===d.value?'bg-black text-white':'bg-gray-100 text-gray-700'}`}>{d.label}</button>)}</div>
        {document==='emargement_epreuves' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="font-semibold text-sm mb-2">Matières à émarger (9 cases - modifiable) :</p>
            <div className="grid grid-cols-3 md:grid-cols-9 gap-2">{matieres.map((m,i)=><input key={i} value={m} onChange={e=>{ const c=[...matieres]; c[i]=e.target.value; setMatieres(c); }} className="border rounded px-2 py-1.5 text-xs bg-white" />)}</div>
            <div className="flex gap-2 mt-2 flex-wrap">{ORDRE_SERIES.map(s=><button key={s} onClick={()=>setMatieres(MATIERES_PAR_SERIE[s])} className="border bg-white px-2 py-1 rounded text-xs">BAC {s}</button>)}<button onClick={()=>setMatieres(MATIERES_BEPC)} className="border bg-white px-2 py-1 rounded text-xs">Modèle BEPC</button></div>
          </div>
        )}
      </div>

      <div className="border rounded-lg p-2 md:p-4 bg-white text-[11px] min-h-[400px]">
        {document==='liste' && (<><BtnPrint label="Liste des candidats" />{salles.map(s=><div key={`liste-${s.global}`} className="mb-8 print:break-after-page"><h3 className="font-bold text-[12px] mb-2">SALLE {s.global} — {isBEPC? 'BEPC' : `Série ${s.serie} — ${s.classe} — Groupe ${s.numSalleSerie}`} — {s.candidats.length} élèves</h3><table className="w-full text-xs border"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">#</th><th className="px-2 py-1 text-left">N° Table</th><th className="px-2 py-1 text-left">Nom</th><th className="px-2 py-1 text-left">Prénom</th><th className="px-2 py-1 text-left">Matricule</th><th className="px-2 py-1 text-left">Classe</th><th className="px-2 py-1 text-left">Série</th></tr></thead><tbody>{s.candidats.map((c,i)=><tr key={c.eleve_id} className="border-t"><td className="px-2 py-1">{i+1}</td><td className="px-2 py-1 font-mono font-bold">{c.numero_table||'-'}</td><td className="px-2 py-1">{c.nom}</td><td className="px-2 py-1">{c.prenom}</td><td className="px-2 py-1">{c.matricule}</td><td className="px-2 py-1">{c.classe_nom}</td><td className="px-2 py-1">{c.serie}</td></tr>)}</tbody></table></div>)}</>)}

        {document==='emargement' && (<><BtnPrint label="Émargement simple" />{salles.map(s=><div key={`em-${s.global}`} className="mb-8 print:break-after-page"><h3 className="font-bold text-[12px] mb-2">SALLE {s.global} — {isBEPC? 'BEPC' : `Série ${s.serie} — ${s.classe}`} — Émargement simple</h3><table className="w-full text-xs border"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">#</th><th className="px-2 py-1 text-left">N° Table</th><th className="px-2 py-1 text-left">Nom et prénom</th><th className="px-2 py-1 text-left">Signature</th></tr></thead><tbody>{s.candidats.map((c,i)=><tr key={c.eleve_id} className="border-t"><td className="px-2 py-2">{i+1}</td><td className="px-2 py-2 font-mono font-bold">{c.numero_table||'-'}</td><td className="px-2 py-2">{c.nom} {c.prenom}</td><td className="px-2 py-2 border-l h-8"></td></tr>)}</tbody></table></div>)}</>)}

        {document==='emargement_epreuves' && (<><BtnPrint label="Émargement par matière (15/salle)" />{salles.map(s=><div key={`ep-${s.global}`} className="mb-8 print:break-after-page"><div className="flex justify-between border-b pb-2 mb-2"><div><p className="text-[10px] uppercase font-semibold">{examen.organisateur||etabNom}</p><h2 className="text-[12px] font-bold">SALLE {s.global} — {isBEPC? 'BEPC' : `Série ${s.serie} — ${s.classe} — Groupe ${s.numSalleSerie}`} — Émargement par épreuve — {s.candidats.length} élèves</h2></div><div className="text-[9px] text-right"><p>Président:.......................</p><p>Surveillant:.....................</p></div></div><table className="w-full text-[9px] border border-black border-collapse"><thead className="bg-gray-100"><tr><th className="border border-black px-1 py-1 w-6">#</th><th className="border border-black px-1 w-[65px]">N° Table</th><th className="border border-black px-1 w-[60px]">Matricule</th><th className="border border-black px-1">Nom</th><th className="border border-black px-1">Prénom</th>{matieres.map((mat,i)=><th key={i} className="border border-black px-1 bg-yellow-50 min-w-[48px]">{mat||`M${i+1}`}</th>)}</tr></thead><tbody>{s.candidats.map((c,i)=><tr key={c.eleve_id} className="h-[26px]"><td className="border border-black text-center">{i+1}</td><td className="border border-black font-mono font-bold text-center text-[7px]">{c.numero_table||'-'}</td><td className="border border-black text-center text-[7px]">{c.matricule}</td><td className="border border-black px-1">{c.nom}</td><td className="border border-black px-1">{c.prenom}</td>{matieres.map((_,j)=><td key={j} className="border border-black"></td>)}</tr>)}</tbody></table></div>)}</>)}

        {document==='convocations' && (<><BtnPrint label="Convocations" /><div className="grid gap-4">{allCands.map(c=><div key={c.eleve_id} className="border-2 border-black p-4 print:break-after-page"><div className="text-center border-b pb-2 mb-2"><p className="text-xs font-bold uppercase">{examen.organisateur||etabNom}</p><h3 className="font-bold text-sm">CONVOCATION — {examen.nom} {c.serie?`Série ${c.serie}`:''}</h3><p className="text-[10px]">{examen.annee_scolaire} {examen.session?`— ${examen.session}`:''}</p></div><p className="text-xs">Je soussigné convoque <b>{c.nom} {c.prenom}</b> — Matricule {c.matricule} — Classe {c.classe_nom} — Série {c.serie||'-'} — N° Table <b className="font-mono text-sm">{c.numero_table||'-'}</b> à se présenter au centre {centre?.nom_centre||etabNom} {centre?.ville?`à ${centre.ville}`:''} le {examen.date_debut? new Date(examen.date_debut).toLocaleDateString('fr-FR'):''} muni de sa CNI.</p><div className="flex justify-between mt-6 text-[10px]"><span>Le Président du jury<br/>{centre?.president_jury||''}</span><span>Le Candidat<br/>Signature</span></div></div>)}</div></>)}

        {document==='etiquettes' && (<><BtnPrint label="Étiquettes tables" /><div className="grid grid-cols-3 gap-3">{allCands.map(c=><div key={c.eleve_id} className="border-2 border-dashed border-black h-[92px] flex flex-col justify-center items-center p-1 text-center"><span className="text-[22px] font-black font-mono">{c.numero_table||'-'}</span><span className="text-[9px]">{c.nom} {c.prenom}</span><span className="text-[8px]">{c.classe_nom} — {c.serie||'BEPC'}</span></div>)}</div></>)}

        {document==='pv' && (<><BtnPrint label="Procès-verbal" /><div><h2 className="text-sm font-bold text-center mb-2">PROCÈS-VERBAL — {examen.nom} — {examen.annee_scolaire}</h2><p className="text-xs mb-2">Centre: {centre?.nom_centre||etabNom} — Ville: {centre?.ville||''} — DRENA: {centre?.drena||''}</p>{stats? <table className="w-full text-xs border"><tbody><tr><td className="border px-2 py-1">Inscrits: {stats.inscrits}</td><td className="border px-2 py-1">Présents: {stats.presents}</td><td className="border px-2 py-1">Absents: {stats.absents}</td></tr><tr><td className="border px-2 py-1">Admis: {stats.admis}</td><td className="border px-2 py-1">Ajournés: {stats.ajournes}</td><td className="border px-2 py-1">% Admis: {stats.pourcentage_admis?.toFixed(2)}%</td></tr></tbody></table> : <p className="text-xs bg-yellow-50 border p-2">Stats non calculées — ajoutez les notes. Candidats: {candidats.length}</p>}<div className="mt-4"><h4 className="font-bold text-xs mb-1">Par Série (A1/A2/C/D)</h4><table className="w-full text-xs border"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">Série</th><th className="px-2 py-1">Effectif</th><th className="px-2 py-1">Moyenne</th><th className="px-2 py-1">% Adm</th></tr></thead><tbody>{parSerie.map(s=><tr key={s.serie} className="border-t"><td className="px-2 py-1">{s.serie}</td><td className="px-2 py-1 text-center">{s.nb_candidats}</td><td className="px-2 py-1 text-center">{s.moyenne.toFixed(2)}</td><td className="px-2 py-1 text-center">{s.taux_admission.toFixed(1)}%</td></tr>)}</tbody></table></div></div></>)}

        {document==='releves' && (<><BtnPrint label="Relevés de notes" /><div className="grid gap-3">{resultats.length===0? allCands.map(c=><div key={c.eleve_id} className="border p-3 text-xs"><p className="font-bold">{examen.nom} — Relevé provisoire — {examen.annee_scolaire}</p><p>{c.nom} {c.prenom} — {c.matricule} — {c.classe_nom} — Série {c.serie} — N° Table {c.numero_table||'-'} — Moy: en attente de saisie</p></div>) : resultats.map(r=><div key={r.eleve_id} className="border p-3 text-xs print:break-after-page"><p className="text-center font-bold">{examen.nom} — Relevé de notes — {examen.annee_scolaire}</p><p>{r.nom} {r.prenom} — {r.matricule} — {r.classe_nom} — Série {candidats.find(c=>c.eleve_id===r.eleve_id)?.serie||'-'} — Moy: {r.moyenne.toFixed(2)} — Mention: {r.mention} — Rang: {r.rang||'-'} — {r.decision}</p></div>)}</div></>)}

        {document==='palmares' && (<><BtnPrint label="Palmarès" />{resultats.length===0? <div><p className="text-xs bg-yellow-50 border p-2 mb-2">Palmarès provisoire sans notes — tri par nom — {candidats.length} candidats</p><table className="w-full text-xs border"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">Rang</th><th className="px-2 py-1 text-left">Nom</th><th className="px-2 py-1">Série</th><th className="px-2 py-1">Classe</th></tr></thead><tbody>{allCands.map((c,i)=><tr key={c.eleve_id} className="border-t"><td className="px-2 py-1">{i+1}</td><td className="px-2 py-1">{c.nom} {c.prenom}</td><td className="px-2 py-1 text-center">{c.serie}</td><td className="px-2 py-1">{c.classe_nom}</td></tr>)}</tbody></table></div> : <table className="w-full text-xs border"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">Rang</th><th className="px-2 py-1 text-left">Nom</th><th className="px-2 py-1">Moyenne</th><th className="px-2 py-1">Mention</th><th className="px-2 py-1">Série</th><th className="px-2 py-1">Décision</th></tr></thead><tbody>{[...resultats].sort((a,b)=>b.moyenne-a.moyenne).map((r,i)=><tr key={r.eleve_id} className="border-t"><td className="px-2 py-1">{i+1}</td><td className="px-2 py-1">{r.nom} {r.prenom}</td><td className="px-2 py-1 text-center">{r.moyenne.toFixed(2)}</td><td className="px-2 py-1 text-center">{r.mention}</td><td className="px-2 py-1 text-center">{candidats.find(c=>c.eleve_id===r.eleve_id)?.serie||''}</td><td className="px-2 py-1 text-center">{r.decision}</td></tr>)}</tbody></table>}</>)}

                {document==='rapport' && (<><BtnPrint label="Rapport statistique" /><div className="text-xs space-y-3"><h2 className="font-bold text-center">RAPPORT STATISTIQUE — {examen.nom} — {examen.annee_scolaire}</h2>{stats && <p>Inscrits: {stats.inscrits} — Présents: {stats.presents} — Admis: {stats.admis} — %: {stats.pourcentage_admis.toFixed(2)}% — Moyenne générale: {stats.moyenne_generale.toFixed(2)}</p>}{major && <p>Major: {major.nom} {major.prenom} — {major.moyenne.toFixed(2)} — {major.mention}</p>}<h4 className="font-bold">Par classe</h4><table className="w-full border"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">Classe</th><th className="px-2 py-1">Nb</th><th className="px-2 py-1">Moy</th><th className="px-2 py-1">% Adm</th></tr></thead><tbody>{parClasse.map(c=><tr key={c.classe_nom} className="border-t"><td className="px-2 py-1">{c.classe_nom}</td><td className="px-2 py-1 text-center">{c.nb_candidats}</td><td className="px-2 py-1 text-center">{c.moyenne.toFixed(2)}</td><td className="px-2 py-1 text-center">{c.taux_admission.toFixed(1)}%</td></tr>)}</tbody></table><h4 className="font-bold">Par Série A1/A2/C/D</h4><table className="w-full border"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">Série</th><th className="px-2 py-1">Effectif</th><th className="px-2 py-1">Moyenne</th><th className="px-2 py-1">% Adm</th></tr></thead><tbody>{parSerie.map(s=><tr key={s.serie} className="border-t"><td className="px-2 py-1">{s.serie}</td><td className="px-2 py-1 text-center">{s.nb_candidats}</td><td className="px-2 py-1 text-center">{s.moyenne.toFixed(2)}</td><td className="px-2 py-1 text-center">{s.taux_admission.toFixed(1)}%</td></tr>)}</tbody></table><h4 className="font-bold">Par matière</h4><table className="w-full border"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">Matière</th><th className="px-2 py-1">Moy</th><th className="px-2 py-1">Nb notes</th></tr></thead><tbody>{parMatiere.map(m=><tr key={m.matiere_nom} className="border-t"><td className="px-2 py-1">{m.matiere_nom} ({m.epreuve_nom})</td><td className="px-2 py-1 text-center">{m.moyenne.toFixed(2)}</td><td className="px-2 py-1 text-center">{m.nb_notes}</td></tr>)}</tbody></table></div></>)}
      </div>

      <style jsx global>{`@media print{ @page{ size:A4 landscape; margin:5mm; }.print\\:break-after-page{ break-after:page; } body{ -webkit-print-color-adjust:exact; } }`}</style>
    </main>
  );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       }
