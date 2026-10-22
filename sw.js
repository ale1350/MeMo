/* MeMo — funziona anche offline. Cambia VERSION quando aggiorni i file su GitHub. */
const VERSION = 'memo-v1.9';
const SHELL = ['./', 'index.html', 'parser.js', 'notify.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'memo-cdn').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // prima la rete (così vedi subito gli aggiornamenti), poi la copia salvata se sei offline
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // il lettore di foto: scaricato una volta, poi resta sul telefono
    e.respondWith(caches.open('memo-cdn').then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
  }
});
