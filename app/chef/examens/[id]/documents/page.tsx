'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Examen = { nom: string; niveau: string; serie: string | null; annee_scolaire: string; organisateur: string | null; etablissement_id: string; };
type Candidat = { eleve_id: string; nom: string; prenom: string; matricule: string; classe_nom: string; numero_table: string | null; serie: string | null; };

const MATIERES_PAR_SERIE: Record<string,string[]> = {
  A1: ["Français","Philosophie","Hist-Géo","LV1","LV2","Mathématiques","Anglais","",""],
  A2: ["Français","Philosophie","Hist-Géo","LV1","LV2","Anglais","Mathématiques","",""],
  C: ["Mathématiques","Phys-Chimie","SVT","Français","Philosophie","Hist-Géo","LV1","Anglais",""],
  D: ["Mathématiques","Phys-Chimie","SVT","Français","Philosophie","Hist-Géo","LV1","Anglais",""],
}
const MATIERES_BEPC = ["Anglais","Orthographe","Hist-Géo","SVT","Allemand","Espagnol","EDHC","Maths","Phys-Chimie"];
const TAILLE_SALLE = 15;
const ORDRE_SERIES = ["A1","A2","C","D"];

function chunk<T>(arr: T[], size: number){ const r:T[][]=[]; for(let i=0;i<arr.length;i+=size) r.push(arr.slice(i,i+size)); return r; }
function detectSerie(nomClasse:string, serieBDD:string|null){
  if(serieBDD && ["A1","A2","C","D"].includes(serieBDD.toUpperCase())) return serieBDD.toUpperCase();
  const up = nomClasse.toUpperCase();
  if(up.includes('A1')) return 'A1';
  if(up.includes('A2')) return 'A2';
  if(up.match(/\bC\b/) || up.includes(' TLE C') || up.includes('1ERE C')) return 'C';
  if(up.match(/\bD\b/) || up.includes(' TLE D') || up.includes('1ERE D')) return 'D';
  return 'A2'; // défaut si non trouvé
}

