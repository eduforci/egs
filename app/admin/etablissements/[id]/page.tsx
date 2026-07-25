"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STATUTS = ["actif", "en_attente", "suspendu", "expire"] as const;

type Classe = { id: string; nom: string; niveau: string; annee_scolaire: string };
type ClasseMatiere = {
  classe_id: string;
  matiere_id: string;
  coefficient: number;
  matieres: { nom: string }[] | { nom: string } | null;
};
type Parametres = {
  nb_trimestres: number;
  bareme_max: number;
  seuils_mentions: Record<string, number>;
  moyenne_admission: number;
  regle_decision: string | null;
};
type Bareme = { id: string; type_evaluation: string; bareme_max: number; poids: number };

// Récupère le nom de la matière, que Supabase renvoie un objet ou un tableau
function nomMatiere(cm: ClasseMatiere): string {
  if (!cm.matieres) return "";
  if (Array.isArray(cm.matieres)) return cm.matieres[0]?.nom ?? "";
  return cm.matieres.nom ?? "";
}

export default function ModifierEtablissement() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();

  const [chargementInitial, setChargementInitial] = useState(true);
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [statut, setStatut] = useState<(typeof STATUTS)[number]>("en_attente");
  const [dateDebut, setDateDebut] = useState("");
  const [initialise, setInitialise] = useState(false);
  const [typeEtablissement, setTypeEtablissement] = useState<string | null>(null);
  const [systeme, setSysteme] = useState<string | null>(null);

  const [classes, setClasses] = useState<Classe[]>([]);
  const [classesMatieres, setClassesMatieres] = useState<ClasseMatiere[]>([]);
  const [parametres, setParametres] = useState<Parametres | null>(null);
  const [baremes, setBaremes] = useState<Bareme[]>([]);

  const [chargement, setChargement] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    async function charger() {
      const { data, error } = await supabase
        .from("etablissements")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        setErreur("Impossible de charger cet établissement.");
        setChargementInitial(false);
        return;
      }

      setNom(data.nom ?? "");
      setVille(data.ville ?? "");
      setAdresse(data.adresse ?? "");
      setTelephone(data.telephone ?? "");
      setStatut(data.statut ?? "en_attente");
      setDateDebut(data.date_debut_abonnement ?? "");
      setInitialise(data.initialise ?? false);
      setTypeEtablissement(data.type_etablissement ?? null);
      setSysteme(data.systeme_enseignement ?? null);

      const { data: classesData } = await supabase
        .from("classes")
        .select("id, nom, niveau, annee_scolaire")
        .eq("etablissement_id", id)
        .order("niveau", { ascending: true });

      const { data: classesMatieresData } = await supabase
        .from("classes_matieres")
        .select("classe_id, matiere_id, coefficient, matieres ( nom )")
        .in("classe_id", (classesData ?? []).map((c) => c.id));

      const { data: parametresData } = await supabase
        .from("parametres_pedagogiques")
        .select("*")
        .eq("etablissement_id", id)
        .maybeSingle();

      const { data: baremesData } = await supabase
        .from("baremes_evaluations")
        .select("id, type_evaluation, bareme_max, poids")
        .eq("etablissement_id", id)
        .order("ordre", { ascending: true });

      setClasses(classesData ?? []);
      setClassesMatieres((classesMatieresData ?? []) as unknown as ClasseMatiere[]);
      setParametres(parametresData ?? null);
      setBaremes(baremesData ?? []);
      setChargementInitial(false);
    }

    charger();
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!nom.trim()) {
      setErreur("Le nom de l'établissement est obligatoire.");
      return;
    }

    setChargement(true);

    const { error } = await supabase
      .from("etablissements")
      .update({
        nom: nom.trim(),
        ville: ville.trim() || null,
        adresse: adresse.trim() || null,
        telephone: telephone.trim() || null,
        statut,
        date_debut_abonnement: dateDebut || null,
      })
      .eq("id", id);

    setChargement(false);

    if (error) {
      setErreur(error.message);
      return;
    }

    router.push("/admin/etablissements");
    router.refresh();
  }

  async function handleDelete() {
    const confirmation = window.confirm(
      "Voulez-vous vraiment supprimer cet établissement ? Cette action est irréversible."
    );
    if (!confirmation) return;

    setSuppression(true);
    setErreur(null);

    const { error } = await supabase
      .from("etablissements")
      .delete()
      .eq("id", id);

    setSuppression(false);

    if (error) {
      setErreur(error.message);
      return;
    }

    router.push("/admin/etablissements");
    router.refresh();
  }

  if (chargementInitial) {
    return <main className="p-8">Chargement...</main>;
  }

  return (
    <main className="p-6 sm:p-8 max-w-xl">
      <h1 className="font-display text-3xl font-semibold mb-1">
        Modifier l'établissement
      </h1>
      <p className="text-neutral-500 mb-6">
        Mettez à jour les informations ou supprimez l'établissement.
      </p>

      {/* Structure créée par le moteur d'initialisation */}
      <div className="bg-white border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-semibold">Structure de l'établissement</h2>
          {initialise ? (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
              Initialisé
            </span>
          ) : (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
              Non initialisé
            </span>
          )}
        </div>

        {typeEtablissement && (
          <p className="text-sm text-neutral-500 mb-3">
            {typeEtablissement} · système {systeme}
          </p>
        )}

        <div className="space-y-6">
          <div>
            <h3 className="text-xs uppercase text-neutral-500 mb-2">
              Classes ({classes.length})
            </h3>
            {classes.length > 0 ? (
              <ul className="text-sm space-y-1">
                {classes.map((c) => (
                  <li key={c.id} className="flex justify-between border-b pb-1">
                    <span>{c.nom}</span>
                    <span className="text-neutral-400">{c.annee_scolaire}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-400">Aucune classe.</p>
            )}
          </div>

          <div>
            <h3 className="text-xs uppercase text-neutral-500 mb-2">
              Matières et coefficients par classe
            </h3>
            {classes.length > 0 ? (
              <div className="space-y-3">
                {classes.map((c) => {
                  const lignes = classesMatieres.filter((cm) => cm.classe_id === c.id);
                  return (
                    <div key={c.id}>
                      <p className="text-sm font-medium mb-1">{c.nom}</p>
                      {lignes.length > 0 ? (
                        <ul className="text-sm space-y-1 pl-2">
                          {lignes.map((cm, i) => (
                            <li key={i} className="flex justify-between border-b pb-1">
                              <span>{nomMatiere(cm)}</span>
                              <span className="text-neutral-400">coef. {cm.coefficient}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-neutral-400 pl-2">Aucune matière.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">Aucune classe.</p>
            )}
          </div>
        </div>

        {parametres && (
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-xs uppercase text-neutral-500 mb-2">
              Paramètres pédagogiques
            </h3>
            <p className="text-sm">
              {parametres.nb_trimestres} trimestres · barème /{parametres.bareme_max} ·
              admission dès {parametres.moyenne_admission}/20
            </p>
            {parametres.regle_decision && (
              <p className="text-sm text-neutral-500">{parametres.regle_decision}</p>
            )}
          </div>
        )}

        {baremes.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-xs uppercase text-neutral-500 mb-2">
              Barèmes d'évaluation
            </h3>
            <ul className="text-sm space-y-1">
              {baremes.map((b) => (
                <li key={b.id} className="flex justify-between border-b pb-1">
                  <span className="capitalize">{b.type_evaluation}</span>
                  <span className="text-neutral-400">
                    /{b.bareme_max} · poids {b.poids}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border rounded-xl p-6 space-y-4"
      >
        {erreur && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">
            {erreur}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">
            Nom de l'établissement *
          </label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Ville</label>
          <input
            type="text"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Adresse</label>
          <input
            type="text"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Téléphone</label>
          <input
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Statut</label>
          <select
            value={statut}
            onChange={(e) =>
              setStatut(e.target.value as (typeof STATUTS)[number])
            }
            className="w-full border rounded-lg p-2"
          >
            {STATUTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Date de début d'abonnement
          </label>
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="w-full border rounded-lg p-2"
          />
        </div>

        <button
          type="submit"
          disabled={chargement}
          className="w-full bg-black text-white rounded-lg p-3 font-medium disabled:opacity-50"
        >
          {chargement ? "Enregistrement..." : "Enregistrer les modifications"}
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={suppression}
          className="w-full border border-red-300 text-red-600 rounded-lg p-3 font-medium disabled:opacity-50"
        >
          {suppression ? "Suppression..." : "Supprimer l'établissement"}
        </button>
      </form>
    </main>
  );
        }
    
