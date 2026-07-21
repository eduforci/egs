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
  type: "interrogation" | "devoir";
  valeur: number;
};

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
}) {
  const supabase = createClient();

  const initial: Record<string, { interrogation: string; devoir: string }> = {};
  eleves.forEach((e) => {
    const interro = notesExistantes.find((n) => n.eleve_id === e.id && n.type === "interrogation");
    const devoir = notesExistantes.find((n) => n.eleve_id === e.id && n.type === "devoir");
    initial[e.id] = {
      interrogation: interro ? String(interro.valeur) : "",
      devoir: devoir ? String(devoir.valeur) : "",
    };
  });

  const [valeurs, setValeurs] = useState(initial);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function moyenne(eleveId: string) {
    const v = valeurs[eleveId];
    const interro = parseFloat(v.interrogation);
    const devoir = parseFloat(v.devoir);
    if (isNaN(interro) && isNaN(devoir)) return null;
    const interroSur20 = isNaN(interro) ? 0 : interro * 2;
    const devoirVal = isNaN(devoir) ? 0 : devoir;
    const poidsInterro = isNaN(interro) ? 0 : 1;
    const poidsDevoir = isNaN(devoir) ? 0 : 2;
    const poidsTotal = poidsInterro + poidsDevoir;
    if (poidsTotal === 0) return null;
    return (interroSur20 * poidsInterro + devoirVal * poidsDevoir) / poidsTotal;
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

  async function handleSave() {
    setEnregistrement(true);
    setMessage(null);

    for (const eleve of eleves) {
      const v = valeurs[eleve.id];

      await supabase
        .from("notes")
        .delete()
        .eq("eleve_id", eleve.id)
        .eq("matiere_id", matiereId)
        .eq("classe_id", classeId)
        .eq("trimestre", trimestre)
        .in("type", ["interrogation", "devoir"]);

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

      if (rows.length > 0) {
        const { error } = await supabase.from("notes").insert(rows);
        if (error) {
          setMessage("Erreur : " + error.message);
          setEnregistrement(false);
          return;
        }
      }
    }

    setEnregistrement(false);
    setMessage("Notes enregistrées avec succès.");
  }

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl font-semibold mb-1">
        {classeNom} — {matiereNom} — Trimestre {trimestre}
      </h1>
      <p className="text-neutral-500 mb-6">{eleves.length} élève(s)</p>

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
              <th className="p-3">Moyenne (/20)</th>
              <th className="p-3">Rang</th>
            </tr>
          </thead>
          <tbody>
            {eleves.map((e) => {
              const m = moyenne(e.id);
              return (
                <tr key={e.id} className="border-t">
                  <td className="p-3">
                    {e.profiles?.nom} {e.profiles?.prenom}
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.25}
                      value={valeurs[e.id].interrogation}
                      onChange={(ev) =>
                        setValeurs((prev) => ({
                          ...prev,
                          [e.id]: { ...prev[e.id], interrogation: ev.target.value },
                        }))
                      }
                      className="w-20 border rounded p-1"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step={0.25}
                      value={valeurs[e.id].devoir}
                      onChange={(ev) =>
                        setValeurs((prev) => ({
                          ...prev,
                          [e.id]: { ...prev[e.id], devoir: ev.target.value },
                        }))
                      }
                      className="w-20 border rounded p-1"
                    />
                  </td>
                  <td className="p-3 font-medium">
                    {m !== null ? m.toFixed(2) : "-"}
                  </td>
                  <td className="p-3">{rang(e.id)}</td>
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

      <button
        onClick={handleSave}
        disabled={enregistrement}
        className="bg-black text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50"
      >
        {enregistrement ? "Enregistrement..." : "Enregistrer les notes"}
      </button>
    </main>
  );
      }
