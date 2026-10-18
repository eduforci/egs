'use client';

import { useEffect, useState } from 'react';
import { MODELE_PAR_DEFAUT, LONGUEUR_MAX_TEXTE, normaliserModele, type ModeleBulletin } from '@/lib/modele-bulletin';

type CleOuiNon = {
  [K in keyof ModeleBulletin]: ModeleBulletin[K] extends boolean ? K : never;
}[keyof ModeleBulletin];

const GROUPES: { titre: string; aide?: string; options: { cle: CleOuiNon; label: string }[] }[] = [
  {
    titre: 'En-tête',
    options: [
      { cle: 'logo', label: "Logo de l'établissement" },
      { cle: 'ministere', label: 'En-tête du ministère (et DRENAET)' },
      { cle: 'qr', label: 'QR code de vérification' },
      { cle: 'photo', label: "Photo de l'élève" },
    ],
  },
  {
    titre: 'Colonnes du tableau des matières',
    aide: 'Les colonnes Matière et Moyenne sont toujours affichées.',
    options: [
      { cle: 'col_coef', label: 'Coefficient' },
      { cle: 'col_total', label: 'Total (moyenne × coefficient)' },
      { cle: 'col_rang', label: 'Rang dans la matière' },
      { cle: 'col_appreciation', label: 'Appréciation de la matière' },
      { cle: 'col_professeur', label: 'Professeur' },
      { cle: 'col_signature', label: 'Signature du professeur' },
    ],
  },
  {
    titre: 'Blocs du bulletin',
    options: [
      { cle: 'bilans', label: 'Bilans Lettres / Sciences / Autres' },
      { cle: 'stats_classe', label: 'Résultats de la classe (moyenne, mini, maxi)' },
      { cle: 'resultats_annuels', label: 'Résultats annuels (dernière période)' },
      { cle: 'assiduite', label: 'Assiduité (absences)' },
      { cle: 'mentions_conseil', label: 'Mentions du conseil de classe' },
      { cle: 'appreciation_conseil', label: 'Appréciation du conseil de classe' },
      { cle: 'decision_fin_annee', label: "Décision de fin d'année (dernière période)" },
    ],
  },
];

export default function ModeleBulletinPage() {
  const [modele, setModele] = useState<ModeleBulletin | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/modele-bulletin', { cache: 'no-store' });
        const j = await r.json();
        setModele(normaliserModele(j?.modele));
      } catch {
        setModele(MODELE_PAR_DEFAUT);
      }
    })();
  }, []);

  const changer = <K extends keyof ModeleBulletin>(cle: K, valeur: ModeleBulletin[K]) =>
    setModele((m) => (m ? { ...m, [cle]: valeur } : m));

  const enregistrer = async () => {
    if (!modele) return;
    setOccupe(true);
    setMsg(null);
    try {
      const r = await fetch('/api/modele-bulletin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modele }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Échec.');
      setModele(normaliserModele(j.modele));
      setMsg({ ok: true, texte: 'Modèle enregistré. Il s\'applique à tous les bulletins de l\'école, côté direction et côté parents.' });
    } catch (e) {
      setMsg({ ok: false, texte: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setOccupe(false);
    }
  };

  if (!modele) return <main className="max-w-xl mx-auto p-4"><p className="text-sm text-gray-500">Chargement…</p></main>;

  const champ = 'w-full border rounded-md px-2 py-1.5 text-sm';

  return (
    <main className="max-w-xl mx-auto p-4 pb-16 space-y-4">
      <h1 className="text-xl font-bold">Modèle de bulletin</h1>
      <p className="text-sm text-gray-600">
        Choisissez ce que le bulletin de votre école affiche. Les notes, moyennes et rangs ne changent pas : seul l'affichage change.
        Tout est coché par défaut (bulletin officiel complet).
      </p>

      {GROUPES.map((g) => (
        <section key={g.titre} className="border rounded-lg p-3 space-y-2">
          <p className="font-medium text-sm">{g.titre}</p>
          {g.aide && <p className="text-xs text-gray-500">{g.aide}</p>}
          {g.options.map((o) => (
            <label key={o.cle} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={modele[o.cle]} onChange={(e) => changer(o.cle, e.target.checked)} />
              {o.label}
            </label>
          ))}
        </section>
      ))}

      <section className="border rounded-lg p-3 space-y-2">
        <p className="font-medium text-sm">Textes</p>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Titre du bulletin (laisser vide pour « BULLETIN TRIMESTRIEL DE NOTES » ou « SEMESTRIEL »)</label>
          <input value={modele.titre} maxLength={LONGUEUR_MAX_TEXTE} onChange={(e) => changer('titre', e.target.value)}
            placeholder="ex. BULLETIN DE NOTES" className={champ} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Titre du signataire (laisser vide pour « Chef d'établissement »)</label>
          <input value={modele.libelle_signataire} maxLength={LONGUEUR_MAX_TEXTE} onChange={(e) => changer('libelle_signataire', e.target.value)}
            placeholder="ex. Le Directeur, Le Proviseur, La Fondatrice" className={champ} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Ligne en bas du bulletin (facultatif)</label>
          <input value={modele.texte_pied} maxLength={LONGUEUR_MAX_TEXTE} onChange={(e) => changer('texte_pied', e.target.value)}
            placeholder="ex. Ce bulletin est à conserver soigneusement. Aucun duplicata ne sera délivré." className={champ} />
        </div>
      </section>

      <div className="flex gap-2">
        <button disabled={occupe} onClick={enregistrer}
          className="flex-1 rounded-md py-2.5 text-sm bg-blue-600 text-white disabled:opacity-50">Enregistrer</button>
        <button disabled={occupe} onClick={() => setModele(MODELE_PAR_DEFAUT)}
          className="border rounded-md px-3 py-2.5 text-sm bg-white disabled:opacity-50">Tout réafficher</button>
      </div>
      <p className="text-xs text-gray-500">« Tout réafficher » remet le modèle officiel complet ; pensez ensuite à enregistrer.</p>

      {msg && (
        <div className={`text-sm rounded-md p-3 border ${msg.ok ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-700'}`}>{msg.texte}</div>
      )}
    </main>
  );
}
