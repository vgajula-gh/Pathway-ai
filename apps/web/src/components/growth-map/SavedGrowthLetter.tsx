import {useState} from 'react';
import {api} from '../../lib/api';
import type {PortfolioEntry} from '../../lib/types';
import {Sheet} from '../ui';
export default function SavedGrowthLetter({entry,onClose,onDeleted}:{entry:PortfolioEntry;onClose:()=>void;onDeleted:()=>void}) {
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <Sheet title="Saved growth reflection" onClose={onClose}><h2>{entry.title}</h2><p className="note">A saved snapshot of your monthly letter. It does not add skill evidence.</p><p className="growth-letter-story" style={{whiteSpace:'pre-wrap'}}>{entry.reflection}</p>{error&&<p role="alert">{error}</p>}{confirm?<div className="card sec"><p>Delete this portfolio copy? Your monthly letter stays in Growth Map.</p><div className="acts"><button className="btn" disabled={busy} onClick={()=>setConfirm(false)}>Keep reflection</button><button className="btn" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await api('/api/portfolio/'+entry.id,{method:'DELETE'});onDeleted();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Delete reflection</button></div></div>:<button className="btn" onClick={()=>setConfirm(true)}>Delete this copy</button>}</Sheet>;
}
