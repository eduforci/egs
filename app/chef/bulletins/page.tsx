"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Classe = { id: string; nom: string };
type Eleve = { id: string; nom: string; prenom: string };

export default function BulletinsAccueil() {
  const supabase = createClient();

  const [anneeScolaire, setAnneeScolaire] = useState("");
  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeId, setClasseId] = useState("");
  const [trimestre, setTrimestre] = useState("1");
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [chargementEleves, setChargementEleves] = useState(false);

  useEffect(() => {
    async function charger() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("etablissement_id")
        .eq("id", user?.id)
        .single();

      if (!profile?.etablissement_id) return;

      const { data: etab } = await supabase
        .from("etablissements")
        .select("annee_scolaire_active")
        .eq("id", profile.etablissement_id)
        .single();

      setAnneeScolaire(etab?.annee_scolaire_active ?? "");

      const { data: c } = await supabase
        .from("classes")
        .select("id, nom")
        .eq("etablissement_id", profile.etablissement_id)
        .order("nom", { ascending: true });

      setClasses(c ?? []);
    }
    charger();
  }, []);

  useEffect(() => {
    async function chargerEleves() {
      if (!classeId) {
        setEleves([]);
        return;
      }
      setChargementEleves(true);

      const { data: elevesRaw } = await supabase
        .from("eleves")
        .select("id")
        .eq("classe_id", classeId);

      if (!elevesRaw || elevesRaw.length === 0) {
        setEleves([]);
        setChargementEleves(false);
        return;
      }

      const ids = elevesRaw.map((e) => e.id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, nom, prenom")
        .in("id", ids);

      const liste = elevesRaw.map((e) => {
        const p = profilesData?.find((pp) => pp.id === e.id);
        return { id: e.id, nom: p?.nom ?? "", prenom: p?.prenom ?? "" };
      });

      liste.sort((a, b) => a.nom.localeCompare(b.nom));
      setEleves(liste);
      setChargementEleves(false);
    }
    chargerEleves();
  }, [classeId]);

  return (
    <main className="p-6 sm:p-8 max-w-lg mx-auto">
      <h1 className="font-display text-3xl font-semibold mb-1">Bulletins</h1>
      <p className="text-neutral-500 mb-6">
        Choisis une classe et un trimestre pour accéder aux bulletins des élèves.
      </p>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Classe</label>
          <select
            value={classeId}
            onChange={(e) => setClasseId(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="">— Choisir une classe —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Trimestre</label>
          <select
            value={trimestre}
            onChange={(e) => setTrimestre(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="1">Trimestre 1</option>
            <option value="2">Trimestre 2</option>
            <option value="3">Trimestre 3</option>
          </select>
        </div>
      </div>

      {classeId && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase mb-3">
            Élèves
          </h2>

          {chargementEleves && <p className="text-sm text-neutral-400">Chargement...</p>}

          {!chargementEleves && eleves.length === 0 && (
            <p className="text-sm text-neutral-400">Aucun élève dans cette classe.</p>
          )}

          <div className="bg-white border rounded-xl divide-y">
            {eleves.map((e) => (
              <Link
                key={e.id}
                href={`/chef/bulletins/${classeId}/${e.id}/${trimestre}`}
                className="flex items-center justify-between p-3 hover:bg-neutral-50"
              >
                <span>{e.nom} {e.prenom}</span>
                <span className="text-blue-600 text-sm">Voir le bulletin →</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
    }
                  
