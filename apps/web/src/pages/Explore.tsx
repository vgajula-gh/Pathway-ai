import ReviewSheet from '../components/growth-map/ReviewSheet';
import DiscoveryPreferencesEditor from '../components/DiscoveryPreferencesEditor';
import Applications from '../components/Applications';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Opportunity, Proposal, Student } from '../lib/types';
import { CEMO, FIT_LABEL } from '../lib/format';
import { Sheet, Typing, toast, useLoad } from '../components/ui';
import ProposalReview from '../components/ProposalReview';
import OpportunitySearch, { OpportunitySearchStatus } from '../components/OpportunitySearch';

type List = OpportunitySearchStatus & { watchlist?: (Opportunity & {openingDate:string})[]; picks: Opportunity[]; recommended: Opportunity[]; excluded: { id: string; name: string; reasons: string[] }[]; canAskAll?:boolean; knowledgeStates?:Record<string,string>; preparing?:boolean; interestedCount: number; dismissed: number; sampleData: boolean };

export default function Explore({ me, ask, setMe,initialOpportunityId,onInitialOpened }: { initialOpportunityId?:string|null;onInitialOpened?:()=>void; me: Student; ask: (t: string, opportunityId?: string) => void; setMe?: (s:Student)=>void }) {
  const [growthReview,setGrowthReview]=useState<string|null>(null);
  const { data, error, reload, setData } = useLoad(() => api<List>('/api/opportunities'), []);
  const [dismiss, setDismiss] = useState<Opportunity | null>(null);
  const [open, setOpen] = useState<Opportunity | null>(null), [review, setReview] = useState<Proposal | null>(null), [cmp, setCmp] = useState<string[]>([]), [showCmp, setShowCmp] = useState(false);
  const [busy,setBusy]=useState(false),[searchError,setSearchError]=useState<string|null>(null),[editing,setEditing]=useState(false);
  const worker=useRef(false);
  useEffect(()=>{if(!initialOpportunityId)return;let active=true;void api<Opportunity>('/api/opportunities/'+initialOpportunityId).then(o=>{if(active){setOpen(o);onInitialOpened?.();}}).catch(e=>{if(active){setSearchError((e as Error).message);onInitialOpened?.();}});return()=>{active=false;};},[initialOpportunityId]);
  useEffect(()=>{
    if(!(data?.finding||data?.preparing)||!me.aiConsent)return;
    let active=true,timer:ReturnType<typeof setTimeout>;
    const work=async()=>{if(!active)return;if(worker.current){timer=setTimeout(work,500);return;}worker.current=true;
      let delay=250;
      try{await api('/api/discovery/run',{method:'POST',body:{}});if(active){setSearchError(null);reload();}}
      catch(e){delay=5000;if(active)setSearchError((e as Error).message);}
      finally{worker.current=false;if(active)timer=setTimeout(work,delay);}
    };
    void work();const poll=setInterval(reload,2500);
    return()=>{active=false;clearTimeout(timer);clearInterval(poll);};
  },[data?.finding,data?.preparing,me.aiConsent,me.interests.join(',')]);
  const refresh=async()=>{if(busy)return;setBusy(true);setSearchError(null);try{const result=await api<OpportunitySearchStatus>('/api/opportunities/refresh',{method:'POST'});setData(old=>old?{...old,...result}:old);reload();}catch(e){setSearchError((e as Error).message);reload();}finally{setBusy(false);}};
  if (!data) return <section aria-label="Opportunity search"><h1>Opportunity search</h1>{error?<p role="alert">{error} <button className="btn" onClick={reload}>Try again</button></p>:<p role="status">Loading your interests… <Typing/></p>}</section>;
  const status = async (id: string, s: 'saved' | 'dismissed' | 'none', reason?: string) => { try {await api(`/api/opportunities/${id}/status`, { body: { status: s, reason } }); if(s==='saved')setGrowthReview(id);toast(s === 'saved' ? 'Added to Interested' : s === 'dismissed' ? 'Hidden' : 'Removed'); reload();return true;}catch(e){toast((e as Error).message);return false;} };
  const prep = async (id: string) => { try { setReview(await api<Proposal>(`/api/opportunities/${id}/prep`, { method: 'POST' })); setOpen(null); } catch (e) { toast((e as Error).message); } };
  const candidates=[...new Map([...data.recommended,...data.picks].map(o=>[o.id,o])).values()].filter(o=>!o.status&&!o.fit.excluded);
  const visible=(['free','paid'] as const).flatMap(bucket=>candidates.filter(o=>o.bucket===bucket)
    .sort((a,b)=>(b.fit.score??0)-(a.fit.score??0)).slice(0,5));
  const hasResults=!!data.search?.startedAt||visible.length>0||data.finding;
  const compared = data.recommended.filter(o => cmp.includes(o.id));
  return (
    <>
      {data.interestedCount>0&&<Applications ask={ask} knowledgeStates={data.knowledgeStates} refresh={String(data.interestedCount)+data.recommended.map(o=>o.status).join()} />}
      <section className="sec opportunity-search" aria-label="Opportunity search">
      <p className="label">Opportunity search</p>
      <h1 className="display">Explore opportunities</h1>
      <div className="interest-chips" aria-label="Your interests">{me.interests.map(i=><span className="factor" key={i}>{i}</span>)}</div>
      <p className="note">Showing up to 5 Free and 5 Paid or cost-unconfirmed options, ranked for you. Past deadlines are excluded; check eligibility, location, cost and application details.</p>
      <p className="muted small">Region: {me.region==='virtual'?'Virtual only':me.region||'Not set'}</p>
      <button className="link" onClick={()=>setEditing(true)}>Edit interests and preferences</button>
      {editing&&<DiscoveryPreferencesEditor me={me} onSaved={student=>{setMe?.(student);reload();}} onClose={()=>setEditing(false)}/>}
      <OpportunitySearch status={data} interests={me.interests} onRefresh={refresh} busy={busy} error={searchError}/>
      <button className="link" disabled={!data.canAskAll} onClick={()=>ask('What should I know about my opportunities?','my_opportunities')}>Ask about my opportunities</button>
      {hasResults&&!data.finding&&me.interests.length>0&&!visible.length&&data.discoveryEnabled&&!data.error&&!data.limited&&<p className="card">No unexpired results are available yet. Try another search when your allowance is available.</p>}
      {error&&<p role="alert">{error} <button className="link" onClick={reload}>Try again</button></p>}
      <div className="sec" style={{ marginTop: 18 }}>{hasResults&&(['free', 'paid'] as const).map(bucket => <details key={bucket} className="fold" open><summary>{bucket === 'free' ? 'Free' : 'Paid or cost unconfirmed'} ({visible.filter(o=>o.bucket===bucket).length})</summary>{!data.finding&&visible.filter(o=>o.bucket===bucket).length<5&&<p className="note">Only {visible.filter(o=>o.bucket===bucket).length} {bucket==='free'?'Free':'Paid or cost-unconfirmed'} options available right now. We’ll show up to 5 when more are available.</p>}{visible.filter(o=>o.bucket===bucket).map(o => (
        <div className="opp" key={o.id}>
          <button className="main" onClick={() => setOpen(o)}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="emo">{CEMO[o.category] || '✨'}</span><span className={`fit ${o.fit.fit}`}>{o.fit.eligibility.status==='eligible'?FIT_LABEL[o.fit.fit!]:'Review details'}</span></div>
            <h3>{o.name}</h3><p className="muted small">{o.organizer} · {o.opportunityType||o.category}</p><p className="small">{o.deadline ? `Deadline ${o.deadline} · ${o.countdown?.label||'Confirm on the official site'}` : 'Deadline not confirmed — check the program page'}</p><p className="small">{o.costLabel}</p>{o.financialAidNote && <p className="small">{o.financialAidNote}</p>}{o.feeFlag && <p className="note">Check fees carefully on the official site.</p>}<p className="tiny">{o.verified && o.verifiedAt ? `Verified ${new Date(o.verifiedAt).toLocaleDateString()}` : `Needs checking${o.sourceReadAt?' · Page read '+new Date(o.sourceReadAt).toLocaleDateString():''}`}{o.isStretch ? ' · Try something new' : ''}</p><p className="note">{o.fit.eligibility.checks.join('; ')}</p><p className="muted small" style={{ marginTop: 4 }}>{o.fit.why}</p>
            <div className="factors">{o.fit.factors!.slice(0, 5).map(f => <span key={f.key} className="factor"><i className={`f-${f.state}`} />{f.key}</span>)}</div></button>
          <div className="foot"><button aria-pressed={!!o.status && o.status !== 'dismissed'} onClick={() => status(o.id, !!o.status && o.status !== 'dismissed' ? 'none' : 'saved')}>Interested</button>
            <button aria-pressed={cmp.includes(o.id)} onClick={() => setCmp(c => c.includes(o.id) ? c.filter(x => x !== o.id) : [...c, o.id].slice(-3))}>{cmp.includes(o.id) ? 'Comparing' : 'Compare'}</button>
            <button onClick={() => setDismiss(o)}>Not for me</button>{!o.canAsk&&<span className="note">{o.knowledgeStatus==='preparing'?'Preparing details…':'Program questions unavailable right now'}</span>}{o.canAsk && <button onClick={()=>ask(`What should I know about ${o.name}?`,o.id)}>Ask about this program</button>}<a className="link" href={o.url} target="_blank" rel="noreferrer">{o.verified?'Official site':'Program page'}</a></div></div>))}</details>)}</div>
      {!!data.watchlist?.length&&<section className="sec" aria-label="Coming soon"><h2>Coming soon</h2><p className="note">These programs announced a future opening date. They are separate from your active picks.</p>{data.watchlist.map(o=><div className="card" key={o.id}><h3>{o.name}</h3><p>Applications open {o.openingDate}</p><p className="note">Check eligibility, fees and the opening date on the program page.</p><a className="link" href={o.url} target="_blank" rel="noreferrer">Program page</a></div>)}</section>}
      {data.sampleData && <p className="note">Sample data: a curated starter set, not verified for this year. Confirm dates and deadlines on each official site.</p>}
      </section>
      {cmp.length >= 2 && <div className="cmpbar"><button className="btn fill" onClick={() => setShowCmp(true)}>Compare {cmp.length}</button></div>}

      {growthReview&&<ReviewSheet source={{type:'application',id:growthReview}} onClose={()=>setGrowthReview(null)}/>}
      {dismiss && <Sheet title="Not for me" onClose={()=>setDismiss(null)}><p className="sub">What didn’t fit? This helps us choose next time.</p><div className="rows">{['not my interest','too much time','too far','cost','other'].map(reason=><button className="r" key={reason} onClick={async()=>{if(await status(dismiss.id,'dismissed',reason))setDismiss(null);}}>{reason}</button>)}</div></Sheet>}
      {open && <Sheet onClose={() => setOpen(null)}>
        <div style={{ textAlign: 'center', padding: '4px 0 14px' }}><p style={{ fontSize: 40 }}>{CEMO[open.category] || '✨'}</p><h2 className="serif" style={{ fontSize: 27, marginTop: 6 }}>{open.name}</h2><p className="muted small">{open.organizer}</p><p style={{ marginTop: 10 }}><span className={`fit ${open.fit.fit}`}>{FIT_LABEL[open.fit.fit!]}</span></p></div>
        <div className="card"><p className="label">WHY IT FITS</p><p className="lead" style={{ fontSize: 18, marginTop: 6 }}>{open.fit.why}</p></div>
        <div className="sec"><p className="label">HOW IT LINES UP</p><div className="card" style={{ padding: '4px 16px', marginTop: 6 }}>{open.fit.factors!.map(f => <div className="contrib" key={f.key}><b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><i className={`f-${f.state}`} style={{ width: 8, height: 8, borderRadius: 4, display: 'inline-block' }} />{f.key}</b><p className="muted small" style={{ marginTop: 4 }}>{f.text}</p></div>)}</div></div>
        <div className="sec"><p className="label">CHECK BEFORE YOU COMMIT</p><div className="rows" style={{ marginTop: 8 }}>{[...open.fit.eligibility.checks, `Deadline: ${open.deadline || 'unknown — confirm on the official site'}`].map(c => <div className="r" key={c}><span className="b"><span className="t small">{c}</span></span></div>)}
          <a className="r" href={open.url} target="_blank" rel="noreferrer"><span className="b"><span className="t" style={{ color: 'var(--peri)' }}>Official site</span><span className="s" style={{ display: 'block' }}>{open.url.replace(/^https?:\/\//, '')}</span></span></a></div></div>
        {!!open.sources?.length&&<details className="sec"><summary>What the program page says</summary>{open.sources.map(source=><blockquote key={source.field}><p>{source.quote}</p><a href={source.url} target="_blank" rel="noreferrer">Source for {source.field.replace(/[A-Z]/g,c=>' '+c.toLowerCase())}</a></blockquote>)}</details>}
        <div className="sec"><p className="label">ONE NEXT STEP</p><div className="acts"><button className="btn fill lg" onClick={() => prep(open.id)}>Set a prep reminder</button></div>
          <div className="acts" style={{ marginTop: 8 }}>{me.aiConsent && <button className="btn" style={{ flex: 1 }} onClick={() => ask(`I’m interested in ${open.name} (opportunityId ${open.id}). Check my eligibility, readiness and free time, explain what to verify, then propose a plan.`)}>Plan with Buddy</button>}</div></div>
      </Sheet>}
      {showCmp && <Sheet title="Compare" onClose={() => setShowCmp(false)}><div className="cmp"><table><thead><tr><td />{compared.map(o => <td key={o.id}>{o.name}</td>)}</tr></thead><tbody>
        {([['Fit', (o: Opportunity) => FIT_LABEL[o.fit.fit!]], ['Format', (o: Opportunity) => o.format], ['Cost', (o: Opportunity) => o.cost], ['Time', (o: Opportunity) => o.commitment], ['To check', (o: Opportunity) => o.fit.eligibility.checks.join('; ') || '—']] as const).map(([l, f]) => <tr key={l}><th>{l}</th>{compared.map(o => <td key={o.id}>{f(o)}</td>)}</tr>)}</tbody></table></div></Sheet>}
      {review && <ProposalReview initial={review} onClose={() => { setReview(null); reload(); }} onDone={reload} />}
    </>
  );
}
