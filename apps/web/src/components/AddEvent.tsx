import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Sheet } from './ui';

export default function AddEvent({ today, onClose }: { today:string; onClose:()=>void }) {
  const [title,setTitle] = useState(''), [type,setType] = useState('class');
  const [start,setStart] = useState(today + 'T16:00'), [end,setEnd] = useState(today + 'T16:30');
  const [busy,setBusy] = useState(false), [error,setError] = useState<string|null>(null), [conflict,setConflict] = useState(false);
  return <Sheet title="Add event" onClose={onClose}>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await api('/api/events', { body:{title,type,start,end:type==='deadline'?start:end,force:conflict} }); onClose(); }
      catch(e) { setError((e as Error).message); setConflict(e instanceof ApiError && e.status===409); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="event-title">Title</label><input id="event-title" className="field" maxLength={120} required value={title} onChange={e=>{setTitle(e.target.value);setConflict(false);}} />
      <label htmlFor="event-type">Type</label><select id="event-type" className="field" value={type} onChange={e=>{setType(e.target.value);setConflict(false);}}>
        {['class','exam','deadline','club','sports','study','personal','reminder','other'].map(value=><option key={value} value={value}>{value}</option>)}
      </select>
      <label htmlFor="event-start">{type==='deadline'?'Due':'Starts'}</label><input id="event-start" className="field" type="datetime-local" required value={start} onChange={e=>{setStart(e.target.value);setConflict(false);}} />
      {type!=='deadline' && <><label htmlFor="event-end">Ends</label><input id="event-end" className="field" type="datetime-local" required min={start} value={end} onChange={e=>{setEnd(e.target.value);setConflict(false);}} /></>}
      {error && <p className="note c-rose" role="alert">{error}</p>}
      <button className="btn fill lg" type="submit" disabled={busy}>{busy?'Saving…':conflict?'Save despite this conflict':'Add event'}</button>
    </form>
  </Sheet>;
}
