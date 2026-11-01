import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast, useLoad } from './ui';
type Settings = { enabled: boolean; time: string; pausedUntil: string | null; timezone: string; configured: boolean; publicKey: string | null; subscriptions: number };
const statuses: Record<string, string> = { accepted: 'Accepted by the notification service. Device delivery depends on your browser.', 'already-sent-today': 'You already had a nudge today. Another can wait until tomorrow.', 'paused-or-quiet': 'Nudges are off, paused, or this is quiet/class time. Try during free time between 7am and 9pm.', 'no-subscription': 'Enable notifications on this device first.', 'not-configured': 'The app owner has not configured notifications yet.', 'not-delivered': 'The notification service could not accept this nudge. Everything else is available.' };
export default function Notifications() {
  const { data, error, reload } = useLoad(() => api<Settings>('/api/notifications'), []);
  const [busy, setBusy] = useState(false), [device, setDevice] = useState(false);
  const supported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  useEffect(() => { if (supported) navigator.serviceWorker.getRegistration().then(r => r?.pushManager.getSubscription()).then(s => setDevice(!!s)).catch(() => {}); }, [supported]);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); reload(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); } };
  const patch = (body: unknown) => api('/api/notifications', { method: 'PATCH', body });
  const enable = async () => {
    if (!data?.publicKey) return;
    const registered = await navigator.serviceWorker.getRegistration();
    if (!registered) throw new Error('Open the published Pathway app to enable notifications. The development preview does not install a service worker.');
    const permission = await Notification.requestPermission(); if (permission !== 'granted') { toast('Notifications stay off. You can change browser permissions whenever you want.'); return; }
    const registration = await navigator.serviceWorker.ready;
    const normalized = data.publicKey.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    await api('/api/push/subscribe', { body: subscription.toJSON() }); await patch({ enabled: true }); setDevice(true);
  };
  return <section className="sec"><h2>Notifications</h2><p className="note">One gentle daily nudge, off until you choose it. No nudges between 9pm and 7am or during classes. A test nudge counts as today’s one nudge.</p>
    {error && <p role="alert">{error}</p>}{!supported && <p className="muted">Push is not supported here. On iPhone, install Pathway to your Home Screen, then open that app to enable notifications.</p>}
    {data && <><p className="note">Times use {data.timezone}. {data.configured ? '' : 'Notifications have not been configured by the app owner yet.'}</p>
      <label className="frow"><span>Daily nudge</span><input type="checkbox" checked={data.enabled} disabled={busy || !supported || !data.configured} onChange={e => act(() => e.target.checked ? enable() : patch({ enabled: false }))} /></label>
      <label className="frow"><span>Nudge time</span><input type="time" min="07:00" max="20:59" value={data.time} disabled={busy} onChange={e => act(() => patch({ time: e.target.value }))} /></label>
      {data.pausedUntil && <p className="note">Paused until {new Date(data.pausedUntil).toLocaleString()}.</p>}
      <div className="acts"><button className="btn" disabled={busy || !data.enabled} onClick={() => act(() => patch({ pauseWeek: !data.pausedUntil }))}>{data.pausedUntil ? 'Resume nudges' : 'Pause for a week'}</button><button className="link" disabled={busy || !data.enabled} onClick={() => act(async () => { const result = await api<{status: string}>('/api/notifications/test', { method: 'POST' }); toast(statuses[result.status] || result.status); })}>Send a test nudge</button></div>
      {supported && !device && <button className="link" disabled={busy || !data.configured} onClick={() => act(enable)}>Enable on this device</button>}
      {device && <button className="link" disabled={busy} onClick={() => act(async () => { const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); if (sub) { await api('/api/push/unsubscribe', { body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); } setDevice(false); })}>Unsubscribe this device</button>}
    </>}
  </section>;
}
