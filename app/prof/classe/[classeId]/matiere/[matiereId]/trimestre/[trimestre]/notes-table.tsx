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
  nature?: string | null;
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

type Bonus = {
  eleve_id: string;
  valeur: number;
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

// Nature de chaque évaluation : permet à l'enseignant de se retrouver
// quand un élève n'a pas la note et doit se racheter.
const NATURES_SECONDAIRE = [
  { value: "IE", court: "IE", label: "IE — Interrogation écrite" },
  { value: "IO", court: "IO", label: "IO — Interrogation orale" },
  { value: "DC", court: "DC", label: "DC — Devoir de classe" },
  { value: "DN", court: "DN", label: "DN — Devoir de niveau" },
];

const NATURES_PRIMAIRE = [
  { value: "COMP_ESSAI", court: "Comp. d'essai", label: "Composition d'essai" },
  { value: "COMP_PASSAGE", court: "Comp. de passage", label: "Composition de passage" },
];

const TOUTES_NATURES = [...NATURES_SECONDAIRE, ...NATURES_PRIMAIRE];

function natureCourte(nature: string | null | undefined) {
  return TOUTES_NATURES.find((n) => n.value === nature)?.court ?? "";
}

// Lecture tolérante : accepte "7,5" et "7.5"
function parseNote(s: string) {
  return parseFloat(String(s).trim().replace(",", "."));
}

const LIBELLES_FRANCAIS_COLLEGE = ["CF", "Orth.", "EO"];

function libelleColonne(ev: Evaluation) {
  const cat = CATEGORIES.find((c) => c.value === ev.categorie);
  const date = new Date(ev.date_evaluation).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const nature = natureCourte(ev.nature);
  return `${nature ? nature + " · " : ""}${ev.libelle || cat?.label || ev.categorie} · /${ev.bareme_max} · ${date}`;
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
  eleves: elevesBruts,
  evaluationsExistantes,
  notesExistantes,
  observationsExistantes,
  bonusExistants,
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
  bonusExistants: Bonus[];
  validation: Validation;
  seuilsMentions: Record<string, number>;
}) {
  const supabase = createClient();
  const router = useRouter();

  // Tri alphabétique (nom puis prénom), accents gérés en français
  const eleves = [...elevesBruts].sort((a, b) => {
    const na = `${a.profiles?.nom ?? ""} ${a.profiles?.prenom ?? ""}`.trim();
    const nb = `${b.profiles?.nom ?? ""} ${b.profiles?.prenom ?? ""}`.trim();
    return na.localeCompare(nb, "fr", { sensitivity: "base" });
  });

  const estVerrouille = validation?.valide === true;

  const initial: Record<string, Record<string, string>> = {};
  eleves.forEach((e) => {
    const ligne: Record<string, string> = { appreciation: "" };
    evaluationsExistantes.forEach((ev) => {
      const note = notesExistantes.find((n) => n.eleve_id === e.id && n.evaluation_id === ev.id);
      ligne[ev.id] = note && note.valeur !== null && note.valeur !== undefined ? String(note.valeur) : "";
    });
    const appreciation = observationsExistantes.find((o) => o.eleve_id === e.id);
    if (appreciation) ligne.appreciation = appreciation.texte;
    initial[e.id] = ligne;
  });

  const initialBonus: Record<string, string> = {};
  eleves.forEach((e) => {
    const b = bonusExistants.find((x) => x.eleve_id === e.id);
    initialBonus[e.id] = b && b.valeur !== null && b.valeur !== undefined ? String(b.valeur) : "";
  });

  const [valeurs, setValeurs] = useState(initial);
  const [bonus, setBonus] = useState(initialBonus);
  const [enregistrement, setEnregistrement] = useState(false);
  const [validationEnCours, setValidationEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verrouille, setVerrouille] = useState(estVerrouille);
  const [validePar, setValidePar] = useState(validation?.valide_at ?? null);
  const [valideParId, setValideParId] = useState(validation?.valide_par ?? null);
  const [modeEdition, setModeEdition] = useState(false);

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nouvelleCategorie, setNouvelleCategorie] = useState<Evaluation["categorie"]>("sur10");
  const [nouvelleNature, setNouvelleNature] = useState("");
  const [nouvelleDate, setNouvelleDate] = useState(new Date().toISOString().slice(0, 10));
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [classeCycle, setClasseCycle] = useState<string | null>(null);
  const [naturesLocales, setNaturesLocales] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase
      .from("classes")
      .select("cycle")
      .eq("id", classeId)
      .single()
      .then(({ data }) => setClasseCycle(data?.cycle ?? null));
  }, [classeId, supabase]);

  const estFrancaisCollege = matiereNom === "Français" && classeCycle === "college";

  // Au primaire : seulement les deux compositions. Ailleurs : IE, IO, DC, DN.
  const naturesDisponibles = classeCycle === "primaire" ? NATURES_PRIMAIRE : NATURES_SECONDAIRE;

  function moyenne(eleveId: string) {
    const v = valeurs[eleveId];
    const termes: { val: number; poids: number }[] = [];

    evaluationsExistantes.forEach((ev) => {
      const brut = parseNote(v[ev.id]);
      if (!isNaN(brut)) {
        const surVingt = brut * (20 / ev.bareme_max);
        termes.push({ val: surVingt, poids: ev.coefficient });
      }
    });

    if (termes.length === 0) return null;
    const poidsTotal = termes.reduce((a, t) => a + t.poids, 0);
    const somme = termes.reduce((a, t) => a + t.val * t.poids, 0);
    const base = somme / poidsTotal;

    const bonusBrut = parseNote(bonus[eleveId]);
    const bonusValeur = isNaN(bonusBrut) ? 0 : bonusBrut;

    return base + bonusValeur;
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

  function v0(eleveId: string, evaluationId: string) {
    return initial[eleveId]?.[evaluationId] ?? "";
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

  // Pour les anciennes évaluations créées avant l'ajout de la nature
  async function definirNature(evaluationId: string, nature: string) {
    if (!nature) return;
    setMessage(null);

    const { error } = await supabase
      .from("evaluations")
      .update({ nature })
      .eq("id", evaluationId);

    if (error) {
      setMessage("Erreur lors de l'enregistrement de la nature : " + error.message);
      return;
    }

    setNaturesLocales((prev) => ({ ...prev, [evaluationId]: nature }));
    router.refresh();
  }

  async function creerEvaluation() {
    if (!nouvelleNature) {
      setMessage("Erreur : choisis la nature de l'évaluation avant de la créer.");
      return;
    }

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
      nature: nouvelleNature,
      libelle: nouveauLibelle.trim() || null,
      date_evaluation: nouvelleDate,
    });

    setCreationEnCours(false);

    if (error) {
      setMessage("Erreur lors de la création de l'évaluation : " + error.message);
      return;
    }

    setNouveauLibelle("");
    setNouvelleNature("");
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

        const nombre = parseNote(saisie);
        if (isNaN(nombre)) {
          erreurs.push(`${nomComplet} — ${libelleColonne(ev)} : valeur invalide (contenu lu : « ${saisie} », avant : « ${v0(eleve.id, ev.id)} »).`);
        } else if (nombre < 0 || nombre > ev.bareme_max) {
          erreurs.push(
            `${nomComplet} — ${libelleColonne(ev)} : ${saisie} dépasse le barème autorisé (0 à ${ev.bareme_max}).`
          );
        }
      }

      const bonusSaisi = bonus[eleve.id];
      if (bonusSaisi !== "") {
        const nombreBonus = parseNote(bonusSaisi);
        if (isNaN(nombreBonus) || nombreBonus < -5 || nombreBonus > 5) {
          erreurs.push(`${nomComplet} — Bonus : doit être entre -5 et +5.`);
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

    const historiques: any[] = [];
    const notesAInserer: any[] = [];
    const elevesParEval: Record<string, string[]> = {};
    const notifs: any[] = [];
    const bonusAUpserter: any[] = [];
    const bonusASupprimer: string[] = [];
    const obsASupprimer: string[] = [];
    const obsAInserer: any[] = [];

    for (const eleve of eleves) {
      const v = valeurs[eleve.id];
      const avant = initial[eleve.id];
      const nomComplet = `${eleve.profiles?.nom ?? ""} ${eleve.profiles?.prenom ?? ""}`.trim();

      for (const ev of evaluationsExistantes) {
        if (!celluleModifiable(eleve.id, ev.id)) continue;
        const ancienne = avant[ev.id];
        const nouvelle = v[ev.id];
        if (ancienne === nouvelle) continue;

        historiques.push({
          eleve_id: eleve.id,
          matiere_id: matiereId,
          classe_id: classeId,
          trimestre: Number(trimestre),
          annee_scolaire: anneeScolaire,
          type: ev.type_note,
          ancienne_valeur: ancienne === "" ? null : parseNote(ancienne),
          nouvelle_valeur: nouvelle === "" ? null : parseNote(nouvelle),
          modifie_par: enseignantId,
        });

        if (!elevesParEval[ev.id]) elevesParEval[ev.id] = [];
        elevesParEval[ev.id].push(eleve.id);

        if (nouvelle !== "") {
          notesAInserer.push({
            eleve_id: eleve.id,
            matiere_id: matiereId,
            classe_id: classeId,
            enseignant_id: enseignantId,
            evaluation_id: ev.id,
            type: ev.type_note,
            valeur: parseNote(nouvelle),
            coefficient: ev.coefficient,
            bareme_max: ev.bareme_max,
            trimestre,
            annee_scolaire: anneeScolaire,
          });
        }

        if (ancienne !== "") {
          const contenu = `Note modifiée pour ${nomComplet} (${matiereNom} — ${libelleColonne(ev)}) : ${ancienne || "—"} → ${nouvelle}`;
          for (const role of ["chef", "directeur_etudes"]) {
            notifs.push({
              etablissement_id: etablissementId,
              destinataire_role: role,
              titre: "Modification de note",
              contenu,
            });
          }
        }
      }

      if (bonus[eleve.id] !== initialBonus[eleve.id]) {
        if (bonus[eleve.id] !== "") {
          bonusAUpserter.push({
            eleve_id: eleve.id,
            classe_id: classeId,
            matiere_id: matiereId,
            trimestre: Number(trimestre),
            annee_scolaire: anneeScolaire,
            valeur: parseNote(bonus[eleve.id]),
            enseignant_id: enseignantId,
            updated_at: new Date().toISOString(),
          });
        } else {
          bonusASupprimer.push(eleve.id);
        }
      }

      if (v.appreciation.trim() !== avant.appreciation.trim()) {
        obsASupprimer.push(eleve.id);
        if (v.appreciation.trim() !== "") {
          obsAInserer.push({
            eleve_id: eleve.id,
            enseignant_id: enseignantId,
            matiere_id: matiereId,
            texte: v.appreciation.trim(),
            trimestre,
            annee_scolaire: anneeScolaire,
          });
        }
      }
    }

    try {
      // 1. Historique (une seule requête)
      if (historiques.length > 0) {
        await supabase.from("notes_historique").insert(historiques);
      }

      // 2. Notes : suppression groupée par évaluation, puis insertion unique
      const suppressions = await Promise.all(
        Object.entries(elevesParEval).map(([evId, ids]) =>
          supabase.from("notes").delete().eq("evaluation_id", evId).in("eleve_id", ids)
        )
      );
      const errSupp = suppressions.find((r) => r.error);
      if (errSupp?.error) throw new Error(errSupp.error.message);

      if (notesAInserer.length > 0) {
        const { error } = await supabase.from("notes").insert(notesAInserer);
        if (error) throw new Error(error.message);
      }

      // 3. Notifications, bonus et appréciations en parallèle
      const taches: PromiseLike<{ error: any }>[] = [];

      if (notifs.length > 0) {
        taches.push(supabase.from("notifications").insert(notifs));
      }
      if (bonusAUpserter.length > 0) {
        taches.push(
          supabase.from("bonus_moyenne").upsert(bonusAUpserter, {
            onConflict: "eleve_id,matiere_id,trimestre,annee_scolaire",
          })
        );
      }
      if (bonusASupprimer.length > 0) {
        taches.push(
          supabase
            .from("bonus_moyenne")
            .delete()
            .in("eleve_id", bonusASupprimer)
            .eq("matiere_id", matiereId)
            .eq("trimestre", Number(trimestre))
            .eq("annee_scolaire", anneeScolaire)
        );
      }
      if (obsASupprimer.length > 0) {
        taches.push(
          (async () => {
            const del = await supabase
              .from("observations")
              .delete()
              .in("eleve_id", obsASupprimer)
              .eq("matiere_id", matiereId)
              .eq("trimestre", trimestre)
              .eq("enseignant_id", enseignantId);
            if (del.error) return del;
            if (obsAInserer.length > 0) {
              return await supabase.from("observations").insert(obsAInserer);
            }
            return del;
          })()
        );
      }

      const resultats = await Promise.all(taches);
      const echec = resultats.find((r) => r.error);
      if (echec?.error) throw new Error(echec.error.message);
    } catch (e: any) {
      setMessage("Erreur : " + e.message);
      setEnregistrement(false);
      return;
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
      <div className="flex justify-center mb-2">
        <div
          className="border-2 border-black text-center py-2 px-6 font-bold inline-block"
          style={{ color: "#0B3D2E" }}
        >
          {classeNom} — TRIMESTRE {trimestre} — {matiereNom.toUpperCase()}
        </div>
      </div>
      <p className="text-center text-sm text-neutral-500 mb-4">
        {eleves.length} élève(s) · Année {anneeScolaire}
      </p>

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
                <label className="block text-xs text-neutral-500 mb-1">Nature de l'évaluation</label>
                <select
                  value={nouvelleNature}
                  onChange={(e) => setNouvelleNature(e.target.value)}
                  className="w-full border rounded-lg p-2 text-sm"
                >
                  <option value="">Choisir...</option>
                  {naturesDisponibles.map((n) => (
                    <option key={n.value} value={n.value}>{n.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Barème</label>
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

          <div className="overflow-x-auto mb-2">
            <table className="w-full text-xs border-collapse border border-gray-400">
              <thead>
                <tr style={{ backgroundColor: "#0B3D2E", color: "white" }}>
                  <th className="border border-gray-400 p-1 w-8">N°</th>
                  <th className="border border-gray-400 p-1 text-left">Matricule</th>
                  <th className="border border-gray-400 p-1 text-left sticky left-0" style={{ backgroundColor: "#0B3D2E" }}>
                    Nom et Prénoms
                  </th>
                  {evaluationsExistantes.map((ev) => {
                    const cat = CATEGORIES.find((c) => c.value === ev.categorie);
                    const date = new Date(ev.date_evaluation).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                    const nature = naturesLocales[ev.id] ?? ev.nature ?? null;
                    return (
                      <th key={ev.id} className="border border-gray-400 p-1 whitespace-nowrap">
                        {nature ? (
                          <div className="font-bold">{natureCourte(nature)}</div>
                        ) : !verrouille ? (
                          <select
                            value=""
                            onChange={(evt) => definirNature(ev.id, evt.target.value)}
                            className="text-black text-[10px] rounded p-0.5 mb-0.5"
                          >
                            <option value="">Nature ?</option>
                            {TOUTES_NATURES.map((n) => (
                              <option key={n.value} value={n.value}>{n.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="opacity-70">Nature ?</div>
                        )}
                        <div className="font-semibold">{ev.libelle || cat?.label || ev.categorie}</div>
                        <div className="font-normal opacity-80">/{ev.bareme_max} · {date}</div>
                        {!verrouille && (
                          <button
                            type="button"
                            onClick={() => supprimerEvaluation(ev.id)}
                            title="Supprimer cette évaluation"
                            className="text-xs mt-0.5"
                          >
                            🗑️
                          </button>
                        )}
                      </th>
                    );
                  })}
                  <th className="border border-gray-400 p-1">Bonus</th>
                  <th className="border border-gray-400 p-1">Moy.</th>
                  <th className="border border-gray-400 p-1">Rang</th>
                  <th className="border border-gray-400 p-1">Appréciation</th>
                </tr>
              </thead>
              <tbody>
                {eleves.map((e, i) => {
                  const m = moyenne(e.id);
                  const suggestion = appreciationSuggeree(m);
                  return (
                    <tr key={e.id}>
                      <td className="border border-gray-400 p-1 text-center">{i + 1}</td>
                      <td className="border border-gray-400 p-1 font-mono whitespace-nowrap">{e.matricule || "—"}</td>
                      <td className="border border-gray-400 p-1 whitespace-nowrap sticky left-0 bg-white">
                        {e.profiles?.nom} {e.profiles?.prenom}
                      </td>
                      {evaluationsExistantes.map((ev) => {
                        const modifiable = celluleModifiable(e.id, ev.id);
                        const valeurActuelle = valeurs[e.id][ev.id];
                        const nombre = parseNote(valeurActuelle);
                        const horsBareme =
                          valeurActuelle !== "" &&
                          !isNaN(nombre) &&
                          (nombre < 0 || nombre > ev.bareme_max);
                        return (
                          <td key={ev.id} className="border border-gray-400 p-1 text-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={verrouille || !modifiable}
                              value={valeurActuelle}
                              onChange={(evt) => {
                                const propre = evt.target.value.replace(",", ".").replace(/[^0-9.]/g, "");
                                setValeurs((prev) => ({
                                  ...prev,
                                  [e.id]: { ...prev[e.id], [ev.id]: propre },
                                }));
                              }}
                              placeholder="—"
                              className={`w-14 border border-gray-400 rounded-none p-1 text-center disabled:bg-neutral-100 disabled:text-neutral-500 ${
                                horsBareme ? "border-red-500 bg-red-50 text-red-700" : ""
                              }`}
                            />
                            {horsBareme && (
                              <div className="text-[10px] text-red-600">Max {ev.bareme_max}</div>
                            )}
                          </td>
                        );
                      })}
                      <td className="border border-gray-400 p-1 text-center">
                        <input
                          type="number"
                          min={-5}
                          max={5}
                          step={0.5}
                          disabled={verrouille}
                          value={bonus[e.id]}
                          onChange={(evt) =>
                            setBonus((prev) => ({ ...prev, [e.id]: evt.target.value }))
                          }
                          placeholder="0"
                          className="w-14 border border-gray-400 rounded-none p-1 text-center disabled:bg-neutral-100 disabled:text-neutral-500"
                        />
                      </td>
                      <td className="border border-gray-400 p-1 text-center font-medium">
                        {m !== null ? m.toFixed(2) : "-"}
                      </td>
                      <td className="border border-gray-400 p-1 text-center whitespace-nowrap">{rang(e.id)}</td>
                      <td className="border border-gray-400 p-1">
                        <input
                          type="text"
                          disabled={verrouille}
                          value={valeurs[e.id].appreciation}
                          onChange={(ev) =>
                            setValeurs((prev) => ({
                              ...prev,
                              [e.id]: { ...prev[e.id], appreciation: ev.target.value },
                            }))
                          }
                          placeholder={suggestion ?? "Appréciation..."}
                          className="w-36 border border-gray-400 rounded-none p-1 disabled:bg-neutral-100 disabled:text-neutral-500"
                        />
                        {suggestion && !verrouille && valeurs[e.id].appreciation.trim() === "" && (
                          <button
                            type="button"
                            onClick={() =>
                              setValeurs((prev) => ({
                                ...prev,
                                [e.id]: { ...prev[e.id], appreciation: suggestion },
                              }))
                            }
                            className="ml-1 underline text-neutral-500"
                          >
                            Utiliser
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border border-gray-400 bg-neutral-50 p-3 flex items-center justify-between text-sm mb-4">
            <div>
              <span className="font-medium">Moyenne de classe : </span>
              {moyenneClasse !== null ? moyenneClasse.toFixed(2) + "/20" : "-"}
            </div>
            <div className="text-neutral-500">
              {new Date().toLocaleDateString("fr-FR")} — EGS
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={enregistrement || verrouille}
              className="text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50"
              style={{ backgroundColor: "#0B3D2E" }}
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
