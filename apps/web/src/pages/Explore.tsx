import RegionSelect from '../components/RegionSelect';
import Applications from '../components/Applications';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Opportunity, Proposal, Student } from '../lib/types';
import { CEMO, FIT_LABEL } from '../lib/format';
import { Sheet, Typing, toast, useLoad } from '../components/ui';
import ProposalReview from '../components/ProposalReview';
import OpportunitySearch, { OpportunitySearchStatus } from '../components/OpportunitySearch';

type List = OpportunitySearchStatus & { picks: Opportunity[]; recommended: Opportunity[]; excluded: { id: string; name: string; reasons: string[] }[]; canAskAll?:boolean; knowledgeStates?:Record<string,string>; preparing?:boolean; interestedCount: number; dismissed: number; sampleData: boolean };

export default function Explore({ me, ask, setMe }: { me: Student; ask: (t: string, opportunityId?: string) => void; setMe?: (s:Student)=>void }) {
  const { data, error, reload, setData } = useLoad(() => api<List>('/api/opportunities'), []);
  const [dismiss, setDismiss] = useState<Opportunity | null>(null);
  const [open, setOpen] = useState<Opportunity | null>(null), [review, setReview] = useState<Proposal | null>(null), [cmp, setCmp] = useState<string[]>([]), [showCmp, setShowCmp] = useState(false);
  const [busy,setBusy]=useState(false),[searchError,setSearchError]=useState<string|null>(null),[editing,setEditing]=useState(false),[interestText,setInterestText]=useState(''),[interests,setInterests]=useState(me.interests),[region,setRegion]=useState(me.region||'');
  const worker=useRef(false);
  useEffect(()=>{setInterests(me.interests);setRegion(me.region||'');},[me.interests,me.region]);
  useEffect(()=>{
    if(!(data?.finding||data?.preparing)||!me.aiConsent)return;
    let active=true;
    const work=async()=>{if(worker.current)return;worker.current=true;try{await api('/api/discovery/run',{method:'POST',body:{}});if(active){setSearchError(null);reload();}}catch(e){if(active)setSearchError((e as Error).message);}finally{worker.current=false;}};
    void work();const timer=setInterval(()=>{reload();void work();},5000);
    return()=>{active=false;clearInterval(timer);};
  },[data?.finding,data?.preparing,me.aiConsent,me.interests.join(',')]);
  const refresh=async()=>{if(busy)return;setBusy(true);setSearchError(null);try{const result=await api<OpportunitySearchStatus>('/api/opportunities/refresh',{method:'POST'});setData(old=>old?{...old,...result}:old);reload();}catch(e){setSearchError((e as Error).message);reload();}finally{setBusy(false);}};
  const saveInterests=async()=>{setBusy(true);try{const student=await api<Student>('/api/me',{method:'PATCH',body:{interests,region}});setMe?.(student);setEditing(false);reload();}catch(e){toast((e as Error).message);}finally{setBusy(false);}};
  if (!data) return <section aria-label="Opportunity search"><h1>Opportunity search</h1>{error?<p role="alert">{error} <button className="btn" onClick={reload}>Try again</button></p>:<p role="status">Loading your interests… <Typing/></p>}</section>;
  const status = async (id: string, s: 'saved' | 'dismissed' | 'none', reason?: string) => { try {await api(`/api/opportunities/${id}/status`, { body: { status: s, reason } }); toast(s === 'saved' ? 'Added to Interested' : s === 'dismissed' ? 'Hidden' : 'Removed'); reload();return true;}catch(e){toast((e as Error).message);return false;} };
  const prep = async (id: string) => { try { setReview(await api<Proposal>(`/api/opportunities/${id}/prep`, { method: 'POST' })); setOpen(null); } catch (e) { toast((e as Error).message); } };
  const hasResults=!!data.search?.startedAt||data.picks.length>0||data.finding;
  const compared = data.recommended.filter(o => cmp.includes(o.id));
  return (
    <>
      {data.interestedCount>0&&<Applications ask={ask} knowledgeStates={data.knowledgeStates} refresh={String(data.interestedCount)+data.recommended.map(o=>o.status).join()} />}
      <section className="sec opportunity-search" aria-label="Opportunity search">
      <p className="label">Opportunity search</p>
      <h1 className="display">Opportunities picked for your interests</h1>
      <div className="interest-chips" aria-label="Your interests">{me.interests.map(i=><span className="factor" key={i}>{i}</span>)}</div>
      <p className="muted small">Region: {me.region==='virtual'?'Virtual only':me.region||'Not set'}</p>
      <button className="link" onClick={()=>setEditing(!editing)}>Edit interests and region</button>
      {editing&&<form className="card" onSubmit={e=>{e.preventDefault();void saveInterests();}}>
        <div className="interest-chips">{interests.map(i=><button type="button" className="btn" aria-label={`Remove ${i}`} key={i} onClick={()=>setInterests(interests.filter(x=>x!==i))}>{i} ×</button>)}</div>
        <label htmlFor="explore-interest">Add an interest</label><input className="field" id="explore-interest" value={interestText} maxLength={50} onChange={e=>setInterestText(e.target.value)}/>
        <button type="button" className="btn" disabled={!interestText.trim()||interests.length>=15} onClick={()=>{if(!interests.some(i=>i.toLowerCase()===interestText.trim().toLowerCase()))setInterests([...interests,interestText.trim()]);setInterestText('');}}>Add interest</button>
        <RegionSelect value={region} onChange={setRegion}/><button className="btn fill" disabled={busy} type="submit">Save interests</button>
      </form>}
      <OpportunitySearch status={data} interests={me.interests} onRefresh={refresh} busy={busy} error={searchError}/>
      <button className="link" disabled={!data.canAskAll} onClick={()=>ask('What should I know about my opportunities?','my_opportunities')}>Ask about my opportunities</button>
      {hasResults&&!data.finding&&me.interests.length>0&&!data.picks.length&&data.discoveryEnabled&&!data.error&&!data.limited&&<p className="card">No active opportunities found for these interests right now. Try adding another interest, or check back next month.</p>}
      {error&&<p role="alert">{error} <button className="link" onClick={reload}>Try again</button></p>}
      <div className="sec" style={{ marginTop: 18 }}>{hasResults&&(['free', 'paid'] as const).map(bucket => <details key={bucket} className="fold" open={bucket === 'free' || me.budget !== 'free'}><summary>{bucket === 'free' ? 'Free' : me.budget === 'free' ? 'Show paid options' : 'Paid'} ({data.picks.filter(o=>o.bucket===bucket).length})</summary>{!data.finding&&data.picks.filter(o=>o.bucket===bucket).length<3&&<p className="note">Only {data.picks.filter(o=>o.bucket===bucket).length} active {bucket} opportunities found right now — we’ll keep looking.</p>}{data.picks.filter(o=>o.bucket===bucket).map(o => (
        <div className="opp" key={o.id}>
          <button className="main" onClick={() => setOpen(o)}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="emo">{CEMO[o.category] || '✨'}</span><span className={`fit ${o.fit.fit}`}>{FIT_LABEL[o.fit.fit!]}</span></div>
            <h3>{o.name}</h3><p className="muted small">{o.organizer} · {o.opportunityType||o.category}</p><p className="small">{o.deadline ? `Deadline ${o.deadline} · ${o.countdown?.label||'Confirm on the official site'}` : 'Open sign-up · check the official site'}</p><p className="small">{o.costLabel}</p>{o.financialAidNote && <p className="small">{o.financialAidNote}</p>}{o.feeFlag && <p className="note">Check fees carefully on the official site.</p>}<p className="tiny">{o.verified && o.verifiedAt ? `Verified ${new Date(o.verifiedAt).toLocaleDateString()}` : 'New find — details not confirmed'}{o.isStretch ? ' · Try something new' : ''}</p><p className="muted small" style={{ marginTop: 4 }}>{o.fit.why}</p>
            <div className="factors">{o.fit.factors!.slice(0, 5).map(f => <span key={f.key} className="factor"><i className={`f-${f.state}`} />{f.key}</span>)}</div></button>
          <div className="foot"><button aria-pressed={!!o.status && o.status !== 'dismissed'} onClick={() => status(o.id, !!o.status && o.status !== 'dismissed' ? 'none' : 'saved')}>Interested</button>
            <button aria-pressed={cmp.includes(o.id)} onClick={() => setCmp(c => c.includes(o.id) ? c.filter(x => x !== o.id) : [...c, o.id].slice(-3))}>{cmp.includes(o.id) ? 'Comparing' : 'Compare'}</button>
            <button onClick={() => setDismiss(o)}>Not for me</button>{!o.canAsk&&<span className="note">{o.knowledgeStatus==='preparing'?'Preparing details…':'Program questions unavailable right now'}</span>}{o.canAsk && <button onClick={()=>ask(`What should I know about ${o.name}?`,o.id)}>Ask about this program</button>}<a className="link" href={o.url} target="_blank" rel="noreferrer">Official site</a></div></div>))}</details>)}</div>
      {data.sampleData && <p className="note">Sample data: a curated starter set, not verified for this year. Confirm dates and deadlines on each official site.</p>}
      </section>
      {cmp.length >= 2 && <div className="cmpbar"><button className="btn fill" onClick={() => setShowCmp(true)}>Compare {cmp.length}</button></div>}

      {dismiss && <Sheet title="Not for me" onClose={()=>setDismiss(null)}><p className="sub">What didn’t fit? This helps us choose next time.</p><div className="rows">{['not my interest','too much time','too far','cost','other'].map(reason=><button className="r" key={reason} onClick={async()=>{if(await status(dismiss.id,'dismissed',reason))setDismiss(null);}}>{reason}</button>)}</div></Sheet>}
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
