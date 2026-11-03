import Week from '../components/Week';
import TimelineEvents from '../components/TimelineEvents';
import Calendars from '../components/Calendars';
import AddEvent from '../components/AddEvent';
import { useEffect,useState } from 'react';
import { api } from '../lib/api';
import { Proposal, Student, Tab, Today as TodayData, NewsResponse } from '../lib/types';
import { fmtMins } from '../lib/format';
import { Ring, Sheet, Typing, toast, useLoad } from '../components/ui';
import ProposalReview from '../components/ProposalReview';
import ScanSheet from './ScanSheet';
import NewsSheet, { explainAsk, storyWhen } from '../components/NewsSheet';
import { NEWS_EMOJI, partOfDay } from '../lib/theme';

const COLORS = { focus:'var(--peri)', freeTime:'var(--teal)', progress:'var(--peach)' } as const;
const CLS = { focus:'c-peri', freeTime:'c-teal', progress:'c-peach' } as const;
type Surface = null | {k:'ring';v:keyof TodayData['metrics']} | {k:'why'} | {k:'review';p:Proposal} | {k:'add';date:string} | {k:'scan'|'calendar'};

export default function Today({ me, go, ask, setMe }: { me:Student; go:(t:Tab)=>void; ask:(t:string)=>void; setMe:(s:Student)=>void }) {
  const { data:d, error, reload } = useLoad(()=>api<TodayData>('/api/today'),[]);
  const news = useLoad(()=>api<NewsResponse>('/api/news'),[me.settings.newsTopics?.join(',')]);
  const [view,setView]=useState<'today'|'week'>('today'),[selectedDate,setSelectedDate]=useState<string|null>(null);
  const [newsOpen,setNewsOpen] = useState(false), [sheet,setSheet] = useState<Surface>(null);
  const [snoozed,setSnoozed] = useState(false), [actionError,setActionError] = useState<string|null>(null);
  useEffect(()=>{
    const refresh=()=>{if(typeof document==='undefined'||document.visibilityState!=='hidden')reload();};
    const timer=setInterval(refresh,60000);
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',refresh);
    if(typeof window!=='undefined')window.addEventListener('focus',refresh);
    return()=>{clearInterval(timer);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',refresh);if(typeof window!=='undefined')window.removeEventListener('focus',refresh);};
  },[reload]);
  if(!d) return error ? <p role="alert">{error} <button className="link" onClick={reload}>Try again</button></p> : <div className="splash"><Typing /></div>;
  const m=d.metrics, na=d.nextAction, top=news.data?.top;
  const part=d.greetingPart || partOfDay(), hello={morning:'Good morning',afternoon:'Good afternoon',evening:'Good evening',night:'Hello'}[part];
  const dateLabel=new Date(d.date+'T12:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  const ringVal=(k:keyof TodayData['metrics'])=>k==='progress' ? (m.progress.planned ? String(m.progress.done)+'/'+m.progress.planned : '—') : fmtMins(m[k].minutes);
  const close=()=>{setSheet(null);reload();};
  const openReview=async(id:string)=>{try{setSheet({k:'review',p:await api<Proposal>('/api/proposals/'+id)});}catch(e){setActionError((e as Error).message);}};
  const doIt=()=>{if(na?.ask && me.aiConsent)ask(na.ask);else if(na?.route)go('explore');else if(na?.opportunityId)go('explore');else go('buddy');};
  return <>
    <button className="orbfab" onClick={()=>go('buddy')} aria-label="Talk to Buddy"><span className="orb" aria-hidden="true" />Talk to Buddy</button>
    <header className={'today-header '+part}><h1>{hello}, {me.name.trim().split(/\s+/)[0]}</h1><time dateTime={d.date}>{dateLabel}</time></header>
    {actionError && <p className="note c-rose" role="alert">{actionError}</p>}

    <section className="sec today-glance" aria-labelledby="day-glance-title">
      <div className="sec-h"><h2 id="day-glance-title">Your day at a glance</h2><span className="tiny">Tap a ring</span></div>
      <div className="card glance"><div className="rings">{(['focus','freeTime','progress'] as const).map(k=>
        <button key={k} className="ringbtn" onClick={()=>setSheet({k:'ring',v:k})} aria-label={m[k].label+': '+ringVal(k)+', '+m[k].status}>
          <Ring pct={m[k].pct} color={COLORS[k]} size={84}>{ringVal(k)}</Ring><span className="n">{m[k].label}</span><span className={'st '+CLS[k]}>{m[k].status}</span>
        </button>)}</div>
        <div className="sec" style={{marginTop:14,padding:'0 8px 8px'}}>
          <p className="small"><b>Protected downtime left</b> · {fmtMins(m.freeTime.downtime??0)}</p>
          <p className="note">Reserved for rest, separate from free time. Estimates use your calendar and availability settings.</p>
          {!!m.freeTime.downtimeBusy&&<p className="note c-rose">{fmtMins(m.freeTime.downtimeBusy)} of your remaining downtime overlaps calendar events.</p>}
        </div></div>
      <div className="sec-h timeline-heading"><h3>{view==='today'?'Today’s timeline':'Your weekly agenda'}</h3><button className="link" onClick={()=>setSheet({k:'scan'})}>Scan schedule</button></div>
      <div className="timeline-switch" role="group" aria-label="Timeline view">
        <button className={'chipbtn'+(view==='today'?' active':'')} aria-pressed={view==='today'} onClick={()=>setView('today')}>Today</button>
        <button className={'chipbtn'+(view==='week'?' active':'')} aria-pressed={view==='week'} onClick={()=>{setSelectedDate(null);setView('week');}}>Week</button>
      </div>
      <div className="card timeline-card">
        {view==='week'?<Week today={d.date} selectedDate={selectedDate} onSelectDate={setSelectedDate} onChanged={reload} refreshToken={d}/>
          :d.timeline.length?<TimelineEvents events={d.timeline} onChanged={reload}/>:<p className="muted">Your day is open. Add a class or deadline, or link your calendar.</p>}
        <div className="acts today-actions"><button className="btn fill" disabled={view==='week'&&!selectedDate} onClick={()=>setSheet({k:'add',date:view==='week'?selectedDate!:d.date})}>Add event</button><button className="btn" onClick={()=>setSheet({k:'calendar'})}>Link calendar</button></div>
      </div>
      {(!!d.dueSoon?.length || !!d.dueSoonEvents?.length) && <div className="card due-soon">
        <h3>Due soon</h3>
        {d.dueSoonEvents?.map(e=><p key={e.id+e.date}><b>{e.title}</b> · {e.countdown.label}</p>)}
        {d.dueSoon?.map(a=><p key={a.opportunityId}><b>{a.name}</b> · {a.countdown?.label}<br /><span className="tiny">{a.deadlineSource}</span></p>)}
        {!!d.dueSoon?.length && <button className="link" onClick={()=>go('explore')}>Review my applications</button>}
      </div>}
    </section>

    <section className="sec" aria-labelledby="next-step-title"><div className="sec-h"><h2 id="next-step-title">Next best step</h2></div>
      {d.pending.length ? <div className="card next"><div className="k"><i style={{background:'var(--peach)'}} /><span className="label">WAITING FOR YOUR OK</span></div><h3>{d.pending[0].summary}</h3><p className="muted">{d.pending[0].count} changes ready. Nothing happens until you approve.</p><div className="acts"><button className="btn fill" onClick={()=>openReview(d.pending[0].id)}>Review</button></div></div>
        : snoozed ? <div className="card next"><p className="muted">Set aside for now. <button className="link" onClick={()=>setSnoozed(false)}>Show the step</button></p></div>
        : na ? <div className="card next"><h3>{na.title}</h3><p className="muted">{na.why}</p><div className="acts"><button className="btn fill" onClick={doIt}>Do it</button><button className="btn" onClick={()=>{setSnoozed(true);toast('Set aside for now');}}>Later</button><button className="btn" onClick={()=>setSheet({k:'why'})}>Why this?</button></div></div>
        : <div className="card next"><h3>Explore opportunities that fit you</h3><p className="muted">Find an active program around your interests when you’re ready.</p><div className="acts"><button className="btn fill" onClick={()=>go('explore')}>Explore opportunities</button></div></div>}
    </section>

    {(me.settings.showWord || me.settings.showNews) && <section className="sec" aria-labelledby="spark-title"><div className="sec-h"><h2 id="spark-title">Today's spark</h2></div><div className="sparks">
      {me.settings.showWord && <div className="card spark"><div className="k"><p className="label">WORD OF THE DAY</p>{typeof window!=='undefined' && 'speechSynthesis' in window && <button className="chipbtn" onClick={()=>speechSynthesis.speak(new SpeechSynthesisUtterance(d.word.word))}>Hear it</button>}</div><h3 style={{fontSize:28,fontWeight:300}}>{d.word.word}</h3><p className="muted small">{d.word.pos} · {d.word.meaning}</p><p className="small"><i>{d.word.example}</i></p></div>}
      {me.settings.showNews && (top ? <div className="card spark"><div className="k"><p className="label">{news.data?.personal?'NEWS FOR YOU':'TODAY’S HEADLINE'}</p><span className="tag">{NEWS_EMOJI[top.topic]} {top.topic}</span></div><button onClick={()=>setNewsOpen(true)} style={{textAlign:'left'}}><h3>{top.headline}</h3></button>{top.summary && <p className="muted small">{top.summary}</p>}<p className="src">{top.source} · {storyWhen(top.publishedAt)}</p><div className="row"><button className="chipbtn" onClick={()=>setNewsOpen(true)}>More for you</button><a className="chipbtn" href={top.url} target="_blank" rel="noreferrer">Read ↗</a>{me.aiConsent && <button className="chipbtn" onClick={()=>ask(explainAsk(top))}>Explain it simply</button>}</div></div>
        : <div className="card spark"><p className="label">NEWS FOR YOU</p><p className="muted small">{news.error?'News is not available right now.':!news.data?'Loading stories…':'No stories for your topics yet.'}</p><button className="link" onClick={()=>setNewsOpen(true)}>Choose news topics</button></div>)}
    </div></section>}

    {sheet?.k==='ring' && <Sheet title={m[sheet.v].label} onClose={()=>setSheet(null)}><div style={{textAlign:'center'}}><Ring pct={m[sheet.v].pct} color={COLORS[sheet.v]} size={150} width={9}>{ringVal(sheet.v)}</Ring><p className={CLS[sheet.v]}>{m[sheet.v].status}</p></div><p className="muted small">{sheet.v==='focus'?'Scheduled Study blocks for today compared with your daily limit. Marking an event done does not change planned time.':sheet.v==='freeTime'?'Unbooked minutes still ahead in your study window, based on your calendar. Protected downtime is reserved for rest and shown separately.':'Goal steps planned this week and how many you’ve finished.'}</p><div className="sec"><p className="label">CONTRIBUTORS</p><div className="card">
      {sheet.v==='focus' && <Contrib l="Study planned today" v={fmtMins(m.focus.minutes)+' of '+fmtMins(m.focus.limit)} pct={m.focus.pct} c={COLORS.focus} />}
      {sheet.v==='freeTime' && <><Contrib l="Free time left in your study window" v={fmtMins(m.freeTime.inWindow)} pct={m.freeTime.pct} c={COLORS.freeTime} /><Contrib l="Protected downtime left — separate" v={fmtMins(m.freeTime.downtime)} pct={m.freeTime.downtimeRemaining?((m.freeTime.downtime??0)/m.freeTime.downtimeRemaining):0} c={COLORS.freeTime} />{!!m.freeTime.downtimeBusy&&<p className="note c-rose">{fmtMins(m.freeTime.downtimeBusy)} overlaps calendar events during your remaining downtime.</p>}</>}
      {sheet.v==='progress' && <><Contrib l="Steps done this week" v={String(m.progress.done)} pct={m.progress.pct} c={COLORS.progress} /><Contrib l="Steps planned this week" v={String(m.progress.planned)} pct={1} c="var(--line2)" /></>}
    </div></div></Sheet>}
    {sheet?.k==='why' && na && <Sheet title="Why this step" onClose={()=>setSheet(null)}><h2>{na.title}</h2><p className="muted">{na.why}</p><div className="sec"><p className="label">WHERE THIS CAME FROM</p><p>{na.source}</p><p className="label">WHAT I LOOKED AT</p><p className="muted">{na.dataUsed.join(' · ')}</p></div></Sheet>}
    {sheet?.k==='review' && <ProposalReview initial={sheet.p} onClose={close} onDone={reload} />}
    {sheet?.k==='add' && <AddEvent today={sheet.date} onClose={close} />}
    {sheet?.k==='scan' && <ScanSheet aiConsent={me.aiConsent} onClose={close} />}
    {sheet?.k==='calendar' && <Sheet title="Link calendar" onClose={close}><Calendars /></Sheet>}
    {newsOpen && <NewsSheet me={me} setMe={setMe} onClose={()=>setNewsOpen(false)} ask={ask} />}
  </>;
}
const Contrib=({l,v,pct,c}:{l:string;v:string;pct:number;c:string})=><div className="contrib"><div className="h"><b>{l}</b><span className="muted">{v}</span></div><div className="cbar"><i style={{width:String(Math.round(Math.min(1,Math.max(0,pct))*100))+'%',background:c}} /></div></div>;
