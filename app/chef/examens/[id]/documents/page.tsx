'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function DocumentsPage(){
  const { id } = useParams();
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
      if(cand){
        const ids = cand.map((c:any)=>c.eleve_id);
        const {data: profs} = await supabase.from('profiles').select('id,nom,prenom').in('id', ids.length?ids:['00000000-0000-0000-0000-000000000000']);
        const map = new Map((profs||[]).map((p:any)=>[p.id,p]));
        setCandidats(cand.map((c:any)=>({...c,...(map.get(c.eleve_id)||{}), nom: map.get(c.eleve_id)?.nom||c.nom, prenom: map.get(c.eleve_id)?.prenom||c.prenom }));
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
    <div className="p-2 md:p-4">
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          ['emargement','Émargement par matière (15/salle)'],
          ['liste','Liste'],
          ['etiquettes','Étiquettes tables'],
          ['convocations','Convocations'],
          ['releves','Relevés de notes'],
          ['pv','Procès-verbal'],
          ['palmares','Palmarès'],
          ['rapport','Rapport statistique'],
        ].map(([k,label])=>(
          <button key={k} onClick={()=>setDocument(k)} className={`px-3 py-2 rounded text-sm ${document===k?'bg-black text-white':'bg-gray-100'}`}>{label}</button>
        ))}
      </div>

      <button onClick={()=>window.print()} className="bg-blue-600 text-white px-4 py-2 rounded mb-4 w-full md:w-auto">Imprimer / PDF - {document}</button>

      {/* 1. EMARGEMENT 15 PAR SALLE */}
      {document==='emargement' && (
        <div className="space-y-8">
          {groupes.map((g:any,gi:number)=>(
            <div key={gi} className="border-2 border-black bg-white p-3 print:break-after-page">
              <h2 className="text-[12px] font-bold">SALLE {g.salle} - Groupe {g.idx} - Émargement par épreuve</h2>
              <div className="flex justify-between text-[10px]"><p>Élèves: {g.eleves.length}</p><p>Président:................ Surveillant:................</p></div>
              <table className="w-full text-[9px] border border-black border-collapse mt-2">
                <thead className="bg-gray-100"><tr><th className="border border-black px-1 py-1">#</th><th className="border border-black px-1 py-1">N° Table</th><th className="border border-black px-1 py-1">Nom</th><th className="border border-black px-1 py-1">Prénom</th>{matieres.map((m:any)=><th key={m.id} className="border border-black px-1 py-1">{m.code}</th>)}</tr></thead>
                <tbody>{g.eleves.map((c:any,idx:number)=><tr key={c.eleve_id}><td className="border border-black px-1 py-1 text-center">{idx+1}</td><td className="border border-black px-1 py-1 font-bold text-center text-[9px]">{c.numero_table}</td><td className="border border-black px-1 py-1">{c.nom}</td><td className="border border-black px-1 py-1">{c.prenom}</td>{matieres.map((_:any,i:number)=><td key={i} className="border border-black px-1 py-1"></td>)}</tr>)}</tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* 2. LISTE */}
      {document==='liste' && (
        <div><h3 className="font-bold mb-2">Liste des candidats - {candidats.length} avec N° Table</h3>
        <table className="w-full text-xs border"><thead className="bg-gray-100"><tr><th className="text-left px-2 py-1">#</th><th>N° Table</th><th>Nom</th><th>Prénom</th><th>Salle</th></tr></thead>
        <tbody>{candidats.map((c:any,i:number)=><tr key={c.eleve_id} className="border-t"><td className="px-2 py-1">{i+1}</td><td className="px-2 py-1 font-bold">{c.numero_table}</td><td className="px-2 py-1">{c.nom}</td><td className="px-2 py-1">{c.prenom}</td><td className="px-2 py-1">{c.salle}</td></tr>)}</tbody></table></div>
      )}

      {/* 3. ETIQUETTES - SEULEMENT NUMERO */}
      {document==='etiquettes' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {candidats.map((c:any)=><div key={c.eleve_id} className="border-2 border-black p-6 text-center h-[120px] flex flex-col justify-center items-center bg-white print:break-inside-avoid"><div className="text-[10px] font-bold">TABLE N°</div><div className="font-black text-2xl mt-2">{c.numero_table||'-'}</div></div>)}
        </div>
      )}

      {/* 4. CONVOCATIONS - 1 PAR 1 */}
      {document==='convocations' && (
        <div className="space-y-6">
          {candidats.map((c:any)=>(
            <div key={c.eleve_id} className="border-2 border-black bg-white p-5 print:break-inside-avoid print:break-after-page">
              <div className="text-center border-b-2 border-black pb-2"><div className="font-black text-[11px]">MINISTERE DE L'EDUCATION NATIONALE</div><div className="font-bold text-[14px]">CONVOCATION BEPC 2027</div></div>
              <div className="grid grid-cols-[1fr_90px] gap-3 mt-3 text-[12px]">
                <div className="space-y-1"><div><b>N° TABLE:</b> <span className="font-black text-base">{c.numero_table}</span></div><div><b>NOM:</b> {c.nom} {c.prenom}</div><div><b>SALLE:</b> {c.salle}</div><div className="text-[9px] mt-2 italic">Se présenter avec pièce d'identité, 7h30. Téléphone interdit.</div></div>
                <div className="border border-black h-[90px] flex items-center justify-center text-[8px]">PHOTO</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. RELEVES - TOUS ENSEMBLE */}
      {document==='releves' && (
        <div><h3 className="font-bold mb-2">Relevés de notes - Tous les candidats</h3>
        <table className="w-full text-[9px] border border-collapse"><thead className="bg-gray-100"><tr><th className="border px-1 py-1">N° Table</th><th className="border px-1 py-1">Nom</th><th className="border px-1 py-1">Prénom</th>{matieres.map((m:any)=><th key={m.id} className="border px-1 py-1">{m.code}</th>)}<th className="border px-1 py-1">Moy</th></tr></thead>
        <tbody>{candidats.map((c:any)=><tr key={c.eleve_id} className="border-t"><td className="border px-1 py-1 font-mono">{c.numero_table}</td><td className="border px-1 py-1">{c.nom}</td><td className="border px-1 py-1">{c.prenom}</td>{matieres.map((m:any)=><td key={m.id} className="border px-1 py-1 text-center">{resultats.find((r:any)=>r.eleve_id===c.eleve_id && r.matiere_id===m.id)?.note||'-'}</td>)}<td className="border px-1 py-1 font-bold">{resultats.find((r:any)=>r.eleve_id===c.eleve_id)?.moyenne||'-'}</td></tr>)}</tbody></table></div>
      )}

      {/* 6. PV */}
      {document==='pv' && (
        <div className="bg-white border-2 border-black p-6"><h2 className="text-center font-black text-lg">PROCES-VERBAL</h2><p className="text-center text-sm mt-2">{examen?.titre} - {candidats.length} candidats - {Object.keys(salles).length} salles</p><div className="mt-6 text-sm space-y-4"><p>Le {new Date().toLocaleDateString('fr-FR')}, les épreuves se sont déroulées sans incident majeur...</p><div className="grid grid-cols-2 mt-12"><div>Le Président</div><div className="text-right">Le Secrétaire</div></div></div></div>
      )}

      {/* 7. PALMARES - UN SEUL TABLEAU */}
      {document==='palmares' && (
        <div className="bg-white border p-4"><h3 className="font-bold text-center">PALMARES - {candidats.length} candidats</h3>
        <table className="w-full mt-3 border-collapse border border-black text-xs"><thead><tr className="bg-black text-white"><th className="border p-2">RANG</th><th className="border p-2">N° TABLE</th><th className="border p-2 text-left">NOM & PRENOMS</th><th className="border p-2">SALLE</th></tr></thead>
        <tbody>{[...candidats].sort((a:any,b:any)=>a.nom.localeCompare(b.nom)).map((c:any,i:number)=><tr key={c.eleve_id}><td className="border p-1.5 text-center">{i+1}</td><td className="border p-1.5 text-center font-bold">{c.numero_table}</td><td className="border p-1.5">{c.nom} {c.prenom}</td><td className="border p-1.5 text-center">{c.salle}</td></tr>)}</tbody></table></div>
      )}
      {/* 8. RAPPORT - STATS */}
      {document==='rapport' && (
        <div className="bg-white border-2 border-black p-6">
          <h3 className="font-black text-center text-lg">RAPPORT STATISTIQUE - {candidats.length} candidats</h3>
          <p className="text-center text-sm">{examen?.titre} - Session 2027</p>

          <div className="grid grid-cols-3 gap-3 mt-6 text-center">
            <div className="border-2 border-black p-3">
              <div className="text-xl font-black">{candidats.length}</div>
              <div className="text-xs">INSCRITS</div>
            </div>
            <div className="border-2 border-black p-3">
              <div className="text-xl font-black">{Object.keys(salles).length}</div>
              <div className="text-xs">SALLES</div>
            </div>
            <div className="border-2 border-black p-3">
              <div className="text-xl font-black">{Math.ceil(candidats.length/15)}</div>
              <div className="text-xs">GROUPES DE 15</div>
            </div>
          </div>

          <table className="w-full mt-6 border-collapse border border-black text-sm">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-black p-2 text-left">SALLE</th>
                <th className="border border-black p-2">EFFECTIF</th>
                <th className="border border-black p-2">N° TABLE Début - Fin</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(salles).map(([salle,list]:any)=>(
                <tr key={salle}>
                  <td className="border border-black p-2 font-bold">{salle}</td>
                  <td className="border border-black p-2 text-center">{list.length}</td>
                  <td className="border border-black p-2 text-center text-xs">{list[0]?.numero_table} → {list[list.length-1]?.numero_table}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 text-[11px]">
            <div>Fait à Abidjan, le {new Date().toLocaleDateString('fr-FR')}</div>
            <div className="flex justify-between mt-10">
              <div>Le Secrétariat</div>
              <div className="font-bold">Le Chef de Centre</div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 5mm; }
         .print\:break-after-page { break-after: page; }
          body { -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
          }
