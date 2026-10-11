import { useState } from 'react';
import { api } from '../lib/api';
import { Opportunity, Proposal, Student } from '../lib/types';
import { CEMO, FIT_LABEL } from '../lib/format';
import { Sheet, Typing, toast, useLoad } from '../components/ui';
import ProposalReview from '../components/ProposalReview';

type List = { recommended: Opportunity[]; excluded: { id: string; name: string; reasons: string[] }[]; dismissed: number; sampleData: boolean };

export default function Explore({ me, ask }: { me: Student; ask: (t: string) => void }) {
  const { data, reload } = useLoad(() => api<List>('/api/opportunities'), []);
  const [open, setOpen] = useState<Opportunity | null>(null), [review, setReview] = useState<Proposal | null>(null), [cmp, setCmp] = useState<string[]>([]), [showCmp, setShowCmp] = useState(false);
  if (!data) return <div className="splash"><Typing /></div>;
  const status = async (id: string, s: 'saved' | 'dismissed' | 'none') => { await api(`/api/opportunities/${id}/status`, { body: { status: s } }); toast(s === 'saved' ? 'Saved' : s === 'dismissed' ? 'Hidden' : 'Removed'); reload(); };
  const prep = async (id: string) => { try { setReview(await api<Proposal>(`/api/opportunities/${id}/prep`, { method: 'POST' })); setOpen(null); } catch (e) { toast((e as Error).message); } };
  const compared = data.recommended.filter(o => cmp.includes(o.id));
  return (
    <>
      <div className="top"><p className="date">Discover · Opportunities</p></div>
      <h1 className="display">Experiences that fit you</h1>
      <p className="muted" style={{ marginTop: 8 }}>Checked against your grade, time and interests, with the reasons shown.</p>
      <div className="sec" style={{ marginTop: 18 }}>{data.recommended.map(o => (
        <div className="opp" key={o.id}>
          <button className="main" onClick={() => setOpen(o)}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="emo">{CEMO[o.category] || '✨'}</span><span className={`fit ${o.fit.fit}`}>{FIT_LABEL[o.fit.fit!]}</span></div>
            <h3>{o.name}</h3><p className="muted small" style={{ marginTop: 4 }}>{o.fit.why}</p>
            <div className="factors">{o.fit.factors!.slice(0, 5).map(f => <span key={f.key} className="factor"><i className={`f-${f.state}`} />{f.key}</span>)}</div></button>
          <div className="foot"><button aria-pressed={o.status === 'saved'} onClick={() => status(o.id, o.status === 'saved' ? 'none' : 'saved')}>{o.status === 'saved' ? 'Saved' : 'Save'}</button>
            <button aria-pressed={cmp.includes(o.id)} onClick={() => setCmp(c => c.includes(o.id) ? c.filter(x => x !== o.id) : [...c, o.id].slice(-3))}>{cmp.includes(o.id) ? 'Comparing' : 'Compare'}</button>
            <button onClick={() => status(o.id, 'dismissed')}>Not for me</button></div></div>))}</div>
      {data.excluded.length > 0 && <details className="fold" style={{ marginTop: 14 }}><summary>Not a fit right now ({data.excluded.length})</summary><div className="rows">{data.excluded.map(x => <div className="r" key={x.id}><span className="b"><span className="t">{x.name}</span><span className="s" style={{ display: 'block' }}>{x.reasons.join('; ')}</span></span></div>)}</div></details>}
      {data.sampleData && <p className="note">Sample data: a curated starter set, not verified for this year. Confirm dates and deadlines on each official site.</p>}
      {cmp.length >= 2 && <div className="cmpbar"><button className="btn fill" onClick={() => setShowCmp(true)}>Compare {cmp.length}</button></div>}

      {open && <Sheet onClose={() => setOpen(null)}>
        <div style={{ textAlign: 'center', padding: '4px 0 14px' }}><p style={{ fontSize: 40 }}>{CEMO[open.category] || '✨'}</p><h2 className="serif" style={{ fontSize: 27, marginTop: 6 }}>{open.name}</h2><p className="muted small">{open.organizer}</p><p style={{ marginTop: 10 }}><span className={`fit ${open.fit.fit}`}>{FIT_LABEL[open.fit.fit!]}</span></p></div>
        <div className="card"><p className="label">WHY IT FITS</p><p className="lead" style={{ fontSize: 18, marginTop: 6 }}>{open.fit.why}</p></div>
        <div className="sec"><p className="label">HOW IT LINES UP</p><div className="card" style={{ padding: '4px 16px', marginTop: 6 }}>{open.fit.factors!.map(f => <div className="contrib" key={f.key}><b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><i className={`f-${f.state}`} style={{ width: 8, height: 8, borderRadius: 4, display: 'inline-block' }} />{f.key}</b><p className="muted small" style={{ marginTop: 4 }}>{f.text}</p></div>)}</div></div>
        <div className="sec"><p className="label">CHECK BEFORE YOU COMMIT</p><div className="rows" style={{ marginTop: 8 }}>{[...open.fit.eligibility.checks, `Deadline: ${open.deadline || 'unknown — confirm on the official site'}`].map(c => <div className="r" key={c}><span className="b"><span className="t small">{c}</span></span></div>)}
          <a className="r" href={open.url} target="_blank" rel="noreferrer"><span className="b"><span className="t" style={{ color: 'var(--peri)' }}>Official site</span><span className="s" style={{ display: 'block' }}>{open.url.replace(/^https?:\/\//, '')}</span></span></a></div></div>
        <div className="sec"><p className="label">ONE NEXT STEP</p><div className="acts"><button className="btn fill lg" onClick={() => prep(open.id)}>Set a prep reminder</button></div>
          <div className="acts" style={{ marginTop: 8 }}>{me.aiConsent && <button className="btn" style={{ flex: 1 }} onClick={() => ask(`I’m interested in ${open.name} (opportunityId ${open.id}). Check my eligibility, readiness and free time, explain what to verify, then propose a plan.`)}>Plan with Buddy</button>}</div></div>
      </Sheet>}
      {showCmp && <Sheet title="Compare" onClose={() => setShowCmp(false)}><div className="cmp"><table><thead><tr><td />{compared.map(o => <td key={o.id}>{o.name}</td>)}</tr></thead><tbody>
        {([['Fit', (o: Opportunity) => FIT_LABEL[o.fit.fit!]], ['Format', (o: Opportunity) => o.format], ['Cost', (o: Opportunity) => o.cost], ['Time', (o: Opportunity) => o.commitment], ['To check', (o: Opportunity) => o.fit.eligibility.checks.join('; ') || '—']] as const).map(([l, f]) => <tr key={l}><th>{l}</th>{compared.map(o => <td key={o.id}>{f(o)}</td>)}</tr>)}</tbody></table></div></Sheet>}
      {review && <ProposalReview initial={review} onClose={() => { setReview(null); reload(); }} onDone={reload} />}
    </>
  );
}