export default function ExamenDocumentsPage() {
  const params = useParams(); const examenId = params?.id as string; const supabase = createClient();
  const [examen, setExamen] = useState<Examen | null>(null);
  const [etabNom, setEtabNom] = useState('');
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [loading, setLoading] = useState(true);
  const [matieres, setMatieres] = useState<string[]>(MATIERES_PAR_SERIE["A2"]);

  const charger = useCallback(async () => {
    setLoading(true);
    const { data: ex } = await supabase.from('examens').select('nom,niveau,serie,annee_scolaire,organisateur,etablissement_id').eq('id', examenId).single();
    setExamen(ex as any);
    const isBEPC = (ex?.nom+' '+ex?.niveau).toUpperCase().includes('BEPC');
    if(isBEPC) setMatieres(MATIERES_BEPC); else if(ex?.serie && MATIERES_PAR_SERIE[ex.serie]) setMatieres(MATIERES_PAR_SERIE[ex.serie]);

    const { data: etab } = await supabase.from('etablissements').select('nom').eq('id', ex.etablissement_id).single(); setEtabNom(etab?.nom||'');

    const { data: candData } = await supabase.from('examens_candidats').select('eleve_id, numero_table, eleves(matricule, serie, classes(nom, serie))').eq('examen_id', examenId);
    const brut = (candData??[]) as any[];
    const ids = brut.map(r=>r.eleve_id);
    const { data: profs } = await supabase.from('profiles').select('id,nom,prenom').in('id', ids.length?ids:['00000000-0000-0000-0000-000000000000']);
    const map = new Map((profs??[]).map((p:any)=>[p.id,p]));
    const liste: Candidat[] = brut.map(r=>{
      const ele = Array.isArray(r.eleves)?r.eleves[0]:r.eleves;
      const cl = ele?.classes? (Array.isArray(ele.classes)?ele.classes[0]:ele.classes):null;
      const p = map.get(r.eleve_id);
      const serie = isBEPC? null : detectSerie(cl?.nom||'', ele?.serie || cl?.serie || null);
      return { eleve_id:r.eleve_id, nom:p?.nom||'Inconnu', prenom:p?.prenom||'', matricule:ele?.matricule||'-', classe_nom:cl?.nom||'-', numero_table:r.numero_table, serie };
    });
    // Tri officiel: Série A1 -> A2 -> C -> D, puis Classe, puis N° Table
    liste.sort((a,b)=>{
      const sA = ORDRE_SERIES.indexOf(a.serie||''); const sB = ORDRE_SERIES.indexOf(b.serie||'');
      if(sA!==sB) return sA-sB;
      if(a.classe_nom!==b.classe_nom) return a.classe_nom.localeCompare(b.classe_nom);
      return (a.numero_table||'').localeCompare(b.numero_table||'');
    });
    setCandidats(liste); setLoading(false);
  }, [examenId, supabase]);
  useEffect(()=>{ charger(); }, [charger]);

  if(loading) return <p className="p-6">Chargement...</p>;

  const isBEPC = (examen?.nom+' '+examen?.niveau).toUpperCase().includes('BEPC');

  // GROUPEMENT STRICT: SERIE -> CLASSE -> 15 max
  const groupesMap = new Map<string, Candidat[]>();
  if(isBEPC){
    groupesMap.set('BEPC', candidats);
  } else {
    for(const c of candidats){
      const key = `${c.serie}__${c.classe_nom}`; // A2__Tle A2-1 / D__Tle D2
      if(!groupesMap.has(key)) groupesMap.set(key, []);
      groupesMap.get(key)!.push(c);
    }
  }

  // Tri des clés dans l'ordre A1, A2, C, D
  const clesTriees = Array.from(groupesMap.keys()).sort((a,b)=>{
    if(isBEPC) return 0;
    const serieA = a.split('__')[0]; const serieB = b.split('__')[0];
    return ORDRE_SERIES.indexOf(serieA) - ORDRE_SERIES.indexOf(serieB) || a.localeCompare(b);
  });

  const salles: { serie: string; classe: string; candidats: Candidat[]; numSalleSerie: number }[] = [];
  const compteurSalleParSerie = new Map<string, number>();
  for(const key of clesTriees){
    const list = groupesMap.get(key)!;
    const [serie, classe] = key.split('__');
    const chunks = chunk(list, TAILLE_SALLE);
    chunks.forEach((g)=>{
      const num = (compteurSalleParSerie.get(serie)||0)+1;
      compteurSalleParSerie.set(serie, num);
      salles.push({ serie: serie==='BEPC'?'':serie, classe: classe==='BEPC'?'':classe, candidats: g, numSalleSerie: num });
    });
  }

  return (
    <main className="p-3 max-w-[1600px] mx-auto">
      <div className="print:hidden">
        <h1 className="font-bold text-sm">{examen?.nom} • {candidats.length} candidats • {isBEPC? 'BEPC': 'Séries: '+Array.from(new Set(candidats.map(c=>c.serie))).join(', ')} • {salles.length} salle(s)</h1>
        <p className="text-[11px] text-gray-600 mb-2">Règle CI: Série (A1/A2/C/D) → Classe → max 15. Jamais mélanger A2 avec D. Tes 40 élèves = 10 par série = 4 salles distinctes.</p>
        <div className="bg-yellow-50 border rounded p-2 mb-2">
          <div className="grid grid-cols-3 md:grid-cols-9 gap-1">
            {matieres.map((m,i)=><input key={i} value={m} onChange={e=>{ const c=[...matieres]; c[i]=e.target.value; setMatieres(c); }} className="border px-1 py-1 text-xs bg-white rounded" />)}
          </div>
          <div className="flex gap-1 mt-2 flex-wrap">{ORDRE_SERIES.map(s=><button key={s} onClick={()=>setMatieres(MATIERES_PAR_SERIE[s])} className="border bg-white px-2 py-1 text-xs rounded">BAC {s}</button>)}<button onClick={()=>setMatieres(MATIERES_BEPC)} className="border bg-white px-2 py-1 text-xs rounded">BEPC</button></div>
        </div>
        <button onClick={()=>window.print()} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">Imprimer par salle (paysage)</button>
      </div>

      {salles.map((s, idx)=>(
        <div key={idx} className="mt-4 border p-2 print:border-none print:break-after-page">
          <div className="flex justify-between border-b pb-1 mb-1">
            <div>
              <p className="text-[9px] uppercase font-semibold">{etabNom} — {examen?.annee_scolaire}</p>
              <h2 className="text-[11px] font-bold">{isBEPC? `SALLE ${idx+1} — BEPC` : `SALLE ${idx+1} — SÉRIE ${s.serie} — ${s.classe} — Groupe ${s.numSalleSerie}`}</h2>
              <p className="text-[8px] text-gray-500">{s.candidats.length} élèves • {s.classe} • Série {s.serie || 'BEPC'} • Ne jamais mélanger avec autre série</p>
            </div>
            <div className="text-[8px] text-right"><p>Président:.................</p><p>Surveillant:...............</p></div>
          </div>
          <table className="w-full text-[8px] border-collapse border border-black">
            <thead className="bg-gray-100"><tr><th className="border border-black px-1 w-6">#</th><th className="border border-black w-[60px]">N° Table</th><th className="border border-black w-[55px]">Matricule</th><th className="border border-black">Nom</th><th className="border border-black">Prénom</th>{matieres.map((mat,i)=><th key={i} className="border border-black bg-yellow-50 min-w-[42px]">{mat||'-'}</th>)}</tr></thead>
            <tbody>{s.candidats.map((c,i)=><tr key={c.eleve_id} className="h-[24px]"><td className="border border-black text-center">{i+1}</td><td className="border border-black text-center font-mono font-bold text-[7px]">{c.numero_table||'-'}</td><td className="border border-black text-center text-[7px]">{c.matricule}</td><td className="border border-black px-1">{c.nom}</td><td className="border border-black px-1">{c.prenom}</td>{matieres.map((_,j)=><td key={j} className="border border-black"></td>)}</tr>)}</tbody>
          </table>
        </div>
      ))}
      <style jsx global>{`@media print{ @page{ size:A4 landscape; margin:4mm;}.print\\:break-after-page{ break-after:page; } }`}</style>
    </main>
  );
                                                   }
