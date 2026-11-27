// Offline support. Everything the game needs is precached at install time;
// requests are then served cache-first and refreshed in the background, so the
// app works with no network and still picks up new versions on the next visit.
// tests/pwa.test.js fails if a shipped file is missing from this list.
const CACHE = 'runekeep-v1';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'src/main.js',
  'src/sim.js',
  'src/levels.js',
  'src/solutions.js',
  'src/solver.js',
  'src/solver-worker.js',
  'src/sprites.js',
  'src/render.js',
  'src/input.js',
  'src/audio.js',
  'src/store.js',
  'src/editor.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (cached) { e.waitUntil(fresh); return cached; }
    return (await fresh) || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
