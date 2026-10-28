"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEspace } from "@/lib/use-espace";
import { ESPACES, espaceParDefaut, type EspaceCode } from "@/lib/espaces";

export default function NouvelleClassePage() {
  const supabase = createClient();
  const router = useRouter();
  const { actifs, pret } = useEspace();

  const [nom, setNom] = useState("");
  const [niveau, setNiveau] = useState("");
  const [espace, setEspace] = useState<EspaceCode>('primaire');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pret && actifs.length > 0) {
      const defaut = espaceParDefaut(actifs);
      setEspace(defaut);
      const def = ESPACES.find(e => e.code === defaut);
      if (def && !niveau) setNiveau(def.niveaux[0]);
    }
  }, [pret, actifs]);

  const defCourant = ESPACES.find(e => e.code === espace);
  const niveauxDisponibles = defCourant?.niveaux || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("etablissement_id")
        .eq("id", user.id)
        .single();
      
      if (!profile?.etablissement_id) throw new Error("Pas d'établissement");

      let cycle: string = espace;
      if (espace === 'secondaire') {
        if (/6|5|4|3/.test(niveau)) cycle = 'college';
        else cycle = 'lycee';
      }
      
      const { error } = await supabase.from("classes").insert({
        nom: nom || niveau,
        niveau,
        cycle,
        type_enseignement: 'general',
        etablissement_id: profile.etablissement_id,
      });
      if (error) throw error;
      router.push("/chef/classes");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!pret) return <div className="p-8">Chargement...</div>;

  return (
    <main className="p-6 sm:p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Nouvelle classe</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Espaces actifs : {actifs.map(a => ESPACES.find(x=>x.code===a)?.label).join(', ')}
      </p>
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4 bg-white border rounded-xl p-6">
        <div>
          <label className="text-sm font-medium">Espace</label>
          <select value={espace} onChange={e => {
            const ne = e.target.value as EspaceCode;
            setEspace(ne);
            const def = ESPACES.find(x => x.code === ne);
            if (def) setNiveau(def.niveaux[0]);
          }} className="w-full mt-1 border rounded-lg p-2.5">
            {ESPACES.filter(es => actifs.includes(es.code)).map(es => (
              <option key={es.code} value={es.code}>{es.icone} {es.label} - {es.description}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Niveau</label>
          <select value={niveau} onChange={e => setNiveau(e.target.value)} className="w-full mt-1 border rounded-lg p-2.5" required>
            {niveauxDisponibles.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Nom de la classe</label>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder={niveau ? `${niveau} A` : "Ex: CP1 A"} className="w-full mt-1 border rounded-lg p-2.5" />
        </div>
        <button disabled={loading} className="w-full bg-black text-white rounded-lg py-2.5">
          {loading ? 'Création...' : `Créer classe ${defCourant?.label || ''}`}
        </button>
      </form>
    </main>
  );
}