// ====== Service Worker — offline + actualizaciones al abrir ======
// Estrategia: red-primero para HTML/CSS/JS (así cada deploy llega al abrir la
// app), caché como respaldo offline. Cache-first solo para íconos y fuentes.
const CACHE = 'kbl-v46';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/tree.js',
  './js/config.js',
  './js/supabaseClient.js',
  './js/auth.js',
  './js/gastos.js',
  './js/notas.js',
  './js/cuotas.js',
  './js/panel.js',
  './js/import-resumen.js',
  './js/ahorro.js',
  './js/panel-plegable.js',
  './js/fincore.js',
  './js/catalogo.js',
  './js/detecciones.js',
  './js/avisos.js',
  './js/cotizacion.js',
  './js/viewer360.js',
  './js/bosque-vuelo.js',
  './js/dialog.js',
  './js/medios-credito.js',
  './js/ticket-parser.js',
  './js/ticket-ocr.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Nota: vendor/tesseract/* (motor OCR + datos de idioma, ~6MB) a propósito
  // NO se precachea acá — se descarga sólo cuando se usa "Cargar por foto",
  // para no pagar ese peso en cada instalación/actualización de la app.
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

// ---------- Notificaciones ----------
// `push` sólo se dispara si algún servidor manda el mensaje (VAPID + web-push).
// Todavía no existe ese emisor: por ahora las notificaciones las dispara la
// propia app al abrir (js/avisos.js). El handler queda listo para cuando esté.
self.addEventListener('push', (e) => {
  let datos = { titulo: 'KBL', cuerpo: '', vista: 'panel' };
  try { datos = { ...datos, ...(e.data ? e.data.json() : {}) }; }
  catch { datos.cuerpo = e.data ? e.data.text() : ''; }
  e.waitUntil(self.registration.showNotification(datos.titulo, {
    body: datos.cuerpo,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: datos.tag || 'kbl',
    data: { vista: datos.vista },
  }));
});

// Tocar la notificación: si la app ya está abierta la trae al frente en vez de
// abrir una pestaña nueva.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abiertas) {
      if (c.url.includes(self.registration.scope)) return c.focus();
    }
    return self.clients.openWindow('./');
  })());
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
