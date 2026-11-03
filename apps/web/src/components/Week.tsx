import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import type {WeekDay} from '../lib/types';
import {fmtDay} from '../lib/format';
import TimelineEvents from './TimelineEvents';

export default function Week({today,selectedDate,onSelectDate,onChanged,refreshToken}:{today:string;selectedDate:string|null;onSelectDate:(date:string|null)=>void;onChanged:()=>void;refreshToken:unknown}) {
  const [offset,setOffset]=useState(0),[retry,setRetry]=useState(0);
  const [result,setResult]=useState<{offset:number;today:string;days:WeekDay[]}|null>(null),[error,setError]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;setError(null);
    api<WeekDay[]>('/api/week?weekOffset='+offset).then(days=>{
      if(!active)return;
      setResult({offset,today,days});
    }).catch(e=>{if(active)setError((e as Error).message);});
    // Ignore responses from a previous week, refresh or unmounted view.
    return()=>{active=false;};
  },[offset,today,refreshToken,retry]);
  const days=result?.offset===offset&&result.today===today?result.days:null;
  useEffect(()=>{
    if(days?.length&&!days.some(d=>d.date===selectedDate))onSelectDate(days.some(d=>d.date===today)?today:days[0].date);
  },[days,today,selectedDate,onSelectDate]);
  const navigate=(next:number)=>{onSelectDate(null);setOffset(next);};
  return <div className="week-agenda">
    <nav className="week-nav" aria-label="Week navigation">
      <button className="chipbtn" aria-label="Previous week" disabled={offset<=-5200} onClick={()=>navigate(offset-1)}>← Previous</button>
      <button className="chipbtn" disabled={offset===0} onClick={()=>navigate(0)}>This week</button>
      <button className="chipbtn" aria-label="Next week" disabled={offset>=5200} onClick={()=>navigate(offset+1)}>Next →</button>
    </nav>
    <p className="small week-range" aria-live="polite">{days?.length?`${fmtDay(days[0].date)} – ${fmtDay(days[days.length-1].date)}, ${days[days.length-1].date.slice(0,4)}`:error?'Week unavailable':'Loading week…'}</p>
    {error&&<p className="note c-rose" role="alert">{error} <button className="link" onClick={()=>setRetry(r=>r+1)}>Try again</button></p>}
    {days&&<><p className="note">Choose a day for your next event. Your rings above still show today.</p>
      {days.map(day=><section key={day.date} className={'agenda-day'+(day.date===today?' is-today':'')} aria-label={fmtDay(day.date)}>
        <button className={'agenda-date'+(day.date===selectedDate?' selected':'')} aria-pressed={day.date===selectedDate} onClick={()=>onSelectDate(day.date)} aria-label={'Select '+day.date+' for a new event'}>
          <time dateTime={day.date}>{fmtDay(day.date)}</time>{day.date===today&&<span className="tag">Today</span>}{day.date===selectedDate&&<span className="tiny">Selected</span>}
        </button>
        {day.events.length?<TimelineEvents events={day.events} onChanged={onChanged}/>:<p className="muted small agenda-empty">Nothing scheduled.</p>}
      </section>)}
    </>}
  </div>;
}
