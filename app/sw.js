/**
 * Service Worker — PWA real con offline-first.
 *
 * Estrategias:
 *   - HTML / navegación: network-first (fallback a shell offline). Esto
 *     evita la "trampa de actualización" de una PWA instalada: un deploy
 *     nuevo SÍ llega aunque esté en la pantalla de inicio.
 *   - JS/CSS/SVG/JSON + CDN: stale-while-revalidate (rápido offline, se
 *     auto-actualiza en segundo plano tras un deploy).
 *   - El propio sw.js NUNCA se intercepta (el navegador necesita ver bytes
 *     nuevos para actualizar el Service Worker).
 *
 * Versión de cache (`CACHE_VERSION`): cambiar para forzar a los clientes a
 * descargar la nueva shell. Al activar, las caches antiguas se borran.
 */

const CACHE_VERSION = 'rutina-v30';

// Lista del shell (rutas relativas a la raíz del servidor que sirve la app).
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',

  './styles/tokens.css',
  './styles/base.css',
  './styles/layout.css',
  './styles/components.css',
  './styles/views.css',
  './styles/animations.css',
  './styles/active.css',

  './js/main.js',
  './js/app.js',
  './js/constants.js',

  './js/utils/dom.js',
  './js/utils/date.js',
  './js/utils/format.js',
  './js/utils/roman.js',

  './js/store/store.js',
  './js/store/seed.js',
  './js/store/exercise-catalog.js',
  './js/store/import-history.js',
  './js/store/migrations.js',
  './js/store/events.js',
  './js/store/db.js',

  './js/services/toast.js',
  './js/services/modal.js',
  './js/services/audio.js',
  './js/services/haptics.js',
  './js/services/rest-timer.js',
  './js/services/plate-calc.js',
  './js/services/backup.js',
  './js/services/pwa.js',
  './js/services/confetti.js',

  './js/analytics/one-rm.js',
  './js/analytics/progression.js',
  './js/analytics/stagnation.js',
  './js/analytics/volume.js',
  './js/analytics/prs.js',
  './js/analytics/muscles.js',
  './js/analytics/workout-summary.js',
  './js/analytics/streak.js',
  './js/analytics/muscle-load.js',
  './js/analytics/insights.js',

  './js/charts/theme.js',
  './js/charts/progress.js',
  './js/charts/volume.js',
  './js/charts/exercise-volume.js',

  './js/components/muscle-map.js',
  './js/components/HistoryChip.js',
  './js/components/StatsCard.js',
  './js/components/RoutineButton.js',
  './js/components/ReadinessSliders.js',
  './js/components/InsightCard.js',

  './js/views/home.js',
  './js/views/routine.js',
  './js/views/history.js',
  './js/views/progress.js',
  './js/views/analysis.js',
  './js/views/settings.js',
  './js/views/workout.js',
  './js/views/active-workout.js',
];

const CDN_HOSTS = ['cdn.jsdelivr.net'];

/* ---------------------------- INSTALL --------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL))
      .catch(err => console.warn('[sw] precache parcial:', err))
  );
  self.skipWaiting();
});

/* --------------------------- ACTIVATE --------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ----------------------------- FETCH ---------------------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // NUNCA interceptar el propio sw.js: el navegador debe poder ver bytes
  // nuevos para actualizar el Service Worker (si lo sirviéramos de caché,
  // el usuario quedaría congelado para siempre tras instalar en el móvil).
  if (url.pathname.endsWith('/sw.js')) return;

  // CDN libraries: stale-while-revalidate
  if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navegación / HTML → network-first: así un deploy nuevo SÍ llega aunque
  // la app esté instalada en pantalla de inicio. Offline → cae a la shell.
  const isNav = req.mode === 'navigate'
    || req.headers.get('accept')?.includes('text/html')
    || url.pathname === '/' || url.pathname.endsWith('/index.html');
  if (isNav) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Resto de estáticos (JS/CSS/SVG/JSON): stale-while-revalidate → rápido
  // offline y se auto-actualiza en segundo plano tras un deploy.
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    const shell = await caches.match('./index.html');
    if (shell) return shell;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const fetching = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetching;
}
