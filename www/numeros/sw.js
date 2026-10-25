// Guarda la página de los números en el teléfono para que funcione sin internet.
var CACHE = 'numeros-v1';
var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/numbers.js', 'js/voice-clips.js', 'js/tracer.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

// Sólo borra sus propias versiones viejas: el sitio también guarda ¡Que no se caiga!.
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return /^numeros-/.test(k) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(function (hit) { return hit || fetch(e.request); }));
});
