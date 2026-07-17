// ====== Service Worker — offline + actualizaciones al abrir ======
// Estrategia: red-primero para HTML/CSS/JS (así cada deploy llega al abrir la
// app), caché como respaldo offline. Cache-first solo para íconos y fuentes.
const CACHE = 'kbl-v13';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/tree.js',
  './js/config.js',
  './js/gastos.js',
  './js/notas.js',
  './js/viewer360.js',
  './js/dialog.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const isCode = e.request.mode === 'navigate' ||
    ['document', 'script', 'style'].includes(e.request.destination);

  const fromNet = () =>
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    });

  e.respondWith(
    isCode
      ? fromNet().catch(() => caches.match(e.request).then((h) => h || caches.match('./index.html')))
      : caches.match(e.request).then((hit) => hit || fromNet())
  );
});
