"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Eleve = {
  id: string;
  matricule: string;
  profiles: { nom: string; prenom: string } | null;
};

type Evaluation = {
  id: string;
  categorie: "sur10" | "sur20_coef1" | "sur20_coef2";
  bareme_max: number;
  coefficient: number;
  type_note: string;
  libelle: string | null;
  date_evaluation: string;
};

type Note = {
  eleve_id: string;
  evaluation_id: string;
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

const CATEGORIES: { value: Evaluation["categorie"]; label: string; bareme_max: number; coefficient: number; type_note: string }[] = [
  { value: "sur10", label: "Note sur 10", bareme_max: 10, coefficient: 1, type_note: "interrogation" },
  { value: "sur20_coef1", label: "Note sur 20 (coefficient 1)", bareme_max: 20, coefficient: 1, type_note: "devoir" },
  { value: "sur20_coef2", label: "Note sur 20 (coefficient 2 — devoir)", bareme_max: 20, coefficient: 2, type_note: "composition" },
];

const LIBELLES_FRANCAIS_COLLEGE = ["CF", "Orth.", "EO"];

function libelleColonne(ev: Evaluation) {
  const cat = CATEGORIES.find((c) => c.value === ev.categorie);
  const date = new Date(ev.date_evaluation).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return `${ev.libelle || cat?.label || ev.categorie} · /${ev.bareme_max} · ${date}`;
}

export default function NotesTable({
  classeId,
  matiereId,
  trimestre,
  classeNom,
  matiereNom,
  anneeScolaire,
  etablissementId,
  enseignantId,
  eleves,
  evaluationsExistantes,
  notesExistantes,
  observationsExistantes,
  validation,
  seuilsMentions,
}: {
  classeId: string;
  matiereId: string;
  trimestre: string;
  classeNom: string;
  matiereNom: string;
  anneeScolaire: string;
  etablissementId: string;
  enseignantId: string;
  eleves: Eleve[];
  evaluationsExistantes: Evaluation[];
  notesExistantes: Note[];
  observationsExistantes: Observation[];
  validation: Validation;
  seuilsMentions: Record<string, number>;
}) {
  const supabase = createClient();
  const router = useRouter();

  const estVerrouille = validation?.valide === true;

  const initial: Record<string, Record<string, string>> = {};
  eleves.forEach((e) => {
    const ligne: Record<string, string> = { appreciation: "" };
    evaluationsExistantes.forEach((ev) => {
      const note = notesExistantes.find((n) => n.eleve_id === e.id && n.evaluation_id === ev.id);
      ligne[ev.id] = note ? String(note.valeur) : "";
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
  const [valideParId, setValideParId] = useState(validation?.valide_par ?? null);
  const [modeEdition, setModeEdition] = useState(false);

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nouvelleCategorie, setNouvelleCategorie] = useState<Evaluation["categorie"]>("sur10");
  const [nouvelleDate, setNouvelleDate] = useState(new Date().toISOString().slice(0, 10));
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [classeCycle, setClasseCycle] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("classes")
      .select("cycle")
      .eq("id", classeId)
      .single()
      .then(({ data }) => setClasseCycle(data?.cycle ?? null));
  }, [classeId, supabase]);

  const estFrancaisCollege = matiereNom === "Français" && classeCycle === "college";

  function moyenne(eleveId: string) {
    const v = valeurs[eleveId];
    const termes: { val: number; poids: number }[] = [];

    evaluationsExistantes.forEach((ev) => {
      const brut = parseFloat(v[ev.id]);
      if (!isNaN(brut)) {
        const surVingt = brut * (20 / ev.bareme_max);
        termes.push({ val: surVingt, poids: ev.coefficient });
      }
    });

    if (termes.length === 0) return null;
    const poidsTotal = termes.reduce((a, t) => a + t.poids, 0);
    const somme = termes.reduce((a, t) => a + t.val * t.poids, 0);
    return somme / poidsTotal;
  }

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

  const rangsMap = new Map<string, { position: number; exAequo: boolean }>();
  {
    let i = 0;
    while (i < classement.length) {
      let j = i;
      while (j < classement.length && classement[j].m === classement[i].m) j++;
      const position = i + 1;
      const exAequo = j - i > 1;
      for (let k = i; k < j; k++) {
        rangsMap.set(classement[k].id, { position, exAequo });
      }
      i = j;
    }
  }

  function rang(eleveId: string) {
    const info = rangsMap.get(eleveId);
    if (!info) return "-";
    return `${info.position}e${info.exAequo ? " ex" : ""}`;
  }

  function celluleModifiable(eleveId: string, evaluationId: string) {
    return initial[eleveId][evaluationId] === "" || modeEdition;
  }

  const auMoinsUneNoteExistante = eleves.some((e) =>
    evaluationsExistantes.some((ev) => initial[e.id][ev.id] !== "")
  );

  async function notifierDirection(nomComplet: string, evLabel: string, avant: string, apres: string) {
    const contenu = `Note modifiée pour ${nomComplet} (${matiereNom} — ${evLabel}) : ${avant || "—"} → ${apres}`;

    for (const role of ["chef", "directeur_etudes"] as const) {
      await supabase.from("notifications").insert({
        etablissement_id: etablissementId,
        destinataire_role: role,
        titre: "Modification de note",
        contenu,
      });
    }
  }
async function supprimerEvaluation(evaluationId: string) {
    const confirmation = window.confirm(
      "Supprimer cette évaluation ? Toutes les notes saisies pour cette évaluation seront perdues définitivement."
    );
    if (!confirmation) return;

    setMessage(null);

    const { error: notesError } = await supabase
      .from("notes")
      .delete()
      .eq("evaluation_id", evaluationId);

    if (notesError) {
      setMessage("Erreur lors de la suppression des notes : " + notesError.message);
      return;
    }

    const { error } = await supabase
      .from("evaluations")
      .delete()
      .eq("id", evaluationId);

    if (error) {
      setMessage("Erreur lors de la suppression de l'évaluation : " + error.message);
      return;
    }

    setMessage("Évaluation supprimée.");
    router.refresh();
    }
  async function creerEvaluation() {
    if (estFrancaisCollege && !nouveauLibelle) {
      setMessage("Choisis un type de note (CF, Orth. ou EO) avant de créer l'évaluation.");
      return;
    }

    setCreationEnCours(true);
    setMessage(null);

    const cat = CATEGORIES.find((c) => c.value === nouvelleCategorie)!;

    const { error } = await supabase.from("evaluations").insert({
      classe_id: classeId,
      matiere_id: matiereId,
      enseignant_id: enseignantId,
      trimestre: Number(trimestre),
      annee_scolaire: anneeScolaire,
      categorie: cat.value,
      bareme_max: cat.bareme_max,
      coefficient: cat.coefficient,
      type_note: cat.type_note,
      libelle: nouveauLibelle.trim() || null,
      date_evaluation: nouvelleDate,
    });

    setCreationEnCours(false);

    if (error) {
      setMessage("Erreur lors de la création de l'évaluation : " + error.message);
      return;
    }

    setNouveauLibelle("");
    setFormulaireOuvert(false);
    router.refresh();
  }

  async function handleSave() {
    setMessage(null);

    const erreurs: string[] = [];
    for (const eleve of eleves) {
      const v = valeurs[eleve.id];
      const nomComplet = `${eleve.profiles?.nom ?? ""} ${eleve.profiles?.prenom ?? ""}`.trim();

      for (const ev of evaluationsExistantes) {
        if (!celluleModifiable(eleve.id, ev.id)) continue;
        const saisie = v[ev.id];
        if (saisie === "") continue;

        const nombre = parseFloat(saisie);
        if (isNaN(nombre)) {
          erreurs.push(`${nomComplet} — ${libelleColonne(ev)} : valeur invalide.`);
        } else if (nombre < 0 || nombre > ev.bareme_max) {
          erreurs.push(
            `${nomComplet} — ${libelleColonne(ev)} : ${saisie} dépasse le barème autorisé (0 à ${ev.bareme_max}).`
          );
        }
      }
    }

    if (erreurs.length > 0) {
      setMessage(
        "Enregistrement refusé — corrige les notes suivantes avant de réessayer :\n" +
          erreurs.join("\n")
      );
      return;
    }

    setEnregistrement(true);

    for (const eleve of eleves) {
      const v = valeurs[eleve.id];
      const avant = initial[eleve.id];
      const nomComplet = `${eleve.profiles?.nom ?? ""} ${eleve.profiles?.prenom ?? ""}`.trim();

      for (const ev of evaluationsExistantes) {
        if (!celluleModifiable(eleve.id, ev.id)) continue;

        const ancienneValeurStr = avant[ev.id];
        const nouvelleValeurStr = v[ev.id];

        if (ancienneValeurStr === nouvelleValeurStr) continue;

        const estUneModification = ancienneValeurStr !== "";

        await supabase.from("notes_historique").insert({
          eleve_id: eleve.id,
          matiere_id: matiereId,
          classe_id: classeId,
          trimestre: Number(trimestre),
          annee_scolaire: anneeScolaire,
          type: ev.type_note,
          ancienne_valeur: ancienneValeurStr === "" ? null : parseFloat(ancienneValeurStr),
          nouvelle_valeur: nouvelleValeurStr === "" ? null : parseFloat(nouvelleValeurStr),
          modifie_par: enseignantId,
        });

        await supabase
          .from("notes")
          .delete()
          .eq("eleve_id", eleve.id)
          .eq("evaluation_id", ev.id);

        if (nouvelleValeurStr !== "") {
          const { error } = await supabase.from("notes").insert({
            eleve_id: eleve.id,
            matiere_id: matiereId,
            classe_id: classeId,
            enseignant_id: enseignantId,
            evaluation_id: ev.id,
            type: ev.type_note,
            valeur: parseFloat(nouvelleValeurStr),
            coefficient: ev.coefficient,
            bareme_max: ev.bareme_max,
            trimestre,
            annee_scolaire: anneeScolaire,
          });
          if (error) {
            setMessage("Erreur : " + error.message);
            setEnregistrement(false);
            return;
          }
        }

        if (estUneModification) {
          await notifierDirection(nomComplet, libelleColonne(ev), ancienneValeurStr, nouvelleValeurStr);
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
    setModeEdition(false);
    setMessage("Notes enregistrées avec succès.");
    router.refresh();
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
    setValideParId(enseignantId);
    setMessage("Notes validées et verrouillées.");
    router.refresh();
  }

  async function handleDeverrouiller() {
    const confirmation = window.confirm(
      "Déverrouiller ces notes ? Vous pourrez à nouveau les modifier. Pensez à revalider une fois vos changements terminés."
    );
    if (!confirmation) return;

    setValidationEnCours(true);
    setMessage(null);

    const { error } = await supabase
      .from("validations_notes")
      .update({ valide: false })
      .eq("classe_id", classeId)
      .eq("matiere_id", matiereId)
      .eq("trimestre", Number(trimestre))
      .eq("annee_scolaire", anneeScolaire);

    setValidationEnCours(false);

    if (error) {
      setMessage("Erreur lors du déverrouillage : " + error.message);
      return;
    }

    setVerrouille(false);
    setMessage("Notes déverrouillées.");
    router.refresh();
  }

  return (
    <main className="p-4 md:p-8">
      <h1 className="font-display text-2xl md:text-3xl font-semibold mb-1">
        {classeNom} — {matiereNom} — Trimestre {trimestre}
      </h1>
      <p className="text-neutral-500 mb-6">{eleves.length} élève(s)</p>

      {verrouille && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
          🔒 Notes validées {validePar ? `le ${new Date(validePar).toLocaleDateString("fr-FR")}` : ""}
          — verrouillées.{" "}
          {valideParId === enseignantId
            ? "Vous pouvez les déverrouiller vous-même."
            : "Verrouillées par la direction — seule la direction peut les déverrouiller."}
        </div>
      )}

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm whitespace-pre-line ${
            message.startsWith("Enregistrement refusé") || message.startsWith("Erreur")
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          {message}
        </div>
      )}

      {/* AJOUT D'UNE ÉVALUATION */}
      {!verrouille && (
        <div className="mb-4">
          {!formulaireOuvert ? (
            <button
              onClick={() => setFormulaireOuvert(true)}
              className="bg-white border rounded-lg px-4 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              + Ajouter une évaluation
            </button>
          ) : (
            <div className="bg-white border rounded-xl p-4 space-y-3 max-w-md">
              <p className="font-semibold text-sm">Nouvelle évaluation</p>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Type de note</label>
                <select
                  value={nouvelleCategorie}
                  onChange={(e) => setNouvelleCategorie(e.target.value as Evaluation["categorie"])}
                  className="w-full border rounded-lg p-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Date</label>
                <input
                  type="date"
                  value={nouvelleDate}
                  onChange={(e) => setNouvelleDate(e.target.value)}
                  className="w-full border rounded-lg p-2 text-sm"
                />
              </div>

              {estFrancaisCollege ? (
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Type de note</label>
                  <select
                    value={nouveauLibelle}
                    onChange={(e) => setNouveauLibelle(e.target.value)}
                    className="w-full border rounded-lg p-2 text-sm"
                  >
                    <option value="">Choisir...</option>
                    {LIBELLES_FRANCAIS_COLLEGE.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Libellé (optionnel)</label>
                  <input
                    type="text"
                    value={nouveauLibelle}
                    onChange={(e) => setNouveauLibelle(e.target.value)}
                    placeholder="Ex: Interro chapitre 3"
                    className="w-full border rounded-lg p-2 text-sm"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={creerEvaluation}
                  disabled={creationEnCours}
                  className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {creationEnCours ? "Création..." : "Créer"}
                </button>
                <button
                  onClick={() => setFormulaireOuvert(false)}
                  className="border rounded-lg px-4 py-2 text-sm font-medium"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {evaluationsExistantes.length === 0 ? (
        <div className="p-4 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
          Aucune évaluation créée pour ce trimestre. Ajoutez-en une pour commencer à saisir des notes.
        </div>
      ) : (
        <>
          {!verrouille && auMoinsUneNoteExistante && !modeEdition && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setModeEdition(true)}
                className="flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 hover:bg-neutral-50"
              >
                ✏️ Modifier les notes
              </button>
            </div>
          )}

          {modeEdition && (
            <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-2.5 flex items-center justify-between">
              <span>Mode modification activé — le chef et le directeur des études seront notifiés des changements.</span>
              <button
                type="button"
                onClick={() => setModeEdition(false)}
                className="underline shrink-0 ml-2"
              >
                Annuler
              </button>
            </div>
          )}

          <div className="bg-white border rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="p-3 sticky left-0 bg-neutral-50">Élève</th>
                  {evaluationsExistantes.map((ev) => (
                    <th key={ev.id} className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{libelleColonne(ev)}</span>
                        {!verrouille && (
                          <button
                            type="button"
                            onClick={() => supprimerEvaluation(ev.id)}
                            title="Supprimer cette évaluation"
                            className="text-red-500 hover:text-red-700 text-xs normal-case font-normal"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
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
                      <td className="p-3 whitespace-nowrap sticky left-0 bg-white">
                        {e.profiles?.nom} {e.profiles?.prenom}
                      </td>
                      {evaluationsExistantes.map((ev) => {
                        const modifiable = celluleModifiable(e.id, ev.id);
                        const valeurActuelle = valeurs[e.id][ev.id];
                        const nombre = parseFloat(valeurActuelle);
                        const horsBareme =
                          valeurActuelle !== "" &&
                          !isNaN(nombre) &&
                          (nombre < 0 || nombre > ev.bareme_max);
                        return (
                          <td key={ev.id} className="p-3">
                            <input
                              type="number"
                              min={0}
                              max={ev.bareme_max}
                              step={0.25}
                              disabled={verrouille || !modifiable}
                              value={valeurActuelle}
                              onChange={(evt) =>
                                setValeurs((prev) => ({
                                  ...prev,
                                  [e.id]: { ...prev[e.id], [ev.id]: evt.target.value }, }))
                                 }
                              placeholder="—"
                              className={`w-20 border rounded p-1 disabled:bg-neutral-100 disabled:text-neutral-400 ${
                                horsBareme ? "border-red-400 bg-red-50 text-red-700" : ""
                              }`}
                            />
                            {horsBareme && (
                              <p className="text-[10px] text-red-600 mt-0.5">
                                Max {ev.bareme_max}
                              </p>
                            )}
                          </td>
                        );
                      })}
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

            {!verrouille ? (
              <button
                onClick={handleValider}
                disabled={validationEnCours}
                className="bg-role-prof text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50"
              >
                {validationEnCours ? "Validation..." : "Valider et verrouiller"}
              </button>
            ) : valideParId === enseignantId ? (
              <button
                onClick={handleDeverrouiller}
                disabled={validationEnCours}
                className="bg-amber-600 text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50"
              >
                {validationEnCours ? "Déverrouillage..." : "🔓 Déverrouiller"}
              </button>
            ) : (
              <p className="text-sm text-neutral-500 italic self-center">
                Verrouillé par la direction — seule la direction peut déverrouiller.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
                                                        }
