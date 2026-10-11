'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Epreuve = {
  id: string;
  matiere_id: string;
  matiere_nom: string;
  nom: string;
  coefficient: number;
  bareme: number;
  duree: string | null;
  type_epreuve: string;
  role_langue: string | null;
  serie: string | null; // null = épreuve commune à toutes les séries
};

type MatiereDisponible = { id: string; nom: string };

const TYPES_EPREUVE = [
  { value: 'ecrit', label: 'Écrit' },
  { value: 'oral', label: 'Oral' },
  { value: 'pratique', label: 'Pratique' },
  { value: 'autre', label: 'Autre' },
];

// Langues vivantes : chaque candidat en choisit une comme LV1 et une comme LV2 (dans la liste des candidats)
const NOMS_LV = ['allemand', 'anglais', 'espagnol'];
const estLV = (nom: string) => NOMS_LV.includes(nom.trim().toLowerCase());
// Seules les séries A1 et A2 ont un choix de LV1 / LV2 ; en C et D, l'anglais est une matière normale
const SERIES_AVEC_LV = ['A1', 'A2'];

const SERIES_BAC = ['A1', 'A2', 'C', 'D'];
const TOUTES = 'toutes';
const POINTS_ATTENDUS_BAC = 400;

const comparerSeries = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

export default function ExamenEpreuvesPage() {
  const params = useParams();
  const examenId = params?.id as string;
  const supabase = createClient();

  const [examenNom, setExamenNom] = useState('');
  const [estBac, setEstBac] = useState(false);
  const [examenSerie, setExamenSerie] = useState<string | null>(null);
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  const [epreuves, setEpreuves] = useState<Epreuve[]>([]);
  const [matieresDisponibles, setMatieresDisponibles] = useState<MatiereDisponible[]>([]);

  const [matiereChoisie, setMatiereChoisie] = useState('');
  const [serieChoisie, setSerieChoisie] = useState('');
  const [nomEpreuve, setNomEpreuve] = useState('');
  const [coefficient, setCoefficient] = useState('1');
  const [bareme, setBareme] = useState('20');
  const [duree, setDuree] = useState('');
  const [typeEpreuve, setTypeEpreuve] = useState('ecrit');

  const [copieSource, setCopieSource] = useState('');
  const [copieCible, setCopieCible] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const matiereNomChoisie = matieresDisponibles.find((m) => m.id === matiereChoisie)?.nom ?? '';
  const nomAuto = matiereNomChoisie
    ? `${matiereNomChoisie} ${TYPES_EPREUVE.find((t) => t.value === typeEpreuve)?.label ?? ''}`.trim()
    : '';

  const charger = useCallback(
    async (silencieux = false) => {
      if (!silencieux) setLoading(true);
      setError(null);

      try {
        const { data: examen, error: examenError } = await supabase
          .from('examens')
          .select('nom, etablissement_id, niveau, serie')
          .eq('id', examenId)
          .single();

        if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
        setExamenNom(examen.nom);
        const bac = examen.niveau === 'Terminale';
        setEstBac(bac);
        setExamenSerie(examen.serie ?? null);
        if (examen.serie) setSerieChoisie((prev) => prev || examen.serie);

        const { data: emData, error: emError } = await supabase
          .from('examens_matieres')
          .select('id, matiere_id, nom, coefficient, bareme, duree, type_epreuve, role_langue, serie, matieres(nom)')
          .eq('examen_id', examenId);

        if (emError) throw new Error(`Erreur épreuves : ${emError.message}`);

        type Row = {
          id: string; matiere_id: string; nom: string; coefficient: number;
          bareme: number; duree: string | null; type_epreuve: string; role_langue: string | null;
          serie: string | null;
          matieres: { nom: string } | { nom: string }[] | null;
        };
        const liste: Epreuve[] = ((emData ?? []) as unknown as Row[]).map((r) => {
          const m = Array.isArray(r.matieres) ? r.matieres[0] : r.matieres;
          return {
            id: r.id, matiere_id: r.matiere_id, matiere_nom: m?.nom ?? 'Inconnue',
            nom: r.nom, coefficient: Number(r.coefficient), bareme: r.bareme,
            duree: r.duree, type_epreuve: r.type_epreuve, role_langue: r.role_langue,
            serie: r.serie ?? null,
          };
        });
        liste.sort((a, b) => a.matiere_nom.localeCompare(b.matiere_nom) || a.nom.localeCompare(b.nom));
        setEpreuves(liste);

        const { data: toutesMatieres, error: matError } = await supabase
          .from('matieres')
          .select('id, nom')
          .eq('etablissement_id', examen.etablissement_id);

        if (matError) throw new Error(`Erreur liste matières : ${matError.message}`);
        setMatieresDisponibles((toutesMatieres ?? []).sort((a: MatiereDisponible, b: MatiereDisponible) => a.nom.localeCompare(b.nom)));

        // Séries proposées pour un examen de Terminale
        if (bac) {
          if (examen.serie) {
            setSeriesOptions([examen.serie]);
          } else {
            const { data: classesData } = await supabase
              .from('classes')
              .select('serie')
              .eq('etablissement_id', examen.etablissement_id)
              .eq('niveau', 'Terminale')
              .not('serie', 'is', null);

            const uniques = Array.from(
              new Set((classesData ?? []).map((c: { serie: string | null }) => c.serie).filter(Boolean))
            ) as string[];
            setSeriesOptions((uniques.length > 0 ? uniques : SERIES_BAC).sort(comparerSeries));
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    },
    [examenId, supabase]
  );

  useEffect(() => {
    charger();
  }, [charger]);

  // Total de points d'une série : épreuves communes + épreuves propres à la série.
  // Matières normales : toutes comptent (écrit + oral d'une même matière s'additionnent).
  // Séries A1 et A2 : langues vivantes (allemand, anglais, espagnol) : un candidat n'en passe que deux (sa LV1
  // et sa LV2), on compte donc les deux matières de langue les mieux dotées. Séries C et D : tout compte.
  function totalPointsPourSerie(serie: string): number {
    const applicables = epreuves.filter((e) => !e.serie || e.serie === serie);

    // Anciennes épreuves créées avec un rôle LV1/LV2 explicite
    const pointsRole = (role: string) => {
      const parMatiere = new Map<string, number>();
      applicables
        .filter((e) => e.role_langue === role)
        .forEach((e) => parMatiere.set(e.matiere_id, (parMatiere.get(e.matiere_id) ?? 0) + e.coefficient));
      const valeurs = Array.from(parMatiere.values());
      return valeurs.length > 0 ? Math.max(...valeurs) : 0;
    };

    const sansRole = applicables.filter((e) => !e.role_langue);
    const choixLV = SERIES_AVEC_LV.includes(serie);
    const normales = sansRole
      .filter((e) => !choixLV || !estLV(e.matiere_nom))
      .reduce((somme, e) => somme + e.coefficient, 0);

    const parLangue = new Map<string, number>();
    sansRole
      .filter((e) => choixLV && estLV(e.matiere_nom))
      .forEach((e) => parLangue.set(e.matiere_id, (parLangue.get(e.matiere_id) ?? 0) + e.coefficient));
    const deuxMeilleures = Array.from(parLangue.values())
      .sort((a, b) => b - a)
      .slice(0, 2)
      .reduce((somme, v) => somme + v, 0);

    return (normales + deuxMeilleures + pointsRole('LV1') + pointsRole('LV2')) * 20;
  }

  function libelleEcart(total: number): string {
    if (total === 0) return 'Aucune épreuve';
    const ecart = POINTS_ATTENDUS_BAC - total;
    if (ecart > 0) return `Il manque ${ecart} pts`;
    return `Dépasse de ${-ecart} pts`;
  }

  async function ajouterEpreuve() {
    if (!matiereChoisie) {
      setError('Choisis une matière.');
      return;
    }
    if (estBac && !serieChoisie) {
      setError('Choisis la série de cette épreuve (ou « Toutes les séries » pour une matière commune).');
      return;
    }
    const nomFinal = nomEpreuve.trim() || nomAuto;
    const serieVoulue = estBac ? (serieChoisie === TOUTES ? null : serieChoisie) : null;
    const doublon = epreuves.some(
      (e) =>
        e.matiere_id === matiereChoisie &&
        e.nom.trim().toLowerCase() === nomFinal.toLowerCase() &&
        (!estBac || (e.serie ?? null) === serieVoulue)
    );
    if (doublon) {
      setError(
        `Une épreuve « ${nomFinal} » existe déjà pour cette matière${estBac ? ' dans cette série' : ''}. ` +
          'Pour ajouter un écrit et un oral de la même matière, laisse le nom vide (« Anglais Écrit », « Anglais Oral ») ou donne-leur deux noms différents.'
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSucces(null);

    const ligne: Record<string, unknown> = {
      examen_id: examenId,
      matiere_id: matiereChoisie,
      nom: nomFinal,
      coefficient: parseFloat(coefficient) || 1,
      bareme: parseFloat(bareme) || 20,
      duree: duree.trim() || null,
      type_epreuve: typeEpreuve,
      role_langue: null,
    };
    if (estBac) ligne.serie = serieChoisie === TOUTES ? null : serieChoisie;

    const { error: insertError } = await supabase.from('examens_matieres').insert(ligne);

    setSaving(false);

    if (insertError) {
      const msg = insertError.message;
      if (msg.includes('examens_matieres_examen_matiere_nom_key')) {
        setError(
          "La règle d'unicité de la base n'a pas encore été remplacée. Exécute le script SQL qui crée « examens_matieres_examen_matiere_nom_serie_key », puis réessaie."
        );
      } else if (msg.includes('duplicate')) {
        setError(
          estBac
            ? 'Cette épreuve existe déjà pour cette matière dans cette série (même nom). Donne-lui un nom différent, par exemple « Anglais Oral ».'
            : 'Une épreuve avec ce nom existe déjà pour cette matière.'
        );
      } else {
        setError(`Erreur ajout : ${msg}`);
      }
      return;
    }

    setSucces(
      estBac
        ? `Épreuve « ${nomFinal} » ajoutée (${serieChoisie === TOUTES ? 'toutes les séries' : `série ${serieChoisie}`}).`
        : 'Épreuve ajoutée.'
    );
    setNomEpreuve('');
    setCoefficient('1');
    setBareme('20');
    setDuree('');
    setTypeEpreuve('ecrit');
    await charger(true);
  }

  async function retirerEpreuve(id: string) {
    setSaving(true);
    setSucces(null);
    const { error: deleteError } = await supabase.from('examens_matieres').delete().eq('id', id);
    setSaving(false);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    await charger(true);
  }

  async function modifierCoefficient(epreuve: Epreuve, valeur: string) {
    const num = parseFloat(valeur.replace(',', '.'));
    if (isNaN(num) || num <= 0) {
      await charger(true);
      setError('Le coefficient doit être un nombre supérieur à 0.');
      return;
    }
    if (num === epreuve.coefficient) return;

    setSaving(true);
    setSucces(null);
    const { data, error: updateError } = await supabase
      .from('examens_matieres')
      .update({ coefficient: num })
      .eq('id', epreuve.id)
      .select('id');
    setSaving(false);

    if (updateError || !data || data.length === 0) {
      await charger(true);
      setError(
        updateError
          ? `Erreur modification : ${updateError.message}`
          : "Modification refusée par la base (droits manquants sur examens_matieres). Retire l'épreuve et ajoute-la de nouveau avec le bon coefficient."
      );
      return;
    }

    setSucces(`Coefficient de « ${epreuve.matiere_nom} — ${epreuve.nom} » mis à ${num}.`);
    await charger(true);
  }

  async function copierEpreuves() {
    if (!copieSource || !copieCible || copieSource === copieCible) {
      setError('Choisis deux séries différentes : celle à copier et celle qui reçoit les épreuves.');
      return;
    }

    const source = epreuves.filter((e) => e.serie === copieSource);
    const dejaPresentes = new Set(
      epreuves.filter((e) => e.serie === copieCible).map((e) => `${e.matiere_id}|${e.nom}`)
    );
    const aCopier = source.filter((e) => !dejaPresentes.has(`${e.matiere_id}|${e.nom}`));

    if (aCopier.length === 0) {
      setError(`Rien à copier : la série ${copieCible} contient déjà toutes les épreuves de la série ${copieSource}.`);
      return;
    }

    const ok = window.confirm(
      `Copier ${aCopier.length} épreuve(s) de la série ${copieSource} vers la série ${copieCible} ? ` +
        'Les coefficients seront identiques : tu pourras ensuite modifier ceux qui diffèrent.'
    );
    if (!ok) return;

    setSaving(true);
    setError(null);
    setSucces(null);

    const { error: copieError } = await supabase.from('examens_matieres').insert(
      aCopier.map((e) => ({
        examen_id: examenId,
        matiere_id: e.matiere_id,
        nom: e.nom,
        coefficient: e.coefficient,
        bareme: e.bareme,
        duree: e.duree,
        type_epreuve: e.type_epreuve,
        role_langue: e.role_langue,
        serie: copieCible,
      }))
    );

    setSaving(false);

    if (copieError) {
      setError(
        copieError.message.includes('examens_matieres_examen_matiere_nom_key')
          ? "La règle d'unicité de la base n'a pas encore été remplacée. Exécute le script SQL qui crée « examens_matieres_examen_matiere_nom_serie_key », puis réessaie."
          : `Erreur copie : ${copieError.message}`
      );
      return;
    }

    setSucces(`${aCopier.length} épreuve(s) copiée(s) de la série ${copieSource} vers la série ${copieCible}. Ajuste maintenant les coefficients qui diffèrent.`);
    setCopieSource('');
    setCopieCible('');
    await charger(true);
  }

  // ---------- Affichage ----------

  function listeEpreuves(liste: Epreuve[]) {
    const parMatiere = liste.reduce<Record<string, Epreuve[]>>((acc, e) => {
      if (!acc[e.matiere_nom]) acc[e.matiere_nom] = [];
      acc[e.matiere_nom].push(e);
      return acc;
    }, {});

    return Object.entries(parMatiere).map(([matiereNom, items]) => (
      <div key={matiereNom} className="border rounded-lg overflow-hidden bg-white">
        <p className="bg-gray-100 px-3 py-2 text-sm font-semibold">{matiereNom}</p>
        <table className="w-full text-sm">
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-2">
                  {e.nom}
                  <span className="text-gray-400 text-xs ml-1">
                    ({TYPES_EPREUVE.find((t) => t.value === e.type_epreuve)?.label})
                  </span>
                  {e.role_langue && (
                    <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">
                      {e.role_langue}
                    </span>
                  )}
                  {estBac && !e.role_langue && estLV(e.matiere_nom) && (!e.serie || SERIES_AVEC_LV.includes(e.serie)) && (
                    <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5">
                      LV
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-gray-500 text-xs whitespace-nowrap">
                  Coef{' '}
                  <input
                    key={`${e.id}-${e.coefficient}`}
                    type="number"
                    step="0.5"
                    min="0"
                    defaultValue={e.coefficient}
                    onBlur={(ev) => modifierCoefficient(e, ev.target.value)}
                    disabled={saving}
                    className="w-14 border rounded px-1 py-0.5 text-center text-sm text-gray-800"
                  />
                  {' '}· /{e.bareme}{e.duree ? ` · ${e.duree}` : ''}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => retirerEpreuve(e.id)} className="text-red-600 text-xs">
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ));
  }

  const seriesAffichees = Array.from(
    new Set([...seriesOptions, ...epreuves.map((e) => e.serie).filter((s): s is string => !!s)])
  ).sort(comparerSeries);

  const epreuvesCommunes = epreuves.filter((e) => !e.serie);
  const seriesAvecEpreuves = Array.from(
    new Set(epreuves.map((e) => e.serie).filter((s): s is string => !!s))
  ).sort(comparerSeries);

  const resumeSeries = seriesAffichees.map((s) => ({ serie: s, total: totalPointsPourSerie(s) }));
  const seriesIncompletes = resumeSeries.filter((r) => r.total !== POINTS_ATTENDUS_BAC);

  const pointsTotalSimple = epreuves.reduce((sum, e) => sum + e.coefficient, 0) * 20;

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-12">
      <h1 className="text-xl font-bold mb-1">Épreuves — {examenNom}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {estBac
          ? `${epreuves.length} épreuve(s) · ${POINTS_ATTENDUS_BAC} points attendus par série`
          : `${epreuves.length} épreuve(s) · ${pointsTotalSimple} points au total`}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {/* Contrôle des totaux par série (examens de Terminale) */}
      {estBac && resumeSeries.length > 0 && (
        <div className="mb-4">
          <div className="grid grid-cols-2 gap-2">
            {resumeSeries.map((r) => {
              const complet = r.total === POINTS_ATTENDUS_BAC;
              return (
                <div
                  key={r.serie}
                  className={`border rounded-lg p-3 text-center ${
                    complet ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'
                  }`}
                >
                  <p className="text-xs text-gray-600">Série {r.serie}</p>
                  <p className="text-lg font-bold">
                    {r.total}/{POINTS_ATTENDUS_BAC} {complet && <span className="text-green-600">✓</span>}
                  </p>
                  {!complet && <p className="text-[11px] text-amber-700">{libelleEcart(r.total)}</p>}
                </div>
              );
            })}
          </div>
          {seriesIncompletes.length > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2">
              Chaque série doit totaliser {POINTS_ATTENDUS_BAC} points (somme des coefficients × 20). Un total
              différent signale souvent une matière oubliée ou un mauvais coefficient. Les épreuves communes à toutes
              les séries comptent dans le total de chaque série. En séries A1 et A2, pour les langues vivantes (allemand, anglais, espagnol), seules les deux matières les mieux dotées sont comptées : la LV1 et la LV2 d'un candidat. En C et D, toutes les épreuves comptent.
            </p>
          )}
        </div>
      )}

      {/* Liste des épreuves */}
      {estBac ? (
        <div className="space-y-5 mb-6">
          {epreuves.length === 0 && (
            <p className="text-sm text-gray-400">Aucune épreuve configurée pour le moment.</p>
          )}

          {epreuvesCommunes.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Toutes les séries (épreuves communes)</p>
              {listeEpreuves(epreuvesCommunes)}
            </div>
          )}

          {seriesAffichees.map((s) => {
            const propres = epreuves.filter((e) => e.serie === s);
            if (propres.length === 0) return null;
            const total = totalPointsPourSerie(s);
            return (
              <div key={s} className="space-y-2">
                <p className="text-sm font-semibold">
                  Série {s} <span className="text-gray-400 font-normal">· {total}/{POINTS_ATTENDUS_BAC} pts</span>
                </p>
                {listeEpreuves(propres)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {epreuves.length === 0 && (
            <p className="text-sm text-gray-400">Aucune épreuve configurée pour le moment.</p>
          )}
          {listeEpreuves(epreuves)}
        </div>
      )}

      {/* Copier les épreuves d'une série vers une autre */}
      {estBac && seriesAvecEpreuves.length > 0 && seriesAffichees.length > 1 && (
        <div className="border rounded-lg p-4 mb-6">
          <p className="font-semibold text-sm mb-1">Copier les épreuves d'une série vers une autre</p>
          <p className="text-xs text-gray-500 mb-3">
            Évite de tout ressaisir : copie une série, puis modifie seulement les coefficients qui diffèrent.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <select
              value={copieSource}
              onChange={(e) => setCopieSource(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">De la série…</option>
              {seriesAvecEpreuves.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={copieCible}
              onChange={(e) => setCopieCible(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Vers la série…</option>
              {seriesAffichees.filter((s) => s !== copieSource).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <button
            onClick={copierEpreuves}
            disabled={saving || !copieSource || !copieCible}
            className="w-full border text-sm px-3 py-2 rounded-md disabled:opacity-50"
          >
            Copier les épreuves
          </button>
        </div>
      )}

      {/* Ajouter une épreuve */}
      <div className="border rounded-lg p-4">
        <p className="font-semibold text-sm mb-3">Ajouter une épreuve</p>
        <div className="space-y-2">
          {estBac && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">Série (obligatoire)</label>
              <select
                value={serieChoisie}
                onChange={(e) => setSerieChoisie(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Choisir la série</option>
                {!examenSerie && <option value={TOUTES}>Toutes les séries (matière commune)</option>}
                {seriesOptions.map((s) => (
                  <option key={s} value={s}>Série {s}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Les coefficients diffèrent selon la série : ajoute la même matière une fois par série, avec son
                coefficient. « Toutes les séries » = même épreuve et même coefficient pour tous.
              </p>
            </div>
          )}

          <select
            value={matiereChoisie}
            onChange={(e) => setMatiereChoisie(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Choisir une matière</option>
            {matieresDisponibles.map((m) => (
              <option key={m.id} value={m.id}>{m.nom}</option>
            ))}
          </select>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Nom de l'épreuve (facultatif)</label>
            <input
              type="text"
              value={nomEpreuve}
              onChange={(e) => setNomEpreuve(e.target.value)}
              placeholder={nomAuto ? `Par défaut : ${nomAuto}` : "ex: Orthographe, Épreuve unique"}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Une matière peut avoir plusieurs épreuves (écrit et oral) : choisis le type, laisse le nom vide et il
              sera « {nomAuto || 'Anglais Oral'} » selon la matière et le type.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Coefficient</label>
              <input
                type="number" step="0.5" value={coefficient}
                onChange={(e) => setCoefficient(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Barème (/pts)</label>
              <input
                type="number" step="1" value={bareme}
                onChange={(e) => setBareme(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Durée</label>
              <input
                type="text" value={duree}
                onChange={(e) => setDuree(e.target.value)}
                placeholder="ex: 2h"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Type</label>
              <select
                value={typeEpreuve}
                onChange={(e) => setTypeEpreuve(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                {TYPES_EPREUVE.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {estBac && estLV(matiereNomChoisie) && (!serieChoisie || serieChoisie === TOUTES || SERIES_AVEC_LV.includes(serieChoisie)) && (
            <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-2">
              Langue vivante : en séries A1 et A2, seuls les candidats qui ont choisi {matiereNomChoisie} comme LV1 ou
              LV2 (dans la liste des candidats) passeront cette épreuve. En séries C et D, tous les candidats la passent.
            </p>
          )}

          <button
            onClick={ajouterEpreuve}
            disabled={saving || !matiereChoisie || (estBac && !serieChoisie)}
            className="w-full bg-blue-600 text-white text-sm px-3 py-2 rounded-md disabled:opacity-50"
          >
            Ajouter l'épreuve
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Ex: pour le Français au BEPC, ajoute deux épreuves séparées — "Orthographe" (coef 1) et "CF" (coef 2).
          <br />
          Ex: pour le BAC, l'Anglais écrit et l'Anglais oral sont deux épreuves de la même matière : ajoute-les l'une
          après l'autre en changeant le type (Écrit puis Oral). En séries A1 et A2, les langues vivantes (allemand,
          anglais, espagnol) dépendent du choix de LV1 et de LV2 de chaque candidat ; en C et D, l'anglais est passé par tous.
        </p>
      </div>
    </main>
  );
}
