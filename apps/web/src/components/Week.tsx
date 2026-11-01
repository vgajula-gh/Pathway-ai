import { useState } from 'react';
import { api } from '../lib/api';
import { Sheet, useLoad } from './ui';
type Day = { date: string; load: string; minutes: number; clash: boolean; events: { id: string; title: string; start: string; end: string; source: string; readOnly: boolean }[] };
export default function Week() {
  const { data, error, reload } = useLoad(() => api<Day[]>('/api/week'), []);
  const [day, setDay] = useState<Day | null>(null);
  return <section className="sec"><h2>Your week</h2>{error && <p role="alert">{error} <button className="link" onClick={reload}>Try again</button></p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4, marginTop: 10 }}>{data?.map(d => <button className="card" style={{ padding: '10px 2px', textAlign: 'center', fontSize: 11 }} key={d.date} onClick={() => setDay(d)} aria-label={`${d.date}: ${d.load}${d.clash ? ', overlapping events' : ''}`}><b>{new Date(d.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })}</b><br />{d.date.slice(8)}<br /><span>{d.load}</span>{d.clash && <span className="c-rose" aria-hidden="true"> ●</span>}</button>)}</div>
    <p className="note">Load compares scheduled minutes with your study window. It’s a guide, not a score.</p>
    {day && <Sheet title={new Date(day.date + 'T12:00').toLocaleDateString()} onClose={() => setDay(null)}><p>{day.minutes} scheduled minutes · {day.load}</p>{day.clash && <p>Some events overlap.</p>}{day.events.length ? day.events.map(e => <div className="r" key={e.id + e.start}><span><b>{e.title}</b><br />{e.start.slice(11)}–{e.end.slice(11)}<br /><span className="note">{e.source}{e.readOnly ? ' · read-only' : ''}</span></span></div>) : <p className="muted">Nothing on this day yet.</p>}</Sheet>}
  </section>;
}
