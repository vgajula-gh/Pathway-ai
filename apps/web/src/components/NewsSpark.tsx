import {useState} from 'react';
import {api} from '../lib/api';
import type {NewsResponse,Student} from '../lib/types';
import {useLoad} from './ui';
import {NEWS_EMOJI} from '../lib/theme';
import NewsSheet,{explainAsk,storyWhen} from './NewsSheet';
import NewsRefresh from './NewsRefresh';

export default function NewsSpark({me,setMe,ask}:{me:Student;setMe:(s:Student)=>void;ask:(s:string)=>void}) {
  const {data,error,setData,reload}=useLoad(()=>api<NewsResponse>('/api/news'),[me.settings.newsTopics?.join(',')]);
  const [selected,setSelected]=useState<string|null>(null),[open,setOpen]=useState(false);
  const stories=data?.stories.length?data.stories:data?.top?[data.top]:[],top=stories.find(s=>s.id===selected)??stories[0];
  return <>
    <div className="card spark">
      <div className="k"><p className="label">{data?.personal?'NEWS FOR YOU':'TODAY’S HEADLINE'}</p>{top&&<span className="tag">{NEWS_EMOJI[top.topic]} {top.topic}</span>}</div>
      {error&&<p className="note c-rose" role="alert">News is not available right now. <button className="link" onClick={reload}>Try again</button></p>}
      {top?<><button onClick={()=>setOpen(true)} style={{textAlign:'left'}}><h3 aria-live="polite">{top.headline}</h3></button>{top.summary&&<p className="muted small">{top.summary}</p>}<p className="src">{top.source} · {storyWhen(top.publishedAt)}</p>
        <div className="row">{stories.length>1&&<button className="chipbtn" onClick={()=>setSelected(stories[(stories.findIndex(s=>s.id===top.id)+1)%stories.length].id)}>Next story</button>}<button className="chipbtn" onClick={()=>setOpen(true)}>More for you</button><a className="chipbtn" href={top.url} target="_blank" rel="noreferrer">Read ↗</a>{me.aiConsent&&<button className="chipbtn" onClick={()=>ask(explainAsk(top))}>Explain it simply</button>}</div></>
        :<><p className="muted small">{!data&&!error?'Loading stories…':'No stories for your topics yet. Refresh news to check publisher feeds.'}</p><button className="link" onClick={()=>setOpen(true)}>Choose news topics</button></>}
      <NewsRefresh onRefreshed={next=>{setSelected(null);setData(next);}}/>
    </div>
    {open&&<NewsSheet me={me} setMe={setMe} ask={ask} onClose={()=>{setOpen(false);reload();}}/>}
  </>;
}
