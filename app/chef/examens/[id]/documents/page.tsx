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
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      const {data: exam} = await supabase.from('examens').select('*').eq('id',id).single();
      setExamen(exam);
      const {data: cand} = await supabase.from('examens_candidats').select('*').eq('examen_id',id).order('salle').order('numero_table');
      let finalCand:any[] = cand||[];
      if(finalCand.length){
        const ids = finalCand.map((c:any)=>c.eleve_id).filter(Boolean);
        if(ids.length){
          const {data: profs} = await supabase.from('profiles').select('id,nom,prenom,date_naissance,matricule').in('id', ids);
          const map = new Map((profs||[]).map((p:any)=>[p.id,p]));
          finalCand = finalCand.map((c:any)=>{
            const p:any = map.get(c.eleve_id);
            return {...c, nom: p?.nom||c.nom, prenom: p?.prenom||c.prenom, date_naissance: p?.date_naissance, matricule: p?.matricule};
          });
        }
      }
      setCandidats(finalCand);
      const {data: mats} = await supabase.from('matieres').select('*').order('code');
      setMatieres(mats||[]);
      const {data: res} = await supabase.from('resultats').select('*').eq('examen_id',id);
      setResultats(res||[]);
      setLoading(false);
    })();
  },[id]);

  const salles = candidats.reduce((acc:any,c:any)=>{const k=c.salle||'Salle 1';acc[k]=acc[k]||[];acc[k].push(c);return acc;},{});
  const groupes = Object.entries(salles).flatMap(([salle,list]:any)=>{
    const chunks:any[]=[];
    for(let i=0;i<list.length;i+=15) chunks.push({salle, eleves:list.slice(i,i+15), idx: Math.floor(i/15)+1, total: list.length});
    return chunks;
  });

  if(loading) return <div className="p-10 text-center">Chargement...</div>;

  return (
    <div className="p-2 md:p-4 bg-gray-50 min-h-screen">
      <div className="no-print flex flex-wrap gap-2 mb-4">
        {[
          ['emargement','Émargement'],
          ['liste','Liste'],
          ['etiquettes','Étiquettes'],
          ['convocations','Convocations'],
          ['releves','Relevés'],
          ['pv','Procès-verbal'],
          ['palmares','Palmarès'],
          ['rapport','Rapport'],
        ].map(([k,label])=>(
          <button key={k} onClick={()=>setDocument(k)} className={`px-4 py-2 rounded-full text-sm font-bold border ${document===k?'bg-black text-white':'bg-white'}`}>{label}</button>
        ))}
      </div>

      <button onClick={()=>window.print()} className="no-print bg-blue-600 text-white px-6 py-3 rounded-lg mb-6 w-full font-bold">
        {document.toUpperCase()} — Imprimer / PDF ({candidats.length})
      </button>

      {/* 1 - EMARGEMENT 15/SALLE */}
      {document==='emargement' && (
        <div className="space-y-8">
          {groupes.map((g:any,gi:number)=>(
            <div key={gi} className="border-[2px] border-black bg-white p-4 print:break-after-page">
              <div className="flex justify-between border-b-2 border-black pb-2">
                <div className="text-[10px] font-bold">MINISTERE EDUCATION NATIONALE<br/>{examen?.titre}</div>
                <div className="text-right text-xs font-black">SALLE {g.salle} - Groupe {g.idx}/{Math.ceil(g.total/15)}</div>
              </div>
              <h2 className="text-center font-black text-sm mt-2">FEUILLE D'EMARGEMENT</h2>
              <table className="w-full text-[9px] border border-black border-collapse mt-2">
                <thead className="bg-gray-100"><tr><th className="border border-black">#</th><th className="border border-black">N° TABLE</th><th className="border border-black">NOM & PRENOMS</th><th className="border border-black">EMARGEMENT</th>{matieres.slice(0,4).map((m:any)=><th key={m.id} className="border border-black">{m.code}</th>)}</tr></thead>
                <tbody>{g.eleves.map((c:any,i:number)=><tr key={c.eleve_id} className="h-[28px]"><td className="border border-black text-center">{(g.idx-1)*15+i+1}</td><td className="border border-black text-center font-black">{c.numero_table}</td><td className="border border-black px-1">{c.nom} {c.prenom}</td><td className="border border-black"></td>{matieres.slice(0,4).map((_:any,j:number)=><td key={j} className="border border-black"></td>)}</tr>)}</tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* 2 - LISTE COMPLETE DETAILLEE */}
      {document==='liste' && (
        <div className="space-y-8">
          {Object.entries(salles).map(([salle,list]:any)=>(
            <div key={salle} className="bg-white border-[2px] border-black p-4 print:break-after-page">
              <div className="flex justify-between border-b-2 border-black pb-2 mb-3">
                <div className="font-black text-sm">LISTE D'APPEL - SALLE {salle}</div>
                <div className="text-xs font-bold">{list.length} candidats</div>
              </div>
              <table className="w-full text-xs border-collapse border border-black">
                <thead><tr className="bg-black text-white"><th className="border p-2">#</th><th className="border p-2">N° TABLE</th><th className="border p-2 text-left">MATRICULE</th><th className="border p-2 text-left">NOM & PRENOMS</th><th className="border p-2">DATE NAISS.</th></tr></thead>
                <tbody>{list.map((c:any,i:number)=><tr key={c.eleve_id}><td className="border p-2 text-center">{i+1}</td><td className="border p-2 text-center font-black">{c.numero_table}</td><td className="border p-2 text-[10px]">{c.matricule||'-'}</td><td className="border p-2">{c.nom} {c.prenom}</td><td className="border p-2 text-center text-[10px]">{c.date_naissance?new Date(c.date_naissance).toLocaleDateString('fr-FR'):''}</td></tr>)}</tbody>
              </table>
              <div className="text-[10px] mt-3">Total salle {salle}: {list.length} - Arrêté à {list.length} candidats</div>
            </div>
          ))}
        </div>
      )}

      {/* 3 - ETIQUETTES TABLES DETAILLEES */}
      {document==='etiquettes' && (
        <div className="space-y-6">
          <div className="no-print bg-yellow-100 border p-3 text-xs">Découpe suivant les pointillés - À coller sur les tables</div>
          <div className="grid grid-cols-2 gap-6">
            {candidats.map((c:any)=><div key={c.eleve_id} className="border-[3px] border-black bg-white p-6 h-[180px] flex flex-col justify-between print:break-inside-avoid">
              <div className="flex justify-between text-[10px] font-bold"><span>{examen?.titre}</span><span>SALLE {c.salle}</span></div>
              <div className="text-center">
                <div className="text-[12px] font-bold tracking-widest">N° TABLE</div>
                <div className="font-black text-6xl mt-2 tracking-tight">{c.numero_table}</div>
                <div className="mt-3 font-bold text-sm border-t-2 border-black pt-2">{c.nom} {c.prenom}</div>
              </div>
              <div className="flex justify-between text-[8px]"><span>Mat: {c.matricule||''}</span><span>Ne pas déplacer</span></div>
            </div>)}
          </div>
        </div>
      )}

      {/* 4 - CONVOCATIONS DETAILLEES */}
      {document==='convocations' && (
        <div className="space-y-8">
          {candidats.map((c:any)=><div key={c.eleve_id} className="border-[3px] border-black bg-white p-8 print:break-after-page">
            <div className="text-center border-b-[3px] border-black pb-3"><div className="font-black text-[11px]">REPUBLIQUE DE COTE D'IVOIRE - MENA - DECO</div><div className="font-black text-xl">CONVOCATION CANDIDAT BEPC</div><div className="text-sm">{examen?.titre} - Session 2027</div></div>
            <div className="grid grid-cols-[130px_1fr_130px] gap-6 mt-6">
              <div className="border-2 border-black h-[150px] flex flex-col items-center justify-center text-[9px]"><b>PHOTO 4x4</b><div className="w-[90px] h-[90px] bg-gray-100 mt-2 border"></div></div>
              <div className="text-sm space-y-2">
                <div className="bg-black text-white px-3 py-1 font-black text-xl inline-block">TABLE N° {c.numero_table}</div>
                <div className="pt-3"><b>MATRICULE:</b> {c.matricule||'....................'}</div>
                <div><b>NOM:</b> {c.nom}</div><div><b>PRENOMS:</b> {c.prenom}</div>
                <div><b>NE LE:</b> {c.date_naissance?new Date(c.date_naissance).toLocaleDateString('fr-FR'):'../../....'} </div>
                <div><b>SALLE:</b> {c.salle} | <b>CENTRE:</b> {examen?.centre||'GS LAC'}</div>
                <div className="text-[10px] italic mt-4">Se présenter le jour J à 07h00 avec pièce d'identité. Interdiction formelle du téléphone.</div>
              </div>
              <div className="border-2 border-black p-2 text-center text-[9px]"><b>CACHET ET VISA DU CHEF DE CENTRE</b><div className="h-[100px] mt-4"></div></div>
            </div>
          </div>)}
        </div>
      )}

      {/* 5 - RELEVES DE NOTES DETAILLES */}
      {document==='releves' && (
        <div className="space-y-8">
          {candidats.map((c:any)=>{
            const notes = resultats.filter((r:any)=>r.eleve_id===c.eleve_id);
            const moy = notes.find((r:any)=>r.moyenne)?.moyenne || resultats.find((r:any)=>r.eleve_id===c.eleve_id)?.moyenne || 0;
            return (
            <div key={c.eleve_id} className="border-[3px] border-black bg-white p-6 print:break-after-page">
              <div className="text-center border-b-2 border-black pb-2"><div className="font-black">RELEVE DE NOTES - BEPC 2027</div><div className="text-xs">{examen?.titre} - TABLE {c.numero_table}</div></div>
              <div className="mt-4 text-xs"><b>CANDIDAT:</b> {c.nom} {c.prenom} - <b>SALLE:</b> {c.salle} - <b>MATRICULE:</b> {c.matricule||'-'}</div>
              <table className="w-full mt-4 border-2 border-black border-collapse text-xs">
                <thead><tr className="bg-black text-white"><th className="border p-2 text-left">MATIERE</th><th className="border p-2">COEF</th><th className="border p-2">NOTE /20</th><th className="border p-2">NOTE x COEF</th><th className="border p-2">APPRECIATION</th></tr></thead>
                <tbody>{matieres.map((m:any)=>{const n=notes.find((r:any)=>r.matiere_id===m.id); return <tr key={m.id}><td className="border p-2">{m.libelle||m.code}</td><td className="border p-2 text-center">{m.coef||1}</td><td className="border p-2 text-center font-bold">{n?.note||'-'}</td><td className="border p-2 text-center">{n?.note? (n.note*(m.coef||1)).toFixed(2) : '-'}</td><td className="border p-2 text-[10px]">{n?.note>=16?'Très Bien':n?.note>=14?'Bien':n?.note>=12?'Assez Bien':n?.note>=10?'Passable':n?.note?'Insuffisant':''}</td></tr>})}</tbody>
                <tfoot><tr className="bg-gray-100 font-black"><td className="border p-2" colSpan={2}>TOTAL / MOYENNE</td><td className="border p-2 text-center">{moy?moy+'/20':''}</td><td className="border p-2"></td><td className="border p-2 text-center">{moy>=10?'ADMIS':'AJOURNE'}</td></tr></tfoot>
              </table>
              <div className="flex justify-between mt-10 text-xs font-bold"><div>Le Secrétaire</div><div>Le Chef de Centre</div></div>
            </div>
            )
          })}
        </div>
      )}

      {/* 6 - PV */}
      {document==='pv' && (
        <div className="bg-white border-[3px] border-black p-10">
          <h1 className="text-center font-black text-2xl">PROCES-VERBAL DE DEROULEMENT</h1>
          <p className="text-center text-sm mt-2">{examen?.titre} - {candidats.length} inscrits - {Object.keys(salles).length} salles</p>
          <div className="mt-6 border-2 border-black p-4 text-sm grid grid-cols-2 gap-3">
            <div>Inscrits: <b>{candidats.length}</b></div><div>Présents:......</div><div>Absents:......</div><div>Salles: <b>{Object.keys(salles).length}</b></div>
          </div>
          <div className="mt-6"><b>I - DEROULEMENT:</b><div className="border border-black h-[100px] mt-2"></div></div>
          <div className="mt-4"><b>II - INCIDENTS:</b><div className="border border-black h-[120px] mt-2"></div></div>
          <div className="mt-10 flex justify-between font-bold text-sm"><div>Secrétaire</div><div>Chef de Centre</div></div>
        </div>
      )}

      {/* 7 - PALMARES */}
      {document==='palmares' && (
        <div className="bg-white border-2 border-black p-4">
          <h3 className="font-black text-center text-lg">PALMARES GENERAL - {candidats.length} CANDIDATS</h3>
          <table className="w-full mt-4 border-2 border-black border-collapse text-[11px]">
            <thead><tr className="bg-black text-white"><th className="border p-2">RANG</th><th className="border p-2">N° TABLE</th><th className="border p-2 text-left">NOM</th><th className="border p-2">SALLE</th><th className="border p-2">MOY</th><th className="border p-2">DECISION</th></tr></thead>
            <tbody>{[...candidats].map((c:any)=>({...c, moy: resultats.find((r:any)=>r.eleve_id===c.eleve_id)?.moyenne||0})).sort((a:any,b:any)=>b.moy-a.moy).map((c:any,i:number)=><tr key={c.eleve_id}><td className="border p-2 text-center">{i+1}</td><td className="border p-2 text-center font-black">{c.numero_table}</td><td className="border p-2">{c.nom} {c.prenom}</td><td className="border p-2 text-center">{c.salle}</td><td className="border p-2 text-center font-bold">{c.moy||'-'}</td><td className="border p-2 text-center">{c.moy>=10?'ADMIS':'-'}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {/* 8 - RAPPORT */}
      {document==='rapport' && (
        <div className="bg-white border-[3px] border-black p-8">
          <h3 className="font-black text-center text-2xl">RAPPORT STATISTIQUE FINAL</h3>
          <p className="text-center text-sm mt-1">{examen?.titre} - {candidats.length} candidats</p>
          <div className="grid grid-cols-4 gap-4 mt-6 text-center">
            <div className="border-[3px] border-black p-4"><div className="text-3xl font-black">{candidats.length}</div><div className="text-[10px]">INSCRITS</div></div>
            <div className="border-[3px] border-black p-4"><div className="text-3xl font-black">{Object.keys(salles).length}</div><div className="text-[10px]">SALLES</div></div>
            <div className="border-[3px] border-black p-4"><div className="text-3xl font-black">{Math.ceil(candidats.length/15)}</div><div className="text-[10px]">GROUPES</div></div>
            <div className="border-[3px] border-black p-4"><div className="text-3xl font-black">{resultats.filter((r:any)=>r.moyenne>=10).length}</div><div className="text-[10px]">ADMIS</div></div>
          </div>
          <table className="w-full mt-6 border-2 border-black border-collapse text-sm">
            <thead><tr className="bg-black text-white"><th className="border p-2 text-left">SALLE</th><th className="border p-2">EFFECTIF</th><th className="border p-2">DEBUT → FIN</th><th className="border p-2">GROUPES</th></tr></thead>
            <tbody>{Object.entries(salles).map(([salle,list]:any)=><tr key={salle}><td className="border-2 border-black p-2 font-bold">{salle}</td><td className="border-2 border-black p-2 text-center">{list.length}</td><td className="border-2 border-black p-2 text-center text-xs">{list[0]?.numero_table} → {list[list.length-1]?.numero_table}</td><td className="border-2 border-black p-2 text-center">{Math.ceil(list.length/15)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      <style>{`@media print {.no-print{display:none!important}.print\\:break-after-page{break-after:page}.print\\:break-inside-avoid{break-inside:avoid}}`}</style>
    </div>
  );
      }
