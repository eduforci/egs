'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DocumentsPage(){
  const { id } = useParams();
  const supabase = createClient();
  const [candidats,setCandidats]=useState<any[]>([]);
  const [examen,setExamen]=useState<any>(null);
  const [document,setDocument]=useState('emargement');
  const [matieres,setMatieres]=useState<any[]>([]);
  const [resultats,setResultats]=useState<any[]>([]);

  useEffect(()=>{
    (async()=>{
      const {data: exam} = await supabase.from('examens').select('*').eq('id',id).single();
      setExamen(exam);
      const {data: cand} = await supabase.from('examens_candidats').select('*').eq('examen_id',id).order('salle').order('numero_table');
      if(cand && cand.length){
        const ids = cand.map((c:any)=>c.eleve_id);
        const {data: profs} = await supabase.from('profiles').select('id,nom,prenom').in('id', ids);
        const map = new Map((profs||[]).map((p:any)=>[p.id,p]));
        setCandidats(cand.map((c:any)=>{const p:any=map.get(c.eleve_id);return {...c, nom:p?.nom||c.nom, prenom:p?.prenom||c.prenom}}));
      }
      const {data: mats} = await supabase.from('matieres').select('*');
      setMatieres(mats||[]);
      const {data: res} = await supabase.from('resultats').select('*').eq('examen_id',id);
      setResultats(res||[]);
    })();
  },[id]);

  const salles = candidats.reduce((acc:any,c:any)=>{const k=c.salle||'Salle 1';acc[k]=acc[k]||[];acc[k].push(c);return acc;},{});
  const groupes = Object.entries(salles).flatMap(([salle,list]:any)=>{
    const chunks:any[]=[]; for(let i=0;i<list.length;i+=15) chunks.push({salle, eleves:list.slice(i,i+15), idx: Math.floor(i/15)+1}); return chunks;
  });

  return (
    <div className="p-2">
      <div className="flex flex-wrap gap-2 mb-4">
        {[['emargement','Émargement'],['liste','Liste'],['etiquettes','Étiquettes'],['convocations','Convocations'],['releves','Relevés'],['pv','Procès-verbal'],['palmares','Palmarès'],['rapport','Rapport']].map(([k,l]:any)=><button key={k} onClick={()=>setDocument(k)} className={`px-3 py-2 rounded text-sm ${document===k?'bg-black text-white':'bg-gray-100'}`}>{l}</button>)}
      </div>
      <button onClick={()=>window.print()} className="bg-blue-600 text-white px-4 py-2 rounded mb-4 w-full">{document.toUpperCase()} — Imprimer / PDF</button>

      {document==='emargement' && <div className="space-y-8">{groupes.map((g:any,i:number)=><div key={i} className="border-2 border-black bg-white p-3"><h2 className="font-bold text-xs">SALLE {g.salle} - Groupe {g.idx}</h2><table className="w-full text-[9px] border-collapse border border-black mt-2"><thead><tr><th className="border border-black">#</th><th className="border border-black">N° Table</th><th className="border border-black">Nom</th><th className="border border-black">Prénom</th>{matieres.map((m:any)=><th key={m.id} className="border border-black">{m.code}</th>)}</tr></thead><tbody>{g.eleves.map((c:any,idx:number)=><tr key={c.eleve_id}><td className="border border-black text-center">{idx+1}</td><td className="border border-black text-center font-bold">{c.numero_table}</td><td className="border border-black">{c.nom}</td><td className="border border-black">{c.prenom}</td>{matieres.map((_:any,j:number)=><td key={j} className="border border-black"></td>)}</tr>)}</tbody></table></div>)}</div>}

      {document==='convocations' && <div className="space-y-6">{candidats.map((c:any)=><div key={c.eleve_id} className="border-2 border-black bg-white p-6"><div className="text-center border-b-2 border-black pb-2"><div className="font-black text-xs">MINISTERE DE L'EDUCATION NATIONALE</div><div className="font-bold text-lg">CONVOCATION BEPC 2027 - TABLE {c.numero_table}</div></div><div className="mt-4 text-sm"><div><b>NOM:</b> {c.nom} {c.prenom}</div><div><b>SALLE:</b> {c.salle} - <b>CENTRE:</b> {examen?.centre}</div></div><div className="flex justify-between mt-10 text-xs"><div>Le Candidat</div><div>Le Chef de Centre - Cachet</div></div></div>)}</div>}

      {document==='pv' && <div className="bg-white border-2 border-black p-8"><h2 className="text-center font-black text-xl">PROCES-VERBAL</h2><p className="text-center text-sm mt-2">{examen?.titre} - {candidats.length} candidats - {Object.keys(salles).length} salles</p><div className="mt-6 text-sm"><p><b>Inscrits:</b> {candidats.length} - <b>Présents:</b>...... - <b>Absents:</b>......</p><p className="mt-4"><b>Observations / Incidents:</b></p><div className="border border-black h-[120px] mt-2"></div></div><div className="flex justify-between mt-16 font-bold text-sm"><div>Le Secrétaire</div><div>Le Président</div></div></div>}

      {document==='palmares' && <div className="bg-white border-2 border-black p-4"><h3 className="font-black text-center">PALMARES - {candidats.length} CANDIDATS</h3><table className="w-full mt-4 border border-black text-xs border-collapse"><thead><tr className="bg-black text-white"><th className="border p-2">RANG</th><th className="border p-2">N° TABLE</th><th className="border p-2 text-left">NOM</th><th className="border p-2">SALLE</th><th className="border p-2">MOY</th></tr></thead><tbody>{[...candidats].sort((a:any,b:any)=>a.nom.localeCompare(b.nom)).map((c:any,i:number)=><tr key={c.eleve_id}><td className="border p-1 text-center">{i+1}</td><td className="border p-1 text-center font-bold">{c.numero_table}</td><td className="border p-1">{c.nom} {c.prenom}</td><td className="border p-1 text-center">{c.salle}</td><td className="border p-1 text-center">{resultats.find((r:any)=>r.eleve_id===c.eleve_id)?.moyenne||'-'}</td></tr>)}</tbody></table></div>}

      {document==='rapport' && <div className="bg-white border-2 border-black p-6"><h3 className="font-black text-center">RAPPORT STATISTIQUE</h3><div className="grid grid-cols-3 gap-3 mt-6 text-center"><div className="border-2 border-black p-4"><div className="text-2xl font-black">{candidats.length}</div><div className="text-xs">INSCRITS</div></div><div className="border-2 border-black p-4"><div className="text-2xl font-black">{Object.keys(salles).length}</div><div className="text-xs">SALLES</div></div><div className="border-2 border-black p-4"><div className="text-2xl font-black">{Math.ceil(candidats.length/15)}</div><div className="text-xs">GROUPES</div></div></div><table className="w-full mt-6 border border-black text-sm border-collapse"><thead><tr className="bg-gray-200"><th className="border p-2 text-left">SALLE</th><th className="border p-2">EFFECTIF</th><th className="border p-2">DEBUT → FIN</th></tr></thead><tbody>{Object.entries(salles).map(([salle,list]:any)=><tr key={salle}><td className="border p-2 font-bold">{salle}</td><td className="border p-2 text-center">{list.length}</td><td className="border p-2 text-center text-xs">{list[0]?.numero_table} → {list[list.length-1]?.numero_table}</td></tr>)}</tbody></table></div>}

      {document==='etiquettes' && <div className="grid grid-cols-3 gap-4">{candidats.map((c:any)=><div key={c.eleve_id} className="border-2 border-black p-6 text-center h-[120px] flex flex-col justify-center bg-white"><div className="text-[10px] font-bold">TABLE N°</div><div className="font-black text-2xl mt-2">{c.numero_table}</div></div>)}</div>}

      {document==='liste' && <div><table className="w-full text-xs border"><thead><tr><th>#</th><th>N° Table</th><th>Nom</th><th>Salle</th></tr></thead><tbody>{candidats.map((c:any,i:number)=><tr key={c.eleve_id} className="border-t"><td>{i+1}</td><td className="font-bold">{c.numero_table}</td><td>{c.nom} {c.prenom}</td><td>{c.salle}</td></tr>)}</tbody></table></div>}

      {document==='releves' && <div><table className="w-full text-[9px] border"><thead><tr><th>N° Table</th><th>Nom</th>{matieres.map((m:any)=><th key={m.id}>{m.code}</th>)}<th>Moy</th></tr></thead><tbody>{candidats.map((c:any)=><tr key={c.eleve_id}><td>{c.numero_table}</td><td>{c.nom}</td>{matieres.map((m:any)=><td key={m.id} className="text-center">{resultats.find((r:any)=>r.eleve_id===c.eleve_id && r.matiere_id===m.id)?.note||'-'}</td>)}<td>{resultats.find((r:any)=>r.eleve_id===c.eleve_id)?.moyenne||'-'}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
