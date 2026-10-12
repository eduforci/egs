'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { genererEmploiDuTemps, type EntreeG, type SortieG } from '@/lib/planning-generation';
import { JOURS_LABEL, formaterHeures } from '@/lib/planning';

type ClasseG = { id: string; nom: string; niveau: string | null; cycle: string; nbMatieres: number };
type Donnees = Omit<EntreeG, 'profs'> & {
  classes: ClasseG[];
  profs: (EntreeG['profs'][number] & { nom: string })[];
  existants: { classeId: string; profId: string | null; jour: string; debut: string; fin: string }[];
  avertissements: string[];
  matieresInconnues: string[];
};

export default function GenererPlanningPage() {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState('');
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [resultat, setResultat] = useState<{ sortie: SortieG; classeIds: string[] } | null>(null);
  const [classeVue, setClasseVue] = useState('');
  const [calcul, setCalcul] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const charger = async () => {
      try {
        const r = await fetch('/api/planning/generation', { cache: 'no-store' });
        const d = await r.json();
        if (!r.ok) {
          setErreur(d?.error || 'Chargement impossible.');
          return;
        }
        setDonnees(d);
        setChoisies(new Set((d.classes as ClasseG[]).map((c) => c.id)));
      } catch {
        setErreur('Erreur réseau. Réessayez.');
      }
    };
    charger();
  }, []);

  const nomClasse = useMemo(() => new Map((donnees?.classes ?? []).map((c) => [c.id, c.nom])), [donnees]);
  const nomProf = useMemo(() => new Map((donnees?.profs ?? []).map((p) => [p.id, p.nom])), [donnees]);

  const generer = () => {
    if (!donnees || choisies.size === 0) return;
    setCalcul(true);
    setMessage(null);
    // laisse l'écran afficher « Calcul en cours » avant le calcul
    setTimeout(() => {
      const ids = Array.from(choisies);
      const entree: EntreeG = {
        jours: donnees.jours,
        periodes: donnees.periodes,
        profs: donnees.profs,
        items: donnees.items.filter((i) => choisies.has(i.classeId)),
        occupes: donnees.existants
          .filter((e) => e.profId && !choisies.has(e.classeId))
          .map((e) => ({ profId: e.profId as string, jour: e.jour, debut: e.debut, fin: e.fin })),
      };
      const sortie = genererEmploiDuTemps(entree);
      setResultat({ sortie, classeIds: ids });
      setClasseVue(ids[0]);
      setCalcul(false);
    }, 50);
  };

  const enregistrer = async () => {
    if (!resultat) return;
    if (!window.confirm("Enregistrer ? L'emploi du temps actuel de ces classes sera remplacé.")) return;
    setSaving(true);
    try {
      const r = await fetch('/api/planning/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classeIds: resultat.classeIds, cours: resultat.sortie.placements }),
      });
      const d = await r.json();
      setMessage(
        r.ok
          ? { type: 'success', text: `${d.nbCreneaux} créneau(x) enregistré(s) pour ${d.nbClasses} classe(s).` }
          : { type: 'error', text: d?.error || 'Enregistrement impossible.' }
      );
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setSaving(false);
  };

  if (erreur) return <p className="p-4 text-red-600">{erreur}</p>;
  if (!donnees) return <p className="p-4 text-gray-500">Chargement...</p>;

  const classeVueDef = donnees.classes.find((c) => c.id === classeVue);
  const periodesVue = (classeVueDef ? donnees.periodes[classeVueDef.cycle] : []) || [];
  const periodesTriees = [...periodesVue].sort((a, b) => a.ordre - b.ordre);
  const lectureCase = (jour: string, periodeId: string) =>
    resultat?.sortie.placements.find((p) => p.classeId === classeVue && p.jour === jour && p.periodeId === periodeId);
  const nomMatiere = (matiereId: string) => donnees.items.find((i) => i.matiereId === matiereId)?.matiereNom ?? '';

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <Link href="/direction/planning" className="text-sm text-blue-600 underline">
          ← Planning
        </Link>
        <h1 className="text-2xl font-bold mt-1">Générer l'emploi du temps</h1>
        <p className="text-sm text-gray-500">
          Le logiciel place les cours selon les volumes horaires, les disponibilités des professeurs et vos jours de cours.
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {(donnees.avertissements.length > 0 || donnees.matieresInconnues.length > 0) && (
        <div className="p-3 rounded-lg text-xs bg-amber-50 text-amber-800 border border-amber-200 space-y-1">
          {donnees.avertissements.map((a) => (
            <p key={a}>{a}</p>
          ))}
          {donnees.matieresInconnues.length > 0 && (
            <p>Matières sans volume officiel (saisissez-les dans Volumes horaires) : {donnees.matieresInconnues.join(', ')}.</p>
          )}
        </div>
      )}

      <div className="border rounded-xl p-4 bg-white space-y-2">
        <div className="flex justify-between items-center">
          <p className="font-semibold text-sm">Classes à générer</p>
          <button
            className="text-xs text-blue-600 underline"
            onClick={() =>
              setChoisies(choisies.size === donnees.classes.length ? new Set() : new Set(donnees.classes.map((c) => c.id)))
            }
          >
            Tout cocher / décocher
          </button>
        </div>
        {donnees.classes.length === 0 && <p className="text-sm text-gray-500">Aucune classe prête (niveau reconnu et grille horaire remplie).</p>}
        <div className="grid grid-cols-2 gap-1">
          {donnees.classes.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={choisies.has(c.id)}
                onChange={() => {
                  const n = new Set(choisies);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  setChoisies(n);
                }}
              />
              {c.nom}
            </label>
          ))}
        </div>
        <button
          onClick={generer}
          disabled={calcul || choisies.size === 0}
          className="w-full bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {calcul ? 'Calcul en cours...' : "Générer l'emploi du temps"}
        </button>
      </div>

      {resultat && (
        <div className="space-y-3">
          <div className="border rounded-xl p-4 bg-white text-sm space-y-1">
            <p className="font-semibold">Résultat ({resultat.sortie.tentatives} essai(s))</p>
            <p>
              {formaterHeures(resultat.sortie.heuresPlacees)} placées sur {formaterHeures(resultat.sortie.heuresDemandees)} demandées.
            </p>
            <p className="text-xs text-gray-500">
              Un cours de 1 h 30 occupe 2 périodes si vos périodes durent 1 h : le total placé peut donc dépasser le total demandé.
            </p>
            {resultat.sortie.nonPlaces.length === 0 ? (
              <p className="text-green-700">Tous les cours ont été placés.</p>
            ) : (
              <div className="mt-2 space-y-1">
                <p className="text-red-700 font-medium">{resultat.sortie.nonPlaces.length} séance(s) non placée(s) :</p>
                {resultat.sortie.nonPlaces.slice(0, 30).map((n, i) => (
                  <p key={i} className="text-xs text-red-700">
                    {nomClasse.get(n.classeId)} · {n.matiereNom} ({formaterHeures(n.heures)}) : {n.raison}
                  </p>
                ))}
              </div>
            )}
          </div>

          <select
            value={classeVue}
            onChange={(e) => setClasseVue(e.target.value)}
            className="w-full border rounded-lg p-2 text-sm bg-white"
          >
            {resultat.classeIds.map((id) => (
              <option key={id} value={id}>
                {nomClasse.get(id)}
              </option>
            ))}
          </select>

          <div className="overflow-x-auto border rounded-xl bg-white">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border p-1 text-left">Heure</th>
                  {donnees.jours.map((j) => (
                    <th key={j.jour} className="border p-1">
                      {JOURS_LABEL[j.jour] ?? j.jour}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodesTriees.map((p) => (
                  <tr key={p.id} className={p.pause ? 'bg-gray-100 text-gray-400' : ''}>
                    <td className="border p-1 whitespace-nowrap">
                      {p.debut}-{p.fin}
                    </td>
                    {donnees.jours.map((j) => {
                      const c = p.pause ? null : lectureCase(j.jour, p.id);
                      return (
                        <td key={j.jour} className="border p-1 align-top">
                          {p.pause ? 'pause' : c ? (
                            <>
                              <div className="font-medium">{nomMatiere(c.matiereId)}</div>
                              <div className="text-gray-500">{c.profId ? nomProf.get(c.profId) : ''}</div>
                            </>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={enregistrer}
            disabled={saving}
            className="w-full bg-green-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer cet emploi du temps'}
          </button>
          <button onClick={generer} disabled={calcul} className="w-full border py-2.5 rounded-lg text-sm bg-white">
            Régénérer une autre version
          </button>
        </div>
      )}
    </div>
  );
        }
    
