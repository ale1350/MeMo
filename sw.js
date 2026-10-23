/* MeMo — funziona anche offline. Cambia VERSION quando aggiorni i file su GitHub. */
const VERSION = 'memo-v2.8';
const SHELL = ['./', 'index.html', 'parser.js', 'notify.js', 'memo-fish.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'badge-96.png'];

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
    // se il sito risponde con un errore (es. 404 perché è momentaneamente spento) si usa la copia salvata, e l'errore non si salva mai
    const saved = () => caches.match(req).then(r => r || caches.match('index.html'));
    e.respondWith(fetch(req).then(res => {
      if (!res.ok) return saved().then(r => r || res);
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    }).catch(saved));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // il lettore dei documenti (solo il programma): scaricato una volta, poi resta sul telefono
    e.respondWith(caches.open('memo-cdn').then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
  }
});

// ---------- notifiche: arrivano dal server anche ad app chiusa ----------
// il testo dell'avviso è salvato sul telefono (il server ha solo un codice e l'ora): lo cerco qui
const note = k => new Promise(ok => {
  try {
    const r = indexedDB.open('memo-notes', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('n');
    r.onsuccess = () => { try { const g = r.result.transaction('n').objectStore('n').get(k); g.onsuccess = () => ok(g.result || null); g.onerror = () => ok(null); } catch (x) { ok(null); } };
    r.onerror = () => ok(null);
  } catch (x) { ok(null); }
});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    let k = null; try { k = new URL(d.url || './', self.registration.scope).searchParams.get('n'); } catch (x) {}
    const n = k ? await note(k) : null;
    const title = (n && n.title) || (d.title && d.title !== 'MeMo' ? d.title : '') || 'MeMo';
    const body = (n && n.body) || d.body || (k ? 'Hai un promemoria: aprimi per vederlo.' : '');
    return self.registration.showNotification(title, {
      body, icon: 'icon-192.png', badge: 'badge-96.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || './' }
    });
  })().then(async () => {
    // pallino rosso sull'icona = avvisi arrivati e non ancora visti (si azzera quando apri MeMo)
    if (!('setAppBadge' in self.navigator)) return;
    let n = 1; try { n = (await self.registration.getNotifications()).length || 1; } catch (x) {}
    try { await self.navigator.setAppBadge(n); } catch (x) {}
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ type: 'open', url }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
