import {useState} from 'react';
import {api} from '../lib/api';
import type {NewsResponse} from '../lib/types';
type Refreshed=NewsResponse&{refresh:{status:'refreshed'|'partial'|'cached'|'unavailable'}};
export default function NewsRefresh({onRefreshed}:{onRefreshed:(data:NewsResponse)=>void}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
  const refresh=async()=>{
    setBusy(true);setMessage('');setError(false);
    try {
      const data=await api<Refreshed>('/api/news/refresh',{method:'POST'});onRefreshed(data);
      setMessage({refreshed:'Latest available stories loaded from publisher feeds.',partial:'Some publisher feeds could not refresh. Available stories are shown.',cached:'These feeds were checked recently. Showing available stories.',unavailable:'Publisher feeds could not refresh. Previously loaded stories are kept.'}[data.refresh.status]);
    } catch {setError(true);setMessage('Could not refresh news. Your existing stories are kept. Please try again.');}
    finally{setBusy(false);}
  };
  return <div><button className="chipbtn" disabled={busy} onClick={()=>void refresh()}>{busy?'Refreshing news…':'Refresh news'}</button>{message&&<p className={'note'+(error?' c-rose':'')} role={error?'alert':'status'}>{message}</p>}</div>;
}
