/* Service worker de Sismo CO.
 *
 * Regla dura: se cachea el armazón de la app, nunca los datos sísmicos.
 * Mostrar un sismo viejo durante una emergencia es peor que mostrar un error,
 * así que las peticiones al USGS y al EMSC van siempre a la red.
 */
'use strict';

const CACHE = 'sismo-co-v1';

const SHELL = [
  './',
  './index.html',
  './src/app.js',
  './src/styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cualquier cosa de otro origen (USGS, EMSC) pasa directo a la red, sin caché.
  if (url.origin !== self.location.origin) return;

  // Armazón propio: caché primero, con refresco en segundo plano.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit); // sin red: se sirve lo cacheado si existe
      return hit || net;
    })
  );
});
