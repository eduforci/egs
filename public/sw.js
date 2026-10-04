// Service worker EGS : permet d'ouvrir l'appel, le cahier de texte et la saisie
// des notes sans connexion.
// Pour forcer une mise à jour chez tous les utilisateurs, changer VERSION.
const VERSION = 'v4';
const CACHE_PAGES = 'egs-pages-' + VERSION;
const CACHE_STATIC = 'egs-static-' + VERSION;

// Seules ces pages sont gardées en cache (pas les pages des autres rôles)
const PAGES_EXACTES = ['/enseignant/appel', '/enseignant/cahier-texte', '/prof/dashboard'];
const ID = '[0-9a-fA-F-]+';
const PAGES_NOTES = [
  new RegExp('^/prof/classe/' + ID + '/matiere/' + ID + '/?$'),
  new RegExp('^/prof/classe/' + ID + '/matiere/' + ID + '/trimestre/[1-3]/?$'),
];

function pageNotes(chemin) {
  return PAGES_NOTES.some((r) => r.test(chemin));
}

function pageHorsLigne(chemin) {
  return PAGES_EXACTES.includes(chemin) || pageNotes(chemin);
}

// Permet à l'application d'afficher quelle version du mode hors ligne est active
self.addEventListener('message', (event) => {
  if (event.data === 'version' && event.source) {
    event.source.postMessage({ version: VERSION });
  }
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cles = await caches.keys();
      await Promise.all(
        cles
          .filter((k) => k.startsWith('egs-') && !k.endsWith(VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

async function cacheDabord(req) {
  const cache = await caches.open(CACHE_STATIC);
  const trouve = await cache.match(req);
  if (trouve) return trouve;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

function pageHorsLigne503() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font-family:sans-serif;padding:24px"><h2>Hors ligne</h2>' +
      "<p>Cette page n'a pas encore été enregistrée sur ce téléphone. Ouvrez-la une fois avec Internet, " +
      'ou utilisez « Préparer ce téléphone » sur le tableau de bord.</p></body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// Réseau d'abord, copie du téléphone en secours.
// - S'il existe une copie : on attend le réseau au plus `delai`, puis on sert la copie
//   (connexion lente ou absente). Le réseau continue en arrière-plan et met la copie à jour.
// - S'il n'existe PAS de copie : on attend le réseau aussi longtemps qu'il faut,
//   sans jamais afficher la page « Hors ligne » à cause d'une simple lenteur.
async function reseauPuisCache(req, delai) {
  const cache = await caches.open(CACHE_PAGES);
  const enCache = await cache.match(req, { ignoreSearch: true });

  const reseau = fetch(req).then((res) => {
    // On ne garde que les vraies pages (pas les redirections vers la connexion)
    if (res.ok && !res.redirected) {
      cache.put(req, res.clone());
    }
    return res;
  });

  if (!enCache) {
    try {
      return await reseau;
    } catch (e) {
      return pageHorsLigne503();
    }
  }

  try {
    return await Promise.race([
      reseau,
      new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('lent')), delai)),
    ]);
  } catch (e) {
    reseau.catch(() => {});
    return enCache;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Supabase et tout ce qui vient d'un autre site : on ne touche à rien
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheDabord(req));
    return;
  }

  if (req.mode === 'navigate' && pageHorsLigne(url.pathname)) {
    event.respondWith(reseauPuisCache(req, pageNotes(url.pathname) ? 10000 : 6000));
  }
});
