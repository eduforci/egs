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
  type: string;
  valeur: number;
};

type Observation = {
  eleve_id: string;
  texte: string;
};

type Bareme = {
  type_evaluation: string;
  bareme_max: number;
  poids: number;
  ordre: number;
};

type Validation = {
  id: string;
  valide: boolean;
  valide_par: string | null;
  valide_at: string | null;
} | null;

const LABELS: Record<string, string> = {
  interrogation: "Interrogation",
  devoir: "Devoir",
  composition: "Composition",
  examen: "Examen",
  essai: "Essai",
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
  observationsExistantes,
  validation,
  baremes,
  seuilsMentions,
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
  baremes: Bareme[];
  seuilsMentions: Record<string, number>;
}) {
  const supabase = createClient();

  const estVerrouille = validation?.valide === true;
  const typesEvaluation = baremes.map((b) => b.type_evaluation);

  const initial: Record<string, Record<string, string>> = {};
  eleves.forEach((e) => {
    const ligne: Record<string, string> = { appreciation: "" };
    typesEvaluation.forEach((type) => {
      const note = notesExistantes.find((n) => n.eleve_id === e.id && n.type === type);
      ligne[type] = note ? String(note.valeur) : "";
    });
    const appreciation = observationsExistantes.find((o) => o.eleve_id === e.id);
    if (appreciation) ligne.appreciation = appreciation.texte;
    initial[e.id] = ligne;
  });

  const [valeurs, setValeurs] = useState(initial);
  const [enregistrement, setEnregistrement] = useState(false);
  const [validationEnCours, setValidationEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verrouille, setVerrouille] = useState(estVerrouille);
  const [validePar, setValidePar] = useState(validation?.valide_at ?? null);

  function moyenne(eleveId: string) {
    const v = valeurs[eleveId];
    const termes: { val: number; poids: number }[] = [];

    baremes.forEach((b) => {
      const brut = parseFloat(v[b.type_evaluation]);
      if (!isNaN(brut)) {
        const surVingt = brut * (20 / b.bareme_max);
        termes.push({ val: surVingt, poids: b.poids });
      }
    });

    if (termes.length === 0) return null;
    const poidsTotal = termes.reduce((a, t) => a + t.poids, 0);
    const somme = termes.reduce((a, t) => a + t.val * t.poids, 0);
    return somme / poidsTotal;
  }

  // Traduit une moyenne en appréciation suggérée, à partir des seuils
  // de l'établissement (mêmes seuils que les mentions générales).
  // Suggestion uniquement — n'écrase jamais le texte libre de l'enseignant.
  function appreciationSuggeree(m: number | null) {
    if (m === null) return null;
    const paliers = Object.entries(seuilsMentions).sort((a, b) => b[1] - a[1]);
    for (const [label, seuil] of paliers) {
      if (m >= seuil) return label;
    }
    return null;
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
    type: string,
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

      for (const type of typesEvaluation) {
        await enregistrerHistorique(eleve.id, type, avant[type], v[type]);
      }

      await supabase
        .from("notes")
        .delete()
        .eq("eleve_id", eleve.id)
        .eq("matiere_id", matiereId)
        .eq("classe_id", classeId)
        .eq("trimestre", trimestre)
        .in("type", typesEvaluation);

      const rows = baremes
        .filter((b) => v[b.type_evaluation] !== "")
        .map((b) => ({
          eleve_id: eleve.id,
          matiere_id: matiereId,
          classe_id: classeId,
          enseignant_id: enseignantId,
          type: b.type_evaluation,
          valeur: parseFloat(v[b.type_evaluation]),
          coefficient: b.poids,
          trimestre,
          annee_scolaire: anneeScolaire,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from("notes").insert(rows);
        if (error) {
          setMessage("Erreur : " + error.message);
          setEnregistrement(false);
          return;
        }
      }

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

  if (baremes.length === 0) {
    return (
      <main className="p-8">
        <h1 className="font-display text-3xl font-semibold mb-1">
          {classeNom} — {matiereNom} — Trimestre {trimestre}
        </h1>
        <div className="mt-4 p-4 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
          Aucun barème d'évaluation n'est configuré pour cet établissement.
          Contacte le Super Admin pour finaliser l'initialisation de
          l'établissement (paramètres pédagogiques).
        </div>
      </main>
    );
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

      <div className="bg-white border rounded-xl overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Élève</th>
              {baremes.map((b) => (
                <th key={b.type_evaluation} className="p-3 whitespace-nowrap">
                  {LABELS[b.type_evaluation] ?? b.type_evaluation} (/{b.bareme_max})
                </th>
              ))}
              <th className="p-3">Moyenne (/20)</th>
              <th className="p-3">Rang</th>
              <th className="p-3">Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {eleves.map((e) => {
              const m = moyenne(e.id);
              const suggestion = appreciationSuggeree(m);
              return (
                <tr key={e.id} className="border-t align-top">
                  <td className="p-3 whitespace-nowrap">
                    {e.profiles?.nom} {e.profiles?.prenom}
                  </td>
                  {baremes.map((b) => (
                    <td key={b.type_evaluation} className="p-3">
                      <input
                        type="number"
                        min={0}
                        max={b.bareme_max}
                        step={0.25}
                        disabled={verrouille}
                        value={valeurs[e.id][b.type_evaluation]}
                        onChange={(ev) =>
                          setValeurs((prev) => ({
                            ...prev,
                            [e.id]: { ...prev[e.id], [b.type_evaluation]: ev.target.value },
                          }))
                        }
                        className="w-20 border rounded p-1 disabled:bg-neutral-100 disabled:text-neutral-400"
                      />
                    </td>
                  ))}
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
                    {suggestion && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                        <span>Suggestion : {suggestion}</span>
                        {!verrouille && (
                          <button
                            type="button"
                            onClick={() =>
                              setValeurs((prev) => ({
                                ...prev,
                                [e.id]: { ...prev[e.id], appreciation: suggestion },
                              }))
                            }
                            className="underline hover:text-neutral-600"
                          >
                            Utiliser
                          </button>
                        )}
                      </div>
                    )}
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
         
