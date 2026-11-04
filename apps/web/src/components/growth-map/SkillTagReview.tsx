import {useEffect,useState} from 'react';
import {api} from '../../lib/api';
import {Typing} from '../ui';
import type {Activity,Catalog,SourceType,Stage} from './types';
export default function SkillTagReview({type,id,onSaved,linkedMilestoneId}:{type:SourceType;id:string;onSaved:()=>void;linkedMilestoneId?:string}) {
  const [source,setSource]=useState<Activity|null>(null),[catalog,setCatalog]=useState<Catalog|null>(null),[tags,setTags]=useState<{skillId:string;stage:Stage|null}[]>([]);
  const [date,setDate]=useState(''),[search,setSearch]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0),[link,setLink]=useState(!!linkedMilestoneId);
  useEffect(()=>{let active=true;setError('');setSource(null);Promise.all([api<Activity>(`/api/growth-map/activities/${type}/${id}`),api<Catalog>('/api/growth-map/catalog')]).then(([s,c])=>{if(!Array.isArray(s.tags)||!Array.isArray(s.suggestions)||!Array.isArray(c.skills))throw new Error('Skill suggestions could not load. Your saved activity is safe.');if(active){setSource(s);setCatalog(c);setTags(s.tags.map(t=>({...t,stage:s.allowedStages.length?(t.stage&&s.allowedStages.includes(t.stage)?t.stage:s.defaultStage):null})));setDate(s.date??'');setLink(!!(linkedMilestoneId||s.linkedMilestoneId));}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[type,id,attempt]);
  const save=async()=>{setBusy(true);setError('');try{await api(`/api/growth-map/activities/${type}/${id}`,{body:{tags,...(source?.type==='application'&&source.eligible?{occurredOn:date}:{}),...(source?.type==='portfolio'?{linkedMilestoneId:link?(linkedMilestoneId||source.linkedMilestoneId||null):null}:{})}});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const toggle=(skillId:string)=>setTags(t=>t.some(x=>x.skillId===skillId)?t.filter(x=>x.skillId!==skillId):t.length<10?[...t,{skillId,stage:source!.defaultStage}]:t);
  return <section className="growth-tags" aria-label="Review skill tags">
    {error&&<p className="note c-rose" role="alert">{error} {!source&&<button className="link" onClick={()=>setAttempt(n=>n+1)}>Try again</button>}</p>}
    {!source||!catalog?!error&&<p role="status">Loading your activity… <Typing/></p>:<>
      <h3>{source.title}</h3><p className="muted small">{source.kind}{source.date?' · '+source.date:''}</p><p className="note">{source.note}</p>
      {!!source.reflection&&<blockquote>{source.reflection}</blockquote>}
      {source.original&&<dl className="growth-source-facts">{Object.entries(source.original).filter(([key,value])=>['start','end','goalTitle','purpose','status','notes','deadline'].includes(key)&&typeof value==='string'&&!!value).map(([key,value])=><div key={key}><dt>{key.replace(/([A-Z])/g,' $1')}</dt><dd>{String(value)}</dd></div>)}</dl>}
      {source.type==='application'&&source.eligible&&<><label htmlFor="growth-activity-date">When did you apply or enter?</label><input id="growth-activity-date" className="field" type="date" value={date} onChange={e=>setDate(e.target.value)}/></>}
      {!source.eligible&&source.allowedStages.length>0&&<p className="note">This activity is future-dated or has not ended. Check its date or return after it is complete.</p>}
      <p className="label">SUGGESTED SKILLS · TAP TO CONFIRM</p>
      {source.suggestions.length?<div className="chips">{source.suggestions.map(id=>{const s=catalog.skills.find(s=>s.id===id)!;return <button key={id} className="chip" aria-pressed={tags.some(t=>t.skillId===id)} onClick={()=>toggle(id)}>{s.name}</button>;})}</div>:<p className="note">No automatic match. You can choose a catalog skill below.</p>}
      <label htmlFor="growth-skill-search">Find a catalog skill</label><input id="growth-skill-search" className="field" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Try Coding, Python or Teamwork"/>
      {search.trim()&&<div className="chips" aria-label="Catalog results">{catalog.skills.filter(s=>[s.name,...s.synonyms].some(n=>n.toLowerCase().includes(search.toLowerCase()))).slice(0,12).map(s=><button className="chip" key={s.id} aria-pressed={tags.some(t=>t.skillId===s.id)} onClick={()=>toggle(s.id)}>{s.name}</button>)}</div>}
      <p className="note">Only selected skills are confirmed. Up to 10 tags per activity. These are your own reported experiences, not ability ratings.</p>
      {tags.map(t=><div className="growth-tag-row" key={t.skillId}><b>{catalog.skills.find(s=>s.id===t.skillId)?.name}</b>{source.allowedStages.length>0?<label>Experience stage<select aria-label={'Stage for '+catalog.skills.find(s=>s.id===t.skillId)?.name} value={t.stage??source.defaultStage??'Learn'} onChange={e=>setTags(tags=>tags.map(x=>x.skillId===t.skillId?{...x,stage:e.target.value as Stage}:x))}>{source.allowedStages.map(stage=><option key={stage}>{stage}</option>)}</select></label>:<span>Interest only</span>}<button className="link c-rose" aria-label={'Remove tag '+catalog.skills.find(s=>s.id===t.skillId)?.name} onClick={()=>toggle(t.skillId)}>Remove</button></div>)}
      {!!(linkedMilestoneId||source.linkedMilestoneId)&&<label className="frow"><span>This capture describes the same completed goal step. Count the activity once.</span><input type="checkbox" checked={link} onChange={e=>setLink(e.target.checked)}/></label>}
      <button className="btn fill lg" disabled={busy||tags.length>0&&!source.eligible&&source.allowedStages.length>0||source.type==='application'&&source.eligible&&tags.length>0&&!date} onClick={()=>void save()}>{busy?'Saving…':tags.length?'Confirm selected skills':'Reviewed — no skills to add'}</button>
    </>}
  </section>;
}
