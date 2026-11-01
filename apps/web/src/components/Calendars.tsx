import { useState } from 'react';
import { api } from '../lib/api';
import { toast, useLoad } from './ui';
type Calendar = { id: string; label: string; maskedUrl: string; lastSync: string | null; error: string; eventType: string };
export function CalendarHelp() {
  return <details className="fold"><summary>Where do I find my iCal link?</summary><ul>
    <li>Google Calendar on a computer: Settings → choose your calendar → Integrate calendar → Secret address in iCal format. Google Classroom due dates can appear in Google Calendar; choose the class calendar.</li>
    <li>Apple iCloud Calendar: sharing button → Public Calendar → Copy Link. Apple’s share link is readable by anyone who has it. Only use this option if that sharing is right for you; keep the link private.</li>
    <li>Canvas: Calendar → Calendar Feed → copy the subscription link.</li>
    <li>School website: look for Subscribe or iCal. Paste the HTTPS or webcal link, not a normal calendar webpage.</li>
  </ul><p className="note">Pathway only reads your calendar. Edit events at their source. Imported all-day items appear as dates, not all-day study blocks.</p></details>;
}
export default function Calendars() {
  const { data, error, reload } = useLoad(() => api<Calendar[]>('/api/calendars'), []);
  const [url, setUrl] = useState(''), [label, setLabel] = useState('Google Calendar'), [eventType, setEventType] = useState('class'), [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); reload(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); } };
  return <section className="sec"><h2>Calendars</h2><p className="note">Private links are stored securely and shown only as a masked address. Linked events are read-only and refresh about every three hours while the server is running.</p>
    {error && <p role="alert">{error}</p>}{data?.map(c => <div className="card" key={c.id}><h3>{c.label}</h3><p className="tiny">{c.maskedUrl}</p><p className="muted small">{c.lastSync ? `Last sync: ${new Date(c.lastSync).toLocaleString()}` : 'Not synced yet'}</p>{c.error && <p role="alert">{c.error}</p>}<div className="acts"><button className="btn" disabled={busy} onClick={() => act(() => api(`/api/calendars/${c.id}/sync`, { method: 'POST' }))}>Sync now</button><button className="link" disabled={busy} onClick={() => { if (confirm('Remove this calendar and its imported events from Pathway? The source calendar stays as it is.')) void act(() => api(`/api/calendars/${c.id}`, { method: 'DELETE' })); }}>Remove</button></div></div>)}
    <details className="fold"><summary>Add a calendar</summary><form onSubmit={e => { e.preventDefault(); void act(async () => { await api('/api/calendars', { body: { url, label, eventType } }); setUrl(''); }); }}>
      <label htmlFor="calendar-label">Calendar name</label><input id="calendar-label" className="field" value={label} maxLength={50} required onChange={e => setLabel(e.target.value)} />
      <label htmlFor="calendar-url">Private iCal link</label><input id="calendar-url" className="field" type="password" autoComplete="off" value={url} maxLength={4096} required onChange={e => setUrl(e.target.value)} />
      <label htmlFor="calendar-type">Timed events are</label><select id="calendar-type" value={eventType} onChange={e => setEventType(e.target.value)}><option value="class">Classes</option><option value="personal">Personal commitments</option><option value="other">Other commitments</option></select>
      <button className="btn fill" disabled={busy} type="submit">{busy ? 'Linking…' : 'Link read-only calendar'}</button>
    </form></details><CalendarHelp />
  </section>;
}
