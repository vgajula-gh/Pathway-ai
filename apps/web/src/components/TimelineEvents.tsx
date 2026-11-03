import {useState} from 'react';
import {api} from '../lib/api';
import type {TimelineItem} from '../lib/types';
import {EMO,SOURCE_TAG,fmtTime} from '../lib/format';

/** Both views share completion eligibility, source labels and conflict warnings. */
export default function TimelineEvents({events,onChanged}:{events:TimelineItem[];onChanged:()=>void}) {
  const [pending,setPending]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
  const toggle=async(o:TimelineItem)=>{
    setPending(o.id);setError(null);
    try {await api('/api/events/'+o.id,{method:'PATCH',body:{done:!o.done}});onChanged();}
    catch(e){setError((e as Error).message);}
    finally{setPending(null);}
  };
  return <>
    {error&&<p className="note c-rose" role="alert">{error}</p>}
    <div className="tl">{events.map(o=>{
      const flexible=!o.recurring&&!o.readOnly&&['study','reminder','personal'].includes(o.type);
      const source=o.source||'manual';
      return <div key={o.id+o.start} className={'tl-i '+(o.done?'done':'')}>
        <span className="tm">{o.end>o.start?fmtTime(o.start):'Due'}</span><span className="dot" style={{background:o.clash?'var(--rose)':'var(--peri)'}} aria-hidden="true" />
        <div className="tl-detail"><div className="tt">{EMO[o.type]} {o.title}</div><div className="tg">{o.clash&&<span className="c-rose">Overlaps another event · </span>}{SOURCE_TAG[source]||(source.startsWith('From ')?source:'You added')}{o.readOnly?' · read-only':''}</div></div>
        {flexible?<button className={'chk '+(o.done?'on':'')} disabled={pending!==null} onClick={()=>void toggle(o)} aria-pressed={o.done} aria-label={(o.done?'Mark not done: ':'Mark done: ')+o.title}>{pending===o.id?'…':o.done?'✓':''}</button>:<span />}
      </div>;
    })}</div>
  </>;
}
