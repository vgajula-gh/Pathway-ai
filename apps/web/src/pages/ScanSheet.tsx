import { useState } from 'react';
import { api } from '../lib/api';
import { Sheet, Typing, toast } from '../components/ui';

type Row = { sel: boolean; title: string; type: string; date: string | null; weekdays: number[] | null; start: string | null; end: string | null; location: string | null; confidence: string; note: string; from: string; until: string };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const missing = (r: Row) => [!r.title && 'title', !(r.weekdays?.length) && !r.date && 'date', r.type !== 'deadline' && !r.start && 'start time', r.type !== 'deadline' && !r.end && 'end time'].filter(Boolean) as string[];

/** Extraction preview: candidates are never saved until the student confirms. */
export default function ScanSheet({ aiConsent, onClose }: { aiConsent: boolean; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'working' | 'review'>('idle'), [rows, setRows] = useState<Row[]>([]), [text, setText] = useState(''), [file, setFile] = useState<File | null>(null);
  const read = async () => {
    setState('working');
    try {
      const form = new FormData(); if (file) form.append('file', file); if (text) form.append('text', text);
      const r = await api<{ events: Omit<Row, 'sel' | 'from' | 'until'>[] }>('/api/extract', { form });
      setRows((r.events || []).map(e => ({ ...e, sel: true, from: new Date().toISOString().slice(0, 10), until: '' }))); setState('review');
    } catch (e) { toast((e as Error).message); setState('idle'); }
  };
  const save = async () => {
    const ready = rows.filter(r => r.sel && !missing(r).length);
    const events = ready.map(r => { const weekly = !!r.weekdays?.length; let base = new Date((weekly ? r.from : r.date) + 'T00:00');
      if (weekly) while (!r.weekdays!.includes(base.getDay())) base.setDate(base.getDate() + 1);
      const day = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`, st = r.start || '23:59';
      return { title: r.title, type: r.type, start: `${day}T${st}`, end: `${day}T${r.type === 'deadline' ? st : r.end}`, location: r.location || '', recurDays: r.weekdays || [], recurUntil: r.until, confidence: r.confidence }; });
    try { await api('/api/events/bulk', { body: { source: 'upload', events } }); toast(`Added ${events.length} events`); onClose(); } catch (e) { toast((e as Error).message); }
  };
  const upd = (i: number, k: keyof Row, v: unknown) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const ready = rows.filter(r => r.sel && !missing(r).length).length;
  return (
    <Sheet title="Scan a schedule" onClose={onClose} left={<button className="navbtn" onClick={onClose}>Cancel</button>} right={<span />}>
      {state === 'idle' && <><div style={{ textAlign: 'center', padding: '10px 0 16px' }}><p style={{ fontSize: 42 }}>📸</p><h2 className="serif" style={{ fontSize: 24 }}>Snap your timetable</h2><p className="muted small">You’ll review every event before anything is saved.</p></div>
        <label className="btn fill lg" style={{ cursor: 'pointer' }}>{file ? file.name : 'Choose a photo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
        <textarea className="field" style={{ marginTop: 12 }} placeholder="Or paste schedule text" value={text} onChange={e => setText(e.target.value)} aria-label="Schedule text" />
        <button className="btn lg" style={{ marginTop: 10 }} disabled={!aiConsent || (!file && !text)} onClick={read}>Read it</button>{!aiConsent && <p className="note">Needs AI help, which is turned off.</p>}</>}
      {state === 'working' && <div style={{ textAlign: 'center', padding: 40 }}><Typing /><p className="muted">Reading…</p></div>}
      {state === 'review' && <><p className="muted small">I found {rows.length}. Fix anything outlined, then add them.</p>
        {rows.map((r, i) => { const m = missing(r), weekly = !!r.weekdays?.length; return (
          <div key={i} className={`extract ${m.length ? 'need' : ''}`}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" className="switch" checked={r.sel} onChange={e => upd(i, 'sel', e.target.checked)} /><span className="small">Include</span>{r.confidence !== 'high' && <span className="tiny c-peach" style={{ marginLeft: 'auto' }}>Double-check</span>}</label>
            <input style={{ marginTop: 10 }} value={r.title} onChange={e => upd(i, 'title', e.target.value)} aria-label="Title" />
            <div className="g2">{weekly ? <div className="small">Every {r.weekdays!.map(d => DOW[d]).join(', ')}</div> : <input type="date" value={r.date || ''} onChange={e => upd(i, 'date', e.target.value)} aria-label="Date" />}<input type="time" value={r.start || ''} onChange={e => upd(i, 'start', e.target.value)} aria-label="Start" /></div>
            <div className="g2"><input type="time" value={r.end || ''} onChange={e => upd(i, 'end', e.target.value)} aria-label="End" />{weekly && <input type="date" value={r.until} onChange={e => upd(i, 'until', e.target.value)} aria-label="Repeat until" />}</div>
            {m.length > 0 && <p className="small c-peach" style={{ marginTop: 6 }}>Add the {m.join(', ')}</p>}</div>); })}
        <button className="btn fill lg" style={{ marginTop: 16 }} disabled={!ready} onClick={save}>Add {ready} events</button></>}
    </Sheet>
  );
}
