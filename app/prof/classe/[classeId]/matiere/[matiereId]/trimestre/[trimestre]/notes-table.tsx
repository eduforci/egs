"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Eleve = {
  id: string;
  matricule: string;
  profiles: { nom: string; prenom: string } | null;
};

type Note = {
  eleve_id: string;
  type: "interrogation" | "devoir" | "composition";
  valeur: number;
};

type Observation = {
  eleve_id: string;
  texte: string;
};

type Validation = {
  id: string;
  valide: boolean;
  valide_par: string | null;
  valide_at: string | null;
} | null;

export default function NotesTable({
  classeId,
  matiereId,
  trimestre,
  classeNom,
  matiereNom,
  anneeScolaire,
  enseignantId,
  eleves,
  notesExistantes,
  observationsExistantes,
  validation,
}: {
  classeId: string;
  matiereId: string;
  trimestre: string;
  classeNom: string;
  matiereNom: string;
  anneeScolaire: string;
  enseignantId: string;
  eleves: Eleve[];
  notesExistantes: Note[];
  observationsExistantes: Observation[];
  validation: Validation;
}) {
  const supabase = createClient();

  const estVerrouille = validation?.valide === true;

  const initial: Record<
    string,
    { interrogation: string; devoir: string; composition: string; appreciation: string }
  > = {};
  eleves.forEach((e) => {
    const interro = notesExistantes.find((n) => n.eleve_id === e.id && n.type === "interrogation");
    const devoir = notesExistantes.find((n) => n.eleve_id === e.id && n.type === "devoir");
    const composition = notesExistantes.find((n) => n.eleve_id === e.id && n.type === "composition");
    const appreciation = observationsExistantes.find((o) => o.eleve_id === e.id);
    initial[e.id] = {
      interrogation: interro ? String(interro.valeur) : "",
      devoir: devoir ? String(devoir.valeur) : "",
      composition: composition ? String(composition.valeur) : "",
      appreciation: appreciation ? appreciation.texte : "",
    };
  });

  const [valeurs, setValeurs] = useState(initial);
  const [enregistrement, setEnregistrement] = useState(false);
  const [validationEnCours, setValidationEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verrouille, setVerrouille] = useState(estVerrouille);
  const [validePar, setValidePar] = useState(validation?.valide_at ?? null);

  function moyenne(eleveId: string) {
    const v = valeurs[eleveId];
    const interro = parseFloat(v.interrogation);
    const devoir = parseFloat(v.devoir);
    const composition = parseFloat(v.composition);

    const termes: { val: number; poids: number }[] = [];
    if (!isNaN(interro)) termes.push({ val: interro * 2, poids: 1 }); // /10 -> /20
    if (!isNaN(devoir)) termes.push({ val: devoir, poids: 2 });
    if (!isNaN(composition)) termes.push({ val: composition, poids: 3 });

    if (termes.length === 0) return null;
    const poidsTotal = termes.reduce((a, t) => a + t.poids, 0);
    const somme = termes.reduce((a, t) => a + t.val * t.poids, 0);
    return somme / poidsTotal;
  }

  const moyennesValides = eleves
    .map((e) => moyenne(e.id))
    .filter((m): m is number => m !== null);
  const moyenneClasse =
    moyennesValides.length > 0
      ? moyennesValides.reduce((a, b) => a + b, 0) / moyennesValides.length
      : null;

  const classement = eleves
    .map((e) => ({ id: e.id, m: moyenne(e.id) }))
    .filter((x) => x.m !== null)
    .sort((a, b) => (b.m as number) - (a.m as number));

  function rang(eleveId: string) {
    const idx = classement.findIndex((c) => c.id === eleveId);
    return idx === -1 ? "-" : idx + 1;
  }

  async function enregistrerHistorique(
    eleveId: string,
    type: "interrogation" | "devoir" | "composition",
    ancienneValeurStr: string,
    nouvelleValeurStr: string
  ) {
    if (ancienneValeurStr === nouvelleValeurStr) return;

    await supabase.from("notes_historique").insert({
      eleve_id: eleveId,
      matiere_id: matiereId,
      classe_id: classeId,
      trimestre: Number(trimestre),
      annee_scolaire: anneeScolaire,
      type,
      ancienne_valeur: ancienneValeurStr === "" ? null : parseFloat(ancienneValeurStr),
      nouvelle_valeur: nouvelleValeurStr === "" ? null : parseFloat(nouvelleValeurStr),
      modifie_par: enseignantId,
    });
  }

  async function handleSave() {
    setEnregistrement(true);
    setMessage(null);

    for (const eleve of eleves) {
      const v = valeurs[eleve.id];
      const avant = initial[eleve.id];

      // Historique : uniquement les valeurs réellement modifiées
      await enregistrerHistorique(eleve.id, "interrogation", avant.interrogation, v.interrogation);
      await enregistrerHistorique(eleve.id, "devoir", avant.devoir, v.devoir);
      await enregistrerHistorique(eleve.id, "composition", avant.composition, v.composition);

      await supabase
        .from("notes")
        .delete()
        .eq("eleve_id", eleve.id)
        .eq("matiere_id", matiereId)
        .eq("classe_id", classeId)
        .eq("trimestre", trimestre)
        .in("type", ["interrogation", "devoir", "composition"]);

      const rows = [];
      if (v.interrogation !== "") {
        rows.push({
          eleve_id: eleve.id,
          matiere_id: matiereId,
          classe_id: classeId,
          enseignant_id: enseignantId,
          type: "interrogation",
          valeur: parseFloat(v.interrogation),
          coefficient: 1,
          trimestre,
          annee_scolaire: anneeScolaire,
        });
      }
      if (v.devoir !== "") {
        rows.push({
          eleve_id: eleve.id,
          matiere_id: matiereId,
          classe_id: classeId,
          enseignant_id: enseignantId,
          type: "devoir",
          valeur: parseFloat(v.devoir),
          coefficient: 2,
          trimestre,
          annee_scolaire: anneeScolaire,
        });
      }
      if (v.composition !== "") {
        rows.push({
          eleve_id: eleve.id,
          matiere_id: matiereId,
          classe_id: classeId,
          enseignant_id: enseignantId,
          type: "composition",
          valeur: parseFloat(v.composition),
          coefficient: 3,
          trimestre,
          annee_scolaire: anneeScolaire,
        });
      }

      if (rows.length > 0) {
        const { error } = await supabase.from("notes").insert(rows);
        if (error) {
          setMessage("Erreur : " + error.message);
          setEnregistrement(false);
          return;
        }
      }

      // Appréciation : une seule par élève/matière/trimestre
      await supabase
        .from("observations")
        .delete()
        .eq("eleve_id", eleve.id)
        .eq("matiere_id", matiereId)
        .eq("trimestre", trimestre)
        .eq("enseignant_id", enseignantId);

      if (v.appreciation.trim() !== "") {
        const { error: obsError } = await supabase.from("observations").insert({
          eleve_id: eleve.id,
          enseignant_id: enseignantId,
          matiere_id: matiereId,
          texte: v.appreciation.trim(),
          trimestre,
          annee_scolaire: anneeScolaire,
        });
        if (obsError) {
          setMessage("Erreur (appréciation) : " + obsError.message);
          setEnregistrement(false);
          return;
        }
      }
    }

    setEnregistrement(false);
    setMessage("Notes enregistrées avec succès.");
  }

  async function handleValider() {
    const confirmation = window.confirm(
      "Une fois validées, vous ne pourrez plus modifier ces notes vous-même. Seul le chef d'établissement ou une personne autorisée pourra les déverrouiller. Continuer ?"
    );
    if (!confirmation) return;

    setValidationEnCours(true);
    setMessage(null);

    const { error } = await supabase.from("validations_notes").upsert(
      {
        classe_id: classeId,
        matiere_id: matiereId,
        trimestre: Number(trimestre),
        annee_scolaire: anneeScolaire,
        valide: true,
        valide_par: enseignantId,
        valide_at: new Date().toISOString(),
      },
      { onConflict: "classe_id,matiere_id,trimestre,annee_scolaire" }
    );

    setValidationEnCours(false);

    if (error) {
      setMessage("Erreur lors de la validation : " + error.message);
      return;
    }

    setVerrouille(true);
    setValidePar(new Date().toISOString());
    setMessage("Notes validées et verrouillées.");
  }

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl font-semibold mb-1">
        {classeNom} — {matiereNom} — Trimestre {trimestre}
      </h1>
      <p className="text-neutral-500 mb-6">{eleves.length} élève(s)</p>

      {verrouille && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
          🔒 Notes validées {validePar ? `le ${new Date(validePar).toLocaleDateString("fr-FR")}` : ""}
          — verrouillées. Seul le chef d'établissement ou une personne autorisée peut les déverrouiller.
        </div>
      )}

      {message && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm">
          {message}
        </div>
      )}

      <div className="bg-white border rounded-xl overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Élève</th>
              <th className="p-3">Interrogation (/10)</th>
              <th className="p-3">Devoir (/20)</th>
              <th className="p-3">Composition (/20)</th>
              <th className="p-3">Moyenne (/20)</th>
              <th className="p-3">Rang</th>
              <th className="p-3">Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {eleves.map((e) => {
              const m = moyenne(e.id);
              return (
                <tr key={e.id} className="border-t align-top">
                  <td className="p-3 whitespace-nowrap">
                    {e.profiles?.nom} {e.profiles?.prenom}
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.25}
                      disabled={verrouille}
                      value={valeurs[e.id].interrogation}
                      onChange={(ev) =>
                        setValeurs((prev) => ({
                          ...prev,
                          [e.id]: { ...prev[e.id], interrogation: ev.target.value },
                        }))
                      }
                      className="w-20 border rounded p-1 disabled:bg-neutral-100 disabled:text-neutral-400"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step={0.25}
                      disabled={verrouille}
                      value={valeurs[e.id].devoir}
                      onChange={(ev) =>
                        setValeurs((prev) => ({
                          ...prev,
                          [e.id]: { ...prev[e.id], devoir: ev.target.value },
                        }))
                      }
                      className="w-20 border rounded p-1 disabled:bg-neutral-100 disabled:text-neutral-400"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step={0.25}
                      disabled={verrouille}
                      value={valeurs[e.id].composition}
                      onChange={(ev) =>
                        setValeurs((prev) => ({
                          ...prev,
                          [e.id]: { ...prev[e.id], composition: ev.target.value },
                        }))
                      }
                      className="w-20 border rounded p-1 disabled:bg-neutral-100 disabled:text-neutral-400"
                    />
                  </td>
                  <td className="p-3 font-medium">
                    {m !== null ? m.toFixed(2) : "-"}
                  </td>
                  <td className="p-3">{rang(e.id)}</td>
                  <td className="p-3">
                    <textarea
                      rows={2}
                      disabled={verrouille}
                      value={valeurs[e.id].appreciation}
                      onChange={(ev) =>
                        setValeurs((prev) => ({
                          ...prev,
                          [e.id]: { ...prev[e.id], appreciation: ev.target.value },
                        }))
                      }
                      placeholder="Appréciation..."
                      className="w-40 border rounded p-1 text-xs disabled:bg-neutral-100 disabled:text-neutral-400"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="p-4 border-t bg-neutral-50 flex items-center justify-between text-sm">
          <div>
            <span className="font-medium">Moyenne de classe : </span>
            {moyenneClasse !== null ? moyenneClasse.toFixed(2) + "/20" : "-"}
          </div>
          <div className="text-neutral-500">
            {new Date().toLocaleDateString("fr-FR")} — EGS
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSave}
          disabled={enregistrement || verrouille}
          className="bg-black text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50"
        >
          {enregistrement ? "Enregistrement..." : "Enregistrer les notes"}
        </button>

        {!verrouille && (
          <button
            onClick={handleValider}
            disabled={validationEnCours}
            className="bg-role-prof text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50"
          >
            {validationEnCours ? "Validation..." : "Valider et verrouiller"}
          </button>
        )}
      </div>
    </main>
  );
}
  
