import { useState } from 'react';
import { api } from '../lib/api';
import { Application, Proposal } from '../lib/types';
import { Sheet, toast, useLoad } from './ui';
import ProposalReview from './ProposalReview';
export default function Applications({ refresh,ask,knowledgeStates }: { refresh: string; ask?:(text:string,opportunityId?:string)=>void; knowledgeStates?:Record<string,string> }) {
  const { data, error, reload } = useLoad(() => api<Application[]>('/api/applications'), [refresh]);
  const [editing, setEditing] = useState<Application | null>(null), [proposal, setProposal] = useState<Proposal | null>(null);
  const patch = async (a: Application, body: unknown) => { try { await api(`/api/applications/${a.opportunityId}`, { method: 'PATCH', body }); reload(); } catch (e) { toast((e as Error).message); } };
  return <section className="sec" aria-label="My applications"><h2>Interested</h2><p className="muted small">My applications · Interested → Preparing → Applied → Result</p>
    {error && <p role="alert">{error} <button className="link" onClick={reload}>Try again</button></p>}
    {!data?.length && <p className="muted">Mark a program Interested to keep its steps and deadline here.</p>}
    {['interested', 'preparing', 'applied', 'result'].map(status => <div key={status}>{data?.some(a => a.status === status) && <h3 style={{ marginTop: 18, textTransform: 'capitalize' }}>{status}</h3>}{data?.filter(a => a.status === status).map(a => <article className="card" key={a.opportunityId} style={{ marginTop: 10 }}>
      <h3>{a.name}</h3>{a.deadlinePassed && <p className="note">Deadline passed — your application stays here.</p>}<p>{a.countdown?.label || 'Deadline unknown'}</p><p className="note">{a.deadline || 'No date yet'} · {a.deadlineSource}</p>
      <p className="muted">{a.completed} of {a.checklist.length} steps</p><p>Next: {a.nextStep}</p>
      {ask&&knowledgeStates?.[a.opportunityId]==='ready'&&<button className="link" onClick={()=>ask(`What should I know about ${a.name}?`,a.opportunityId)}>Ask about this program</button>}
      {knowledgeStates?.[a.opportunityId]==='preparing'&&<p className="note">Preparing details…</p>}
      <label>Status <select value={a.status} onChange={e => patch(a, { status: e.target.value })}>{['interested', 'preparing', 'applied', 'result'].map(s => <option key={s}>{s}</option>)}</select></label>
      <div className="acts"><button className="btn fill" onClick={async () => { try { setProposal(await api<Proposal>(`/api/applications/${a.opportunityId}/prep`, { method: 'POST' })); } catch (e) { toast((e as Error).message); } }}>Plan my prep</button><button className="link" onClick={() => setEditing(a)}>Edit details and steps</button></div>
    </article>)}</div>)}
    {editing && <Sheet title={editing.name} onClose={() => setEditing(null)}><form onSubmit={async e => { e.preventDefault(); await patch(editing, { deadline: editing.deadline || null, notes: editing.notes, checklist: editing.checklist }); setEditing(null); }}>
      <label htmlFor="application-deadline">Deadline added by you (not verified)</label><input id="application-deadline" className="field" type="date" value={editing.deadline || ''} onChange={e => setEditing({ ...editing, deadline: e.target.value || null })} />
      <label htmlFor="application-notes">Private notes</label><textarea id="application-notes" className="field" maxLength={4000} value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
      <h3>Steps</h3>{editing.checklist.map((step, i) => <label className="frow" key={i}><span>{step.title}</span><input type="checkbox" checked={step.done} onChange={e => setEditing({ ...editing, checklist: editing.checklist.map((s, n) => n === i ? { ...s, done: e.target.checked } : s) })} /></label>)}
      <button className="btn fill" type="submit">Save details</button>
    </form></Sheet>}
    {proposal && <ProposalReview initial={proposal} onClose={() => setProposal(null)} onDone={reload} />}
  </section>;
}
