// Service worker EGS : permet d'ouvrir la page d'appel sans connexion.
// Pour forcer une mise à jour chez tous les utilisateurs, changer VERSION.
const VERSION = 'v2';
const CACHE_PAGES = 'egs-pages-' + VERSION;
const CACHE_STATIC = 'egs-static-' + VERSION;

// Seules ces pages sont gardées en cache (pas les pages des autres rôles)
const PAGES_HORS_LIGNE = ['/enseignant/appel', '/enseignant/cahier-texte'];

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

async function reseauPuisCache(req) {
  const cache = await caches.open(CACHE_PAGES);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('lent')), 4000)),
    ]);
    // On ne garde que les vraies pages (pas les redirections vers la connexion)
    if (res.ok && !res.redirected) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    const enCache = await cache.match(req, { ignoreSearch: true });
    if (enCache) return enCache;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<body style="font-family:sans-serif;padding:24px"><h2>Hors ligne</h2>' +
        "<p>Cette page n'a pas encore été enregistrée sur ce téléphone. Ouvrez-la une fois avec Internet.</p></body>",
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
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

  if (req.mode === 'navigate' && PAGES_HORS_LIGNE.includes(url.pathname)) {
    event.respondWith(reseauPuisCache(req));
  }
});
