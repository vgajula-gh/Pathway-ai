import { useState } from 'react';
import { api, download } from '../lib/api';
import { Proposal, Action } from '../lib/types';
import { EMO, fmtDay, fmtTime } from '../lib/format';
import { Sheet, toast } from './ui';

export function actionLine(a: Action): [string, string, string] {
  const when = a.start ? `${fmtDay(a.start)}, ${fmtTime(a.start)}` : '';
  switch (a.type) {
    case 'add_event': return [EMO[a.eventType || 'other'], a.eventType === 'reminder' ? `Reminder: ${a.title}` : a.title || '', when];
    case 'move_event': return ['↔️', 'Move an event', when];
    case 'remove_event': return ['🗑️', 'Remove an event', ''];
    case 'add_goal': return ['🎯', a.title || '', 'New goal'];
    case 'add_milestone': return ['◦', a.title || '', `${a.effortMin} min${a.targetDate ? ' · by ' + fmtDay(a.targetDate) : ''}`];
    case 'add_application_requirements': return ['☑', `Add ${a.checklist?.length || 0} official checklist steps`, `${a.checklist?.map(c=>c.title).join(' · ') || ''}${a.deadline ? ` · Deadline ${a.deadline}` : ''}`];
    case 'save_opportunity': return ['⭐', 'Save opportunity', ''];
    case 'add_portfolio_entry': return ['🏅', a.title || '', 'Add to portfolio'];
    default: return ['•', a.type, ''];
  }
}

/** Action Agent approval: scope, data used, consequences, then Approved → Saving → Verified. */
export default function ProposalReview({ initial, onClose, onDone }: { initial: Proposal; onClose: () => void; onDone?: () => void }) {
  const [p, setP] = useState(initial), [busy, setBusy] = useState(false);
  const act = async (verb: 'approve' | 'reject') => {
    setBusy(true);
    try { const r = await api<Proposal>(`/api/proposals/${p.id}/${verb}`, { method: 'POST' }); setP(r); toast(r.status === 'VERIFIED' ? 'Saved and verified ✓' : r.status === 'REJECTED' ? 'No problem. Nothing changed.' : 'That didn\u2019t go through'); onDone?.(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const reached = p.status === 'VERIFIED' ? 4 : p.status === 'FAILED' ? 3 : 1;
  const hasReminder = p.actions.some(a => a.type === 'add_event' && a.eventType === 'reminder');
  const reminderId = p.status === 'VERIFIED' && hasReminder ? p.createdIds.find(([k]) => k === 'event')?.[1] : undefined;
  return (
    <Sheet title="Review" onClose={onClose} right={<button className="navbtn" onClick={onClose}>Close</button>}>
      <h2 className="serif" style={{ fontSize: 26 }}>{p.summary}</h2>
      {p.rationale && <p className="muted" style={{ marginTop: 8 }}>{p.rationale}</p>}
      <div className="sec"><p className="label">WHAT WILL HAPPEN</p>
        <div className="card" style={{ marginTop: 8, padding: '8px 16px' }}>{p.actions.map((a, i) => { const [e, t, s] = actionLine(a); return <div className="pi" key={i}><span>{e}</span><div><div>{t}</div>{s && <div className="muted small">{s}</div>}</div></div>; })}</div></div>
      <div className="sec"><p className="label">INFO USED</p><p className="muted" style={{ marginTop: 6 }}>{p.dataUsed.join(' · ')}</p></div>
      <div className="sec"><p className="label">WHAT CHANGES</p><p className="muted" style={{ marginTop: 6 }}>{p.effect}</p></div>
      <div className="steps">{['Proposed', 'Approved', 'Saving', 'Verified'].map((s, i) => <span key={s} className={`step ${i < reached ? 'on' : ''} ${p.status === 'FAILED' && i === 3 ? 'bad' : ''}`}>{p.status === 'FAILED' && i === 3 ? 'Failed' : s}</span>)}</div>
      {p.status === 'AWAITING_APPROVAL' && <div className="acts" style={{ marginTop: 20 }}><button className="btn fill lg" disabled={busy} onClick={() => act('approve')}>Approve</button><button className="btn lg" disabled={busy} onClick={() => act('reject')}>Not now</button></div>}
      {p.status === 'VERIFIED' && <div className="card" style={{ marginTop: 18 }}><p><span className="c-teal">✓</span> {p.result}</p>
        {reminderId && <div className="acts"><button className="btn" onClick={() => download(`/api/events/${reminderId}/ics`, 'pathway-reminder.ics')}>Add to my phone calendar</button></div>}
        <p className="tiny" style={{ marginTop: 8 }}>Downloads a calendar file. Nothing is added to your phone until you open it.</p></div>}
      {p.status === 'FAILED' && <div className="card" style={{ marginTop: 18 }}><p className="c-rose">{p.result}</p></div>}
      {['REJECTED', 'EXPIRED'].includes(p.status) && <p className="muted" style={{ marginTop: 18 }}>Nothing changed.</p>}
    </Sheet>
  );
}
