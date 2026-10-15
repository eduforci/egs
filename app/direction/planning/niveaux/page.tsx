'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formaterHeures } from '@/lib/planning';

type NiveauInfo = { code: string; label: string; nbClasses: number; configure: boolean };
type Officielle = { cle: string; label: string; officiel: number | null; actif: boolean; volume: string };
type Perso = { matiereId: string; nom: string; actif: boolean; volume: string };

const nombre = (n: number) => String(n).replace('.', ',');
const lire = (s: string) => (s.trim() === '' ? null : parseFloat(s.replace(',', '.')));

export default function MatieresParNiveauPage() {
  const [niveaux, setNiveaux] = useState<NiveauInfo[]>([]);
  const [installe, setInstalle] = useState(true);
  const [code, setCode] = useState('');
  const [officielles, setOfficielles] = useState<Officielle[]>([]);
  const [perso, setPerso] = useState<Perso[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // formulaire « Ajouter une matière »
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouvellesHeures, setNouvellesHeures] = useState('1');
  const [nouveauCoef, setNouveauCoef] = useState('1');
  const [autresNiveaux, setAutresNiveaux] = useState<Set<string>>(new Set());

  const charger = useCallback(async (niveau: string) => {
    try {
      const r = await fetch('/api/planning/niveaux' + (niveau ? `?niveau=${niveau}` : ''), { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) {
        setMessage({ type: 'error', text: d?.error || 'Chargement impossible.' });
      } else {
        setNiveaux(d.niveaux ?? []);
        setInstalle(d.installe !== false);
        if (niveau) {
          setOfficielles(
            (d.officielles ?? []).map((o: any) => ({
              cle: o.cle,
              label: o.label,
              officiel: o.officiel,
              actif: o.actif === true,
              volume: o.volume !== null && o.volume !== undefined ? String(o.volume) : '',
            }))
          );
          setPerso(
            (d.perso ?? []).map((p: any) => ({
              matiereId: p.matiereId,
              nom: p.nom,
              actif: p.actif === true,
              volume: p.volume !== null && p.volume !== undefined ? String(p.volume) : '',
            }))
          );
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    charger('');
  }, [charger]);

  useEffect(() => {
    setOfficielles([]);
    setPerso([]);
    setAutresNiveaux(new Set());
    if (code) charger(code);
  }, [code, charger]);

  const total =
    officielles.filter((o) => o.actif).reduce((s, o) => s + (lire(o.volume) ?? 0), 0) +
    perso.filter((p) => p.actif).reduce((s, p) => s + (lire(p.volume) ?? 0), 0);

  const enregistrer = async () => {
    for (const o of officielles) {
      if (o.actif && o.officiel === null && !(lire(o.volume) && (lire(o.volume) as number) > 0)) {
        setMessage({ type: 'error', text: `Indiquez les heures de « ${o.label} » (elle n'est pas dans le tableau officiel de ce niveau).` });
        return;
      }
    }
    for (const p of perso) {
      if (p.actif && !(lire(p.volume) && (lire(p.volume) as number) > 0)) {
        setMessage({ type: 'error', text: `Indiquez les heures de « ${p.nom} ».` });
        return;
      }
    }
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch('/api/planning/niveaux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'niveau',
          niveau: code,
          officielles: officielles.map((o) => ({ cle: o.cle, actif: o.actif, volume: o.actif ? lire(o.volume) : null })),
          perso: perso.map((p) => ({ matiereId: p.matiereId, actif: p.actif, volume: lire(p.volume) })),
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setMessage({ type: 'success', text: 'Matières de ce niveau enregistrées.' });
        charger(code);
      } else setMessage({ type: 'error', text: d?.error || 'Enregistrement impossible.' });
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setSaving(false);
  };

  const retirer = async (p: Perso) => {
    if (!window.confirm(`Retirer « ${p.nom} » de ce niveau dans l'emploi du temps ? (La matière reste dans l'école.)`)) return;
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch('/api/planning/niveaux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'retirer', niveau: code, matiereId: p.matiereId }),
      });
      const d = await r.json();
      if (r.ok) {
        setMessage({ type: 'success', text: `« ${p.nom} » retirée de ce niveau.` });
        charger(code);
      } else setMessage({ type: 'error', text: d?.error || 'Impossible.' });
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setSaving(false);
  };

  const ajouter = async () => {
    const heures = lire(nouvellesHeures);
    if (!nouveauNom.trim()) {
      setMessage({ type: 'error', text: 'Écrivez le nom de la matière.' });
      return;
    }
    if (!heures || heures <= 0) {
      setMessage({ type: 'error', text: 'Indiquez les heures par semaine.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch('/api/planning/niveaux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'ajouter',
          nom: nouveauNom,
          volume: heures,
          coefficient: lire(nouveauCoef) ?? 1,
          niveaux: [code, ...Array.from(autresNiveaux)],
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setMessage({
          type: 'success',
          text: `« ${nouveauNom.trim()} » ajoutée à ${d.niveaux} niveau(x) (${d.classesRattachees} classe(s) rattachée(s)).${
            d.classesRattachees > 0 ? " Pensez à affecter un professeur dans la page « Enseignants » de chaque classe." : ''
          }`,
        });
        setNouveauNom('');
        setNouvellesHeures('1');
        setNouveauCoef('1');
        setAutresNiveaux(new Set());
        charger(code);
      } else setMessage({ type: 'error', text: d?.error || 'Ajout impossible.' });
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau. Réessayez.' });
    }
    setSaving(false);
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  const nonConfigures = niveaux.filter((n) => n.nbClasses > 0 && !n.configure);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <Link href="/direction/planning" className="text-sm text-blue-600 underline">
          ← Planning
        </Link>
        <h1 className="text-2xl font-bold mt-1">Matières par niveau</h1>
        <p className="text-sm text-gray-500">
          Choisissez les matières enseignées dans chaque niveau et leurs heures par semaine. Vous pouvez aussi ajouter une matière
          qui n'est pas dans le tableau officiel (TIC, arabe...).
        </p>
      </div>

      {!installe && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          Exécutez d'abord le script SQL « planning_v5 » dans Supabase.
        </div>
      )}

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

      {nonConfigures.length > 0 && (
        <div className="p-3 rounded-lg text-xs bg-amber-50 text-amber-800 border border-amber-200">
          Pas encore vérifiés : {nonConfigures.map((n) => n.label).join(', ')}. Tant qu'un niveau n'est pas enregistré ici, toutes
          les matières du tableau officiel sont placées pour ses classes.
        </div>
      )}

      <select value={code} onChange={(e) => setCode(e.target.value)} className="w-full border rounded-lg p-2 text-sm bg-white">
        <option value="">Choisir un niveau...</option>
        {niveaux.map((n) => (
          <option key={n.code} value={n.code}>
            {n.label}
            {n.nbClasses === 0 ? ' (aucune classe)' : ` · ${n.nbClasses} classe(s)`}
            {n.configure ? ' ✓' : ''}
          </option>
        ))}
      </select>

      {code && officielles.length > 0 && (
        <>
          <div className="border rounded-xl bg-white divide-y">
            <p className="p-3 text-sm font-semibold">Matières du tableau officiel</p>
            {officielles.map((o) => (
              <div key={o.cle} className="flex items-center justify-between gap-3 p-3">
                <label className="flex items-start gap-2 text-sm flex-1">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={o.actif}
                    onChange={() =>
                      setOfficielles((prev) =>
                        prev.map((x) =>
                          x.cle === o.cle
                            ? { ...x, actif: !x.actif, volume: !x.actif && x.volume === '' && x.officiel !== null ? String(x.officiel) : x.volume }
                            : x
                        )
                      )
                    }
                  />
                  <span>
                    {o.label}
                    {o.officiel === null && <span className="block text-[11px] text-gray-400">Pas dans le tableau officiel de ce niveau</span>}
                    {o.officiel !== null && o.actif && lire(o.volume) !== o.officiel && (
                      <span className="block text-[11px] text-gray-400">Officiel : {nombre(o.officiel)} h</span>
                    )}
                  </span>
                </label>
                {o.actif && (
                  <div className="flex items-center gap-1">
                    <input
                      value={o.volume}
                      onChange={(e) =>
                        setOfficielles((prev) => prev.map((x) => (x.cle === o.cle ? { ...x, volume: e.target.value.replace(',', '.') } : x)))
                      }
                      inputMode="decimal"
                      placeholder="0"
                      className="w-16 border rounded-lg p-1.5 text-sm text-right"
                    />
                    <span className="text-xs text-gray-500">h</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {perso.length > 0 && (
            <div className="border rounded-xl bg-white divide-y">
              <p className="p-3 text-sm font-semibold">Matières ajoutées par l'école</p>
              {perso.map((p) => (
                <div key={p.matiereId} className="flex items-center justify-between gap-3 p-3">
                  <label className="flex items-center gap-2 text-sm flex-1">
                    <input
                      type="checkbox"
                      checked={p.actif}
                      onChange={() => setPerso((prev) => prev.map((x) => (x.matiereId === p.matiereId ? { ...x, actif: !x.actif } : x)))}
                    />
                    {p.nom}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      value={p.volume}
                      onChange={(e) =>
                        setPerso((prev) => prev.map((x) => (x.matiereId === p.matiereId ? { ...x, volume: e.target.value.replace(',', '.') } : x)))
                      }
                      inputMode="decimal"
                      placeholder="0"
                      className="w-16 border rounded-lg p-1.5 text-sm text-right"
                    />
                    <span className="text-xs text-gray-500">h</span>
                    <button onClick={() => retirer(p)} disabled={saving} className="ml-1 text-xs text-red-600 underline">
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between p-3 text-sm font-semibold bg-gray-50 border rounded-xl">
            <span>Total par semaine</span>
            <span>{formaterHeures(total)}</span>
          </div>

          <button
            onClick={enregistrer}
            disabled={saving || !installe}
            className="w-full bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer ce niveau'}
          </button>
          <p className="text-[11px] text-gray-400">
            Une matière décochée n'est plus placée dans l'emploi du temps de ce niveau. Si vous changez les heures d'une matière
            ici, elles s'appliquent à toutes les classes du niveau et remplacent celles de la page « Volumes horaires ».
          </p>

          <div className="border rounded-xl p-4 bg-white space-y-3">
            <p className="text-sm font-semibold">Ajouter une matière à ce niveau</p>
            <p className="text-[11px] text-gray-500">
              Pour une matière absente de la liste (TIC, arabe...). Elle est aussi rattachée aux classes du niveau, pour les notes et
              les bulletins.
            </p>
            <input
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              placeholder="Nom de la matière (ex. TIC)"
              className="w-full border rounded-lg p-2 text-sm"
            />
            <div className="flex gap-3">
              <label className="flex-1 text-xs text-gray-600">
                Heures par semaine
                <input
                  value={nouvellesHeures}
                  onChange={(e) => setNouvellesHeures(e.target.value.replace(',', '.'))}
                  inputMode="decimal"
                  className="mt-1 w-full border rounded-lg p-2 text-sm"
                />
              </label>
              <label className="flex-1 text-xs text-gray-600">
                Coefficient
                <input
                  value={nouveauCoef}
                  onChange={(e) => setNouveauCoef(e.target.value.replace(',', '.'))}
                  inputMode="decimal"
                  className="mt-1 w-full border rounded-lg p-2 text-sm"
                />
              </label>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Ajouter aussi pour :</p>
              <div className="grid grid-cols-2 gap-1">
                {niveaux
                  .filter((n) => n.code !== code)
                  .map((n) => (
                    <label key={n.code} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={autresNiveaux.has(n.code)}
                        onChange={() => {
                          const s = new Set(autresNiveaux);
                          if (s.has(n.code)) s.delete(n.code);
                          else s.add(n.code);
                          setAutresNiveaux(s);
                        }}
                      />
                      {n.label}
                    </label>
                  ))}
              </div>
            </div>
            <button
              onClick={ajouter}
              disabled={saving || !installe}
              className="w-full border py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 bg-white"
            >
              {saving ? 'Ajout...' : 'Ajouter la matière'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
