/* Public shell only. Never cache API responses, private URLs or student data. */
const CACHE = 'pathway-shell-__VERSION__';
const SHELL = __SHELL__;
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith('pathway-shell-') && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/api') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(async response => { if (response.ok && response.headers.get('content-type')?.includes('text/html')) (await caches.open(CACHE)).put('/index.html', response.clone()); return response; }).catch(() => caches.match('/index.html'))); return;
  }
  if (SHELL.includes(url.pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
self.addEventListener('push', event => event.waitUntil((async () => {
  let data; try { data = event.data.json(); } catch { return; }
  if (!data.timezone || !data.date) return;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: data.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = k => p.find(x => x.type === k)?.value;
  const local = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  if (local.slice(0, 10) !== data.date || Number(get('hour')) < 7 || Number(get('hour')) >= 21 || (data.classes || []).some(c => c.start <= local && c.end > local)) return;
  await self.registration.showNotification(data.title, { body: data.body, icon: '/icons/orb-192.png', badge: '/icons/orb-192.png', tag: data.tag, data: { tab: data.tab } });
})()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const tab = ['today', 'explore', 'grow'].includes(event.notification.data?.tab) ? event.notification.data.tab : 'today';
  const url = '/?tab=' + tab;
  event.waitUntil((async () => { const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); if (clients[0]) { await clients[0].navigate(url); await clients[0].focus(); } else await self.clients.openWindow(url); })());
});
