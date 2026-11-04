import {useEffect,useRef,useState} from 'react';
import {api} from '../../lib/api';
import type {Proposal} from '../../lib/types';
import {Typing,useLoad} from '../ui';
import ProposalReview from '../ProposalReview';
import type {SourceType,Stage} from './types';

interface Insight {id:string;type:string;text:string;skillIds:string[];action:'evidence'|'goal'|'explore';basedOn:{type:SourceType;id:string;title:string;date:string}[]}
interface InsightData {cards:Insight[];generatedAt:string|null;status:string;message:string;automaticDue:boolean;canRefresh:boolean;manualAvailableOn:string|null;retryAt?:string|null}
const labels:Record<string,string>={growing:'Growing fastest',strength:'A theme that keeps showing up',connection:'A connection',next:'Your next rung'};
export default function GrowthInsights({onSource,onSkill}:{onSource:(s:{type:SourceType;id:string})=>void;onSkill:(id:string)=>void}) {
  const {data:response,error,reload,setData}=useLoad(()=>api<InsightData>('/api/growth-map/insights'),[]),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[proposal,setProposal]=useState<Proposal|null>(null);
  const data=response&&Array.isArray(response.cards)?response:null;
  const invalid=!!response&&!data;
  const automatic=useRef(false);
  const refresh=async(mode:'automatic'|'manual')=>{setBusy(true);setActionError('');try{setData(await api<InsightData>('/api/growth-map/insights/refresh',{body:{mode}}));}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}};
  useEffect(()=>{if(data?.automaticDue&&!automatic.current){automatic.current=true;void refresh('automatic');}},[data?.automaticDue]);
  useEffect(()=>{if(data?.status!=='refreshing'||busy)return;const timer=setTimeout(reload,2500);return()=>clearTimeout(timer);},[data?.status,busy,data]);
  useEffect(()=>{if(!data?.retryAt||busy)return;const remaining=+new Date(data.retryAt)-Date.now();if(remaining<=0)return;const timer=setTimeout(reload,Math.min(remaining+100,61000));return()=>clearTimeout(timer);},[data?.retryAt,busy,reload]);
  const goal=async(card:Insight)=>{setBusy(true);setActionError('');try{setProposal(await api<Proposal>(`/api/growth-map/skills/${card.skillIds[0]}/goal`,{body:{insightId:card.id}}));}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}};
  return <section className="sec growth-insights" aria-label="Growth insights"><div className="growth-section-title"><h2>What I’m noticing</h2><button className="btn" disabled={busy||!data?.canRefresh} onClick={()=>void refresh('manual')}>{busy?'Refreshing…':'Refresh insights'}</button></div>
    {(error||invalid)&&<p role="alert">Insights are unavailable. Your map still works. <button className="link" onClick={reload}>Try again</button></p>}
    {!data&&!error&&!invalid&&<p role="status"><Typing/> Loading insights…</p>}
    {actionError&&<p role="alert">{actionError}</p>}
    {data&&<><p className="note" role="status">{data.message}{data.manualAvailableOn==='tomorrow'?' You can manually refresh again tomorrow.':''}</p>{data.generatedAt&&<p className="note">Last generated {new Date(data.generatedAt).toLocaleString()}</p>}
      <div className="growth-insight-cards">{data.cards.map(card=><article className="card" key={card.id}><p className="label">{labels[card.type]??'Your growth'}</p><p>{card.text}</p><div className="sec"><p className="label">BASED ON</p>{card.basedOn.map(s=><button key={s.type+s.id} className="link growth-source-link" onClick={()=>onSource(s)}>{s.title} · {s.date}</button>)}</div>
        <div className="acts">{card.action==='goal'?<button className="btn fill" disabled={busy} onClick={()=>void goal(card)}>Make this a goal</button>:<button className="btn" onClick={()=>onSkill(card.skillIds[0])}>{card.action==='explore'?'Explore next steps':'See evidence'}</button>}
        <button className="link" disabled={busy} onClick={async()=>{setBusy(true);setActionError('');try{await api(`/api/growth-map/insights/${card.id}/dismiss`,{method:'POST'});setData(old=>old?{...old,cards:old.cards.filter(c=>c.id!==card.id)}:old);reload();}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}}}>Not me<span className="sr-only">: {labels[card.type]}</span></button></div></article>)}</div>
      {!data.cards.length&&data.status==='ready'&&<p className="note">No current insights to show. Confirm more experiences or choose your next step below.</p>}
    </>}
    {proposal&&<ProposalReview initial={proposal} onClose={()=>setProposal(null)}/>}
  </section>;
}
interface NextData {skillId:string;stage:Stage|null;title:string|null;message:string;opportunities:{id:string;name:string;url:string;cost:string;format:string;deadline:string|null;verified:boolean;reason:string}[]}
export function GrowthNextStep({id,onExplore}:{id:string;onExplore?:(id:string)=>void}) {
  const {data:response,error,reload}=useLoad(()=>api<NextData>(`/api/growth-map/skills/${id}/next`),[id]),[proposal,setProposal]=useState<Proposal|null>(null),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
  const data=response&&Array.isArray(response.opportunities)?response:null,invalid=!!response&&!data;
  return <section className="sec growth-next" aria-label="Next growth step"><h3>Your next rung</h3>{(error||invalid)&&<p role="alert">Next steps are unavailable. Your evidence is safe. <button className="link" onClick={reload}>Try again</button></p>}{!data&&!error&&!invalid&&<p role="status">Loading next steps…</p>}{actionError&&<p role="alert">{actionError}</p>}{data&&<><p className="note">{data.message}</p>{data.stage&&<><p><b>{data.stage}: {data.title}</b></p><button className="btn fill" disabled={busy} onClick={async()=>{setBusy(true);setActionError('');try{setProposal(await api<Proposal>(`/api/growth-map/skills/${id}/goal`,{method:'POST'}));}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}}}>Make this a goal</button>
      <div className="sec"><h3>Programs to consider</h3>{data.opportunities.length?data.opportunities.map(o=><article className="card growth-match" key={o.id}><b>{o.name}</b><p className="small muted">{o.cost} · {o.format}</p><p className="note">{o.verified?'Source checked':'Needs checking'} · {o.deadline?`Deadline ${o.deadline}`:'Deadline not confirmed'}</p><p className="note">{o.reason}</p>{onExplore?<button className="btn" onClick={()=>onExplore(o.id)}>View in Explore</button>:<a className="btn" href={o.url} target="_blank" rel="noreferrer">Program page</a>}</article>):<p className="note">No matching programs in the library yet. You can still try a small experience or search for more in Explore.</p>}</div></>}</>}{proposal&&<ProposalReview initial={proposal} onClose={()=>setProposal(null)}/>}</section>;
}
