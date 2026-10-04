'use client';

import { useEffect, useState } from 'react';

type Cible = { classeId: string; matiereId: string; nom: string };
type Page = { url: string; nom: string };

const CLE_PREPARATION = 'egs-derniere-preparation';
// Connexion lente : on laisse jusqu'à 90 secondes à chaque page
const DELAI_PAGE = 90000;

// Charge une page dans un cadre invisible : le service worker en garde alors une copie
// complète (page et scripts) sur le téléphone, comme si l'enseignant l'avait ouverte.
// Les scripts déjà reçus restent gardés, même si la page n'a pas fini de charger :
// un nouvel essai est donc plus rapide.
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

    const limite = setTimeout(() => terminer(false, 0), DELAI_PAGE);
    cadre.onload = () => terminer(true, 4000);
    cadre.onerror = () => terminer(false, 0);
    cadre.src = url;
    document.body.appendChild(cadre);
  });
}

// Vérifie que la page est vraiment gardée sur le téléphone (et pas seulement chargée)
async function estEnCache(url: string): Promise<boolean> {
  try {
    if (!('caches' in window)) return false;
    const cles = (await caches.keys()).filter((k) => k.startsWith('egs-pages-'));
    for (const k of cles) {
      const cache = await caches.open(k);
      const trouve = await cache.match(url, { ignoreSearch: true });
      if (trouve) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export default function PreparerHorsLigne({ cibles }: { cibles: Cible[] }) {
  const [trimestre, setTrimestre] = useState('1');
  const [etatSw, setEtatSw] = useState('Vérification...');
  const [derniere, setDerniere] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(0);
  const [total, setTotal] = useState(0);
  const [resultat, setResultat] = useState<string | null>(null);
  const [manquantes, setManquantes] = useState<Page[]>([]);
  const [pretes, setPretes] = useState('...');

  // État réel du mode hors ligne sur ce téléphone
  useEffect(() => {
    try {
      const brut = localStorage.getItem(CLE_PREPARATION);
      if (brut) setDerniere(brut);
    } catch {
      // rien à faire
    }

    if (!('serviceWorker' in navigator)) {
      setEtatSw('non disponible sur ce navigateur');
      return;
    }

    const ecouter = (e: MessageEvent) => {
      if (e.data && e.data.version) setEtatSw('actif (' + e.data.version + ')');
    };
    const demander = () => navigator.serviceWorker.controller?.postMessage('version');

    navigator.serviceWorker.addEventListener('message', ecouter);
    navigator.serviceWorker.addEventListener('controllerchange', demander);

    if (navigator.serviceWorker.controller) {
      demander();
    } else {
      setEtatSw('pas encore actif : rechargez cette page, avec Internet');
    }

    // Une ancienne version ne répond pas à la question
    const attente = setTimeout(() => {
      setEtatSw((courant) =>
        courant === 'Vérification...'
          ? 'ancienne version : fermez Chrome, rouvrez cette page avec Internet'
          : courant
      );
    }, 3000);

    return () => {
      clearTimeout(attente);
      navigator.serviceWorker.removeEventListener('message', ecouter);
      navigator.serviceWorker.removeEventListener('controllerchange', demander);
    };
  }, []);

  // Combien de pages sont réellement gardées sur ce téléphone (pour le trimestre choisi)
  async function compterPretes() {
    const liste = listeDesPages();
    let n = 0;
    for (const p of liste) {
      if (await estEnCache(p.url)) n++;
    }
    setPretes(`${n} sur ${liste.length}`);
  }

  useEffect(() => {
    compterPretes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimestre]);

  function listeDesPages(): Page[] {
    const pages: Page[] = [
      { url: '/prof/dashboard', nom: 'Tableau de bord' },
      { url: '/enseignant/appel', nom: 'Appel' },
      { url: '/enseignant/cahier-texte', nom: 'Cahier de texte' },
    ];
    cibles.forEach((c) => {
      pages.push({
        url: `/prof/classe/${c.classeId}/matiere/${c.matiereId}`,
        nom: `${c.nom} (choix du trimestre)`,
      });
      pages.push({
        url: `/prof/classe/${c.classeId}/matiere/${c.matiereId}/trimestre/${trimestre}`,
        nom: `${c.nom} (notes, ${trimestre === '1' ? '1er' : trimestre + 'e'} trimestre)`,
      });
    });
    return pages;
  }

  async function lancer(pages: Page[]) {
    if (!navigator.onLine) {
      setResultat('Pas de connexion Internet : cette préparation demande Internet.');
      return;
    }

    // Sans service worker qui contrôle cette page, rien ne peut être gardé :
    // on le dit au lieu d'annoncer un faux succès.
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      setResultat(
        "Le mode hors ligne n'est pas actif sur ce téléphone, donc rien ne peut être gardé. Fermez complètement Chrome, rouvrez cette page avec Internet, puis vérifiez que la ligne « Mode hors ligne » affiche « actif (v4) » avant de réessayer."
      );
      return;
    }

    setEnCours(true);
    setResultat(null);
    setFait(0);
    setTotal(pages.length);

    const rates: Page[] = [];
    for (let i = 0; i < pages.length; i++) {
      const charge = await chargerPage(pages[i].url);
      // Vraie vérification : la page est-elle bien enregistrée sur le téléphone ?
      const ok = charge && (await estEnCache(pages[i].url));
      if (!ok) rates.push(pages[i]);
      setFait(i + 1);
    }

    setManquantes(rates);
    setEnCours(false);
    compterPretes();

    if (rates.length === 0) {
      const trace =
        new Date().toLocaleString('fr-FR') +
        ' · ' +
        (trimestre === '1' ? '1er' : trimestre + 'e') +
        ' trimestre';
      try {
        localStorage.setItem(CLE_PREPARATION, trace);
      } catch {
        // rien à faire
      }
      setDerniere(trace);
      setResultat(
        `Terminé : ce téléphone est prêt pour le ${trimestre === '1' ? '1er' : trimestre + 'e'} trimestre sans Internet.`
      );
    } else {
      setResultat(
        `${rates.length} page(s) pas encore prêtes (connexion trop lente). Touchez « Réessayer les pages manquantes » : ce qui a déjà été reçu est conservé, donc ce sera plus rapide.`
      );
    }
  }

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">Travailler sans Internet</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Avec Internet, préparez ce téléphone une fois. Ensuite vous pouvez faire l'appel, remplir
          le cahier de texte et saisir les notes sans connexion : tout sera envoyé automatiquement
          au retour d'Internet. Si votre connexion est lente, faites-le une fois avec une bonne
          connexion (Wi-Fi de l'école, par exemple).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={trimestre}
          onChange={(e) => {
            setTrimestre(e.target.value);
            setManquantes([]);
          }}
          disabled={enCours}
          className="border rounded-lg p-2 text-sm"
        >
          <option value="1">1er trimestre</option>
          <option value="2">2e trimestre</option>
          <option value="3">3e trimestre</option>
        </select>
        <button
          type="button"
          onClick={() => lancer(listeDesPages())}
          disabled={enCours}
          className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium disabled:opacity-50"
        >
          {enCours ? 'Préparation...' : 'Préparer ce téléphone'}
        </button>
      </div>

      <div className="text-xs text-neutral-500 space-y-0.5">
        <div>Mode hors ligne : {etatSw}</div>
        <div>Pages réellement gardées sur ce téléphone : {pretes}</div>
        <div>Dernière préparation : {derniere ?? 'jamais sur ce téléphone'}</div>
      </div>

      {enCours && (
        <div className="text-xs text-neutral-600">
          Page {fait} sur {total}. Restez sur cet écran et gardez-le allumé. Sur une connexion
          lente, chaque page peut prendre jusqu'à 1 minute 30.
        </div>
      )}

      {resultat && <div className="text-xs text-neutral-700">{resultat}</div>}

      {!enCours && manquantes.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => lancer(manquantes)}
            className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium"
          >
            Réessayer les pages manquantes ({manquantes.length})
          </button>
          <ul className="text-xs text-neutral-500 list-disc pl-4 space-y-0.5">
            {manquantes.map((p) => (
              <li key={p.url}>{p.nom}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
