"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type DetailMatiere = {
  matiere_id: string;
  matiere_nom: string;
  coefficient: number;
  moyenne: number | null;
  appreciation: string | null;
};

type ResultatEleve = {
  eleve_id: string;
  moyenne_generale: number;
  rang: number;
  mention: string;
  decision: string;
};

export default function BulletinEleve() {
  const params = useParams();
  const classeId = params.classeId as string;
  const eleveId = params.eleveId as string;
  const trimestre = params.trimestre as string;

  const supabase = createClient();

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [etablissement, setEtablissement] = useState<any>(null);
  const [classe, setClasse] = useState<any>(null);
  const [eleve, setEleve] = useState<any>(null);
  const [details, setDetails] = useState<DetailMatiere[]>([]);
  const [resultat, setResultat] = useState<ResultatEleve | null>(null);
  const [totalEleves, setTotalEleves] = useState<number | null>(null);

  useEffect(() => {
    async function charger() {
      setChargement(true);
      setErreur(null);

      const { data: classeData, error: classeErr } = await supabase
        .from("classes")
        .select("id, nom, niveau, annee_scolaire, etablissement_id")
        .eq("id", classeId)
        .single();

      if (classeErr || !classeData) {
        setErreur("Classe introuvable.");
        setChargement(false);
        return;
      }
      setClasse(classeData);

      const { data: etabData } = await supabase
        .from("etablissements")
        .select("nom, ville, type_etablissement, systeme_enseignement")
        .eq("id", classeData.etablissement_id)
        .single();
      setEtablissement(etabData ?? null);

      const { data: eleveProfil } = await supabase
        .from("profiles")
        .select("nom, prenom")
        .eq("id", eleveId)
        .single();
      setEleve(eleveProfil ?? null);

      const { data: detailsData, error: detailsErr } = await supabase.rpc(
        "calculer_details_bulletin_eleve",
        {
          p_classe_id: classeId,
          p_eleve_id: eleveId,
          p_trimestre: Number(trimestre),
          p_annee_scolaire: classeData.annee_scolaire,
        }
      );

      if (detailsErr) {
        setErreur("Erreur lors du calcul des moyennes : " + detailsErr.message);
        setChargement(false);
        return;
      }
      setDetails(detailsData ?? []);

      const { data: classementData, error: classementErr } = await supabase.rpc(
        "calculer_moyennes_classe",
        {
          p_classe_id: classeId,
          p_trimestre: Number(trimestre),
          p_annee_scolaire: classeData.annee_scolaire,
        }
      );

      if (classementErr) {
        setErreur("Erreur lors du calcul du classement : " + classementErr.message);
        setChargement(false);
        return;
      }

      setTotalEleves((classementData ?? []).length);
      const monResultat = (classementData ?? []).find(
        (r: ResultatEleve) => r.eleve_id === eleveId
      );
      setResultat(monResultat ?? null);

      setChargement(false);
    }

    charger();
  }, [classeId, eleveId, trimestre]);

  if (chargement) {
    return <main className="p-8 max-w-2xl mx-auto">Chargement du bulletin...</main>;
  }

  if (erreur) {
    return (
      <main className="p-8 max-w-2xl mx-auto">
        <div className="bg-red-50 text-red-700 text-sm p-4 rounded-lg">{erreur}</div>
      </main>
    );
  }

  return (
    <main className="p-6 sm:p-8 max-w-2xl mx-auto">
      <button
        onClick={() => window.print()}
        className="print:hidden mb-6 bg-black text-white rounded-lg px-6 py-3 font-medium"
      >
        🖨️ Imprimer / Enregistrer en PDF
      </button>

      <div className="bg-white border rounded-xl p-8 print:border-0 print:p-0">
        {/* En-tête */}
        <div className="text-center border-b pb-4 mb-6">
          <h1 className="font-display text-2xl font-semibold">{etablissement?.nom}</h1>
          <p className="text-sm text-neutral-500">
            {etablissement?.ville} — {etablissement?.type_etablissement} · système{" "}
            {etablissement?.systeme_enseignement}
          </p>
          <h2 className="text-lg font-semibold mt-3">
            BULLETIN DE NOTES — TRIMESTRE {trimestre}
          </h2>
          <p className="text-sm text-neutral-500">Année scolaire {classe?.annee_scolaire}</p>
        </div>

        {/* Infos élève */}
        <div className="flex justify-between text-sm mb-6">
          <div>
            <p><span className="text-neutral-500">Élève : </span><strong>{eleve?.nom} {eleve?.prenom}</strong></p>
            <p><span className="text-neutral-500">Classe : </span>{classe?.nom}</p>
          </div>
        </div>

        {/* Tableau des matières */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="border-b-2 border-neutral-800 text-left">
              <th className="py-2">Matière</th>
              <th className="py-2 text-center">Coef.</th>
              <th className="py-2 text-center">Moyenne</th>
              <th className="py-2">Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d) => (
              <tr key={d.matiere_id} className="border-b">
                <td className="py-2">{d.matiere_nom}</td>
                <td className="py-2 text-center">{d.coefficient}</td>
                <td className="py-2 text-center font-medium">
                  {d.moyenne !== null ? d.moyenne.toFixed(2) : "-"}
                </td>
                <td className="py-2 text-neutral-600">{d.appreciation ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Résultats généraux */}
        <div className="border-t-2 border-neutral-800 pt-4 grid grid-cols-2 gap-3 text-sm">
          <p>
            <span className="text-neutral-500">Moyenne générale : </span>
            <strong>{resultat ? resultat.moyenne_generale.toFixed(2) + "/20" : "-"}</strong>
          </p>
          <p>
            <span className="text-neutral-500">Rang : </span>
            <strong>{resultat ? `${resultat.rang}${totalEleves ? " / " + totalEleves : ""}` : "-"}</strong>
          </p>
          <p>
            <span className="text-neutral-500">Mention : </span>
            <strong>{resultat?.mention ?? "-"}</strong>
          </p>
          <p>
            <span className="text-neutral-500">Décision : </span>
            <strong>{resultat?.decision ?? "-"}</strong>
          </p>
        </div>

        <div className="flex justify-between mt-12 text-sm text-neutral-500">
          <p>Fait le {new Date().toLocaleDateString("fr-FR")}</p>
          <p>Le Chef d'établissement</p>
        </div>
      </div>
    </main>
  );
        }
  
