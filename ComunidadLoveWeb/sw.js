/* ==========================================================================
   SERVICE WORKER: MODO OFFLINE & PWA (COMUNIDAD LOVE / CLGESTIÓN)
   --------------------------------------------------------------------------
   Estrategia Network-First con fallback a Cache para assets estáticos.
   Permite operar sin conexión a internet y sincronizar al reanudar red.
   ========================================================================== */

const CACHE_NAME = 'clgestion-cache-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './admin/index.html',
  './style.css',
  './app.js',
  './favicon.png',
  './manifest.json',
  './Assets/logo-color.png',
  './Assets/logo-blanco.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] No se pudieron pre-cachear todos los assets:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Omitir peticiones de Firestore, Auth, Analytics o APIs externas (gestionadas por su propio SDK offline)
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.protocol === 'chrome-extension:' ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network-First con fallback en Cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si solicita navegación HTML y no hay red, servir index
          if (event.request.headers.get('accept')?.includes('text/html')) {
            if (url.pathname.includes('/admin/')) {
              return caches.match('./admin/index.html');
            }
            return caches.match('./index.html');
          }
        });
      })
  );
});
