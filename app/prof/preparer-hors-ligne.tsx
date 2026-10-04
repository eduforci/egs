'use client';

import { useState } from 'react';

type Cible = { classeId: string; matiereId: string; nom: string };

// Charge une page dans un cadre invisible : le service worker en garde alors une copie
// complète (page et scripts) sur le téléphone, comme si l'enseignant l'avait ouverte.
function chargerPage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cadre = document.createElement('iframe');
    cadre.name = 'egs-prep';
    cadre.setAttribute('aria-hidden', 'true');
    cadre.tabIndex = -1;
    cadre.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;border:0;opacity:0.01;pointer-events:none;';

    let fini = false;
    const terminer = (ok: boolean, attente: number) => {
      if (fini) return;
      fini = true;
      clearTimeout(limite);
      // Petite pause pour laisser les derniers scripts de la page se charger
      setTimeout(() => {
        cadre.remove();
        resolve(ok);
      }, attente);
    };

    const limite = setTimeout(() => terminer(false, 0), 30000);
    cadre.onload = () => terminer(true, 2500);
    cadre.onerror = () => terminer(false, 0);
    cadre.src = url;
    document.body.appendChild(cadre);
  });
}

export default function PreparerHorsLigne({ cibles }: { cibles: Cible[] }) {
  const [trimestre, setTrimestre] = useState('1');
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(0);
  const [total, setTotal] = useState(0);
  const [resultat, setResultat] = useState<string | null>(null);

  async function preparer() {
    if (!navigator.onLine) {
      setResultat('Pas de connexion Internet : cette préparation demande Internet.');
      return;
    }

    const urls: string[] = [
      '/prof/dashboard',
      '/enseignant/appel',
      '/enseignant/cahier-texte',
    ];
    cibles.forEach((c) => {
      urls.push(`/prof/classe/${c.classeId}/matiere/${c.matiereId}`);
      urls.push(`/prof/classe/${c.classeId}/matiere/${c.matiereId}/trimestre/${trimestre}`);
    });

    setEnCours(true);
    setResultat(null);
    setFait(0);
    setTotal(urls.length);

    let echecs = 0;
    for (let i = 0; i < urls.length; i++) {
      const ok = await chargerPage(urls[i]);
      if (!ok) echecs++;
      setFait(i + 1);
    }

    setEnCours(false);
    setResultat(
      echecs === 0
        ? `Terminé : ce téléphone est prêt pour le ${trimestre === '1' ? '1er' : trimestre + 'e'} trimestre sans Internet.`
        : `${echecs} page(s) n'ont pas pu être préparées (connexion trop lente ?). Réessayez avec une meilleure connexion.`
    );
  }

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">Travailler sans Internet</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Avec Internet, préparez ce téléphone une fois. Ensuite vous pouvez faire l'appel, remplir
          le cahier de texte et saisir les notes sans connexion : tout sera envoyé automatiquement
          au retour d'Internet.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={trimestre}
          onChange={(e) => setTrimestre(e.target.value)}
          disabled={enCours}
          className="border rounded-lg p-2 text-sm"
        >
          <option value="1">1er trimestre</option>
          <option value="2">2e trimestre</option>
          <option value="3">3e trimestre</option>
        </select>
        <button
          type="button"
          onClick={preparer}
          disabled={enCours}
          className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium disabled:opacity-50"
        >
          {enCours ? 'Préparation...' : 'Préparer ce téléphone'}
        </button>
      </div>

      {enCours && (
        <div className="text-xs text-neutral-600">
          Page {fait} sur {total}. Restez sur cet écran et gardez-le allumé.
        </div>
      )}
      {resultat && <div className="text-xs text-neutral-700">{resultat}</div>}
    </div>
  );
}
