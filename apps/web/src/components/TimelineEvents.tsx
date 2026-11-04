import ReviewSheet from './growth-map/ReviewSheet';
import {useState} from 'react';
import {api} from '../lib/api';
import type {TimelineItem} from '../lib/types';
import {EMO,SOURCE_TAG,fmtTime} from '../lib/format';

/** Both views share completion eligibility, source labels and conflict warnings. */
export default function TimelineEvents({events,onChanged}:{events:TimelineItem[];onChanged:()=>void}) {
  const [reviewStudy,setReviewStudy]=useState<string|null>(null);
  const [pending,setPending]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
  const toggle=async(o:TimelineItem)=>{
    setPending(o.id);setError(null);
    try {await api('/api/events/'+o.id,{method:'PATCH',body:{done:!o.done}});onChanged();if(o.type==='study'&&!o.done)setReviewStudy(o.id);}
    catch(e){setError((e as Error).message);}
    finally{setPending(null);}
  };
  const remove=async(o:TimelineItem)=>{
    const message=o.recurring?`Delete the entire recurring series “${o.title}”? All its occurrences will be removed from Pathway.`:`Delete “${o.title}” from Pathway?`;
    if(!confirm(message))return;
    setPending(o.id);setError(null);
    try {await api('/api/events/'+o.id,{method:'DELETE'});onChanged();}
    catch(e){setError((e as Error).message);}
    finally{setPending(null);}
  };
  return <>
    {reviewStudy&&<ReviewSheet source={{type:'study',id:reviewStudy}} onClose={()=>setReviewStudy(null)}/>}
    {error&&<p className="note c-rose" role="alert">{error}</p>}
    <div className="tl">{events.map(o=>{
      const flexible=!o.recurring&&!o.readOnly&&['study','reminder','personal'].includes(o.type);
      const source=o.source||'manual';
      return <div key={o.id+o.start} className={'tl-i '+(o.done?'done':'')}>
        <span className="tm">{o.end>o.start?fmtTime(o.start):'Due'}</span><span className="dot" style={{background:o.clash?'var(--rose)':'var(--peri)'}} aria-hidden="true" />
        <div className="tl-detail"><div className="tt">{EMO[o.type]} {o.title}</div><div className="tg">{o.clash&&<span className="c-rose">Overlaps another event · </span>}{SOURCE_TAG[source]||(source.startsWith('From ')?source:'You added')}{o.readOnly?' · read-only':''}</div></div>
        <div className="timeline-event-actions">
          {flexible&&<button className={'chk '+(o.done?'on':'')} disabled={pending!==null} onClick={()=>void toggle(o)} aria-pressed={o.done} aria-label={(o.done?'Mark not done: ':'Mark done: ')+o.title}>{pending===o.id?'…':o.done?'✓':''}</button>}
          {!o.readOnly&&<button className="event-delete" disabled={pending!==null} onClick={()=>void remove(o)} aria-label={'Delete event: '+o.title} title={o.recurring?'Delete entire series':'Delete event'}><span aria-hidden="true">−</span></button>}
        </div>
      </div>;
    })}</div>
  </>;
}
