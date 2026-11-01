import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
const source = readFileSync(new URL('../../web/service-worker.js', import.meta.url), 'utf8').replace('__VERSION__', 'test').replace('__SHELL__', '["/index.html","/assets/app.js"]');
function worker(instant = '2026-11-02T20:00:00Z') {
  const handlers: Record<string, (event: any) => void> = {}, show = vi.fn().mockResolvedValue(undefined), open = vi.fn();
  const cached = { shell: true }, match = vi.fn().mockResolvedValue(cached), fetch = vi.fn().mockRejectedValue(new Error('Offline'));
  const self = { location: { origin: 'https://pathway.example' }, addEventListener: (name: string, fn: (event: any) => void) => { handlers[name] = fn; }, registration: { showNotification: show }, clients: { matchAll: async () => [], openWindow: open } };
  runInNewContext(`Date = class extends Date { constructor(...args) { super(...(args.length ? args : [${Date.parse(instant)}])); } };\n` + source, { self, URL, Intl, caches: { match }, fetch });
  return { handlers, show, open, match, fetch, cached };
}
async function push(w: ReturnType<typeof worker>, extra = {}) {
  let done: Promise<unknown> = Promise.resolve();
  w.handlers.push({ data: { json: () => ({ title: 'Pathway', body: 'Review a step', timezone: 'America/New_York', date: '2026-11-02', tab: 'grow', ...extra }) }, waitUntil: (p: Promise<unknown>) => { done = p; } });
  await done;
}
it('does not cache or provide offline fallbacks for API requests', () => {
  const w = worker(), respondWith = vi.fn();
  for (const pathname of ['/api', '/api/me', '/api/me/export']) w.handlers.fetch({ request: { method: 'GET', url: 'https://pathway.example' + pathname, mode: 'navigate' }, respondWith });
  expect(respondWith).not.toHaveBeenCalled(); expect(w.match).not.toHaveBeenCalled();
});
it('loads only the public shell when navigation is offline', async () => {
  const w = worker(); let response: Promise<unknown> | undefined;
  w.handlers.fetch({ request: { method: 'GET', url: 'https://pathway.example/', mode: 'navigate' }, respondWith: (p: Promise<unknown>) => { response = p; } });
  expect(await response).toEqual(w.cached); expect(w.match).toHaveBeenCalledWith('/index.html');
});
it('suppresses delayed push in quiet hours, class time and a stale day', async () => {
  const allowed = worker(); await push(allowed); expect(allowed.show).toHaveBeenCalledOnce();
  const quiet = worker('2026-11-03T02:00:00Z'); await push(quiet); expect(quiet.show).not.toHaveBeenCalled();
  const classes = worker(); await push(classes, { classes: [{ start: '2026-11-02T14:00', end: '2026-11-02T16:00' }] }); expect(classes.show).not.toHaveBeenCalled();
  const stale = worker('2026-11-03T20:00:00Z'); await push(stale); expect(stale.show).not.toHaveBeenCalled();
});
it('opens the relevant safe app screen when a notification is tapped', async () => {
  const w = worker(); let done: Promise<unknown> = Promise.resolve();
  w.handlers.notificationclick({ notification: { close: vi.fn(), data: { tab: 'explore' } }, waitUntil: (p: Promise<unknown>) => { done = p; } });
  await done; expect(w.open).toHaveBeenCalledWith('/?tab=explore');
});
