import {useState} from 'react';
import {api} from '../lib/api';
import type {Today} from '../lib/types';

type Practice={date:string;word:Today['word'];position:number;total:number};
export default function WordSpark({dailyWord}:{dailyWord:Today['word']}) {
  const [practice,setPractice]=useState<Practice|null>(null),[offset,setOffset]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const word=practice?.word??dailyWord;
  const next=async()=>{
    setBusy(true);setError(null);
    try {const nextOffset=practice?(offset+1)%practice.total:1;const result=await api<Practice>('/api/words?offset='+nextOffset);setPractice(result);setOffset(nextOffset);}
    catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  };
  return <div className="card spark">
    <div className="k"><p className="label">{practice?'WORD PRACTICE':'WORD OF THE DAY'}</p>{typeof window!=='undefined'&&'speechSynthesis' in window&&<button className="chipbtn" onClick={()=>{speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(word.word));}}>Hear it</button>}</div>
    <div aria-live="polite"><h3 style={{fontSize:28,fontWeight:300}}>{word.word}</h3><p className="muted small">{word.pos} · {word.meaning}</p><p className="small"><i>{word.example}</i></p></div>
    {practice&&<p className="note">Practice word {practice.position} of {practice.total}. Words repeat after the full set.</p>}
    {error&&<p role="alert" className="note c-rose">{error}</p>}
    <div className="row"><button className="chipbtn" disabled={busy} onClick={()=>void next()}>{busy?'Loading word…':'Next word'}</button>{practice&&<button className="chipbtn" disabled={busy} onClick={()=>{setPractice(null);setOffset(0);setError(null);}}>Today’s word</button>}</div>
  </div>;
}
