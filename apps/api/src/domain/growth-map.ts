import {createHash} from 'node:crypto';
import {addDays,dkey,fmtLocal,mondayOf,parseLocal,sod} from './time.js';
import {SKILL_CATALOG} from '../growth-map/catalog.js';
export const STAGES=['Learn','Build','Apply','Present','Compete'] as const;
export type Stage=typeof STAGES[number];
export const STAGE_DESCRIPTION:Record<Stage,string>={Learn:'Explore a topic or practice a skill.',Build:'Make a project, prototype or design.',Apply:'Use it for a real need or submit an application.',Present:'Share your work with an audience.',Compete:'Take part in a competition or challenge.'};
export type SourceType='portfolio'|'milestone'|'study'|'application';
export interface GrowthSource {key:string;type:SourceType;id:string;title:string;date:string|null;kind:string;defaultStage:Stage|null;allowedStages:Stage[];eligible:boolean;note:string;text:string;reflection?:string;linkedMilestoneId?:string;revision?:string;}
export interface Tag {id:string;skillId:string;sourceType:string;sourceId:string;stage:string|null}
export interface Review {sourceType:string;sourceId:string;occurredOn:string|null;linkedMilestoneId:string|null;sourceState?:string}
export interface Evidence {id:string;skillId:string;key:string;title:string;date:string;stage:Stage;sources:{type:SourceType;id:string;title:string;date:string;stage:Stage}[]}
export const sourceStateOf=(s:GrowthSource)=>createHash('sha256').update(JSON.stringify([s.key,s.title,s.kind,s.date,s.defaultStage,s.eligible,s.revision??''])).digest('hex');
export const sourceKey=(type:string,id:string)=>`${type}:${id}`;
export const validDate=(s:string)=>!!/^\d{4}-\d{2}-\d{2}$/.test(s)&&!!parseLocal(s)&&dkey(parseLocal(s)!)===s;
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9+#]+/g,' ').trim();
export function suggestSkills(text:string) {
  const hay=' '+normalize(text)+' ';
  return SKILL_CATALOG.map(s=>({...s,weight:[s.name,...s.synonyms].filter(x=>hay.includes(' '+normalize(x)+' ')).reduce((n,x)=>n+normalize(x).length,0)}))
    .filter(s=>s.weight>0).sort((a,b)=>b.weight-a.weight||a.id.localeCompare(b.id)).slice(0,3).map(s=>s.id);
}
/** Live sources are authoritative: deleted/reopened/future activity never lingers as evidence. */
export function evidenceFor(tags:Tag[],sources:GrowthSource[],reviews:Review[],now:Date):Evidence[] {
  const live=new Map(sources.map(s=>[s.key,s])),review=new Map(reviews.map(r=>[sourceKey(r.sourceType,r.sourceId),r])),groups=new Map<string,Evidence>();
  for(const tag of tags){
    const s=live.get(sourceKey(tag.sourceType,tag.sourceId)),r=s&&review.get(s.key);
    if(!s?.eligible||!r||r.sourceState!==sourceStateOf(s)||!tag.stage||!s.allowedStages.includes(tag.stage as Stage))continue;
    const date=s.date??r?.occurredOn;
    if(!date||!validDate(date)||date>dkey(now))continue;
    const linked=r?.linkedMilestoneId&&s.type==='portfolio'?live.get(sourceKey('milestone',r.linkedMilestoneId)):null;
    const key=s.type==='study'?'study-week:'+dkey(mondayOf(parseLocal(date)!)):linked?.eligible?linked.key:s.key;
    const groupKey=tag.skillId+'|'+key,existing=groups.get(groupKey),source={type:s.type,id:s.id,title:s.title,date,stage:tag.stage as Stage};
    if(existing){
      existing.sources.push(source);
      if(STAGES.indexOf(tag.stage as Stage)>STAGES.indexOf(existing.stage))existing.stage=tag.stage as Stage;
      if(date>existing.date)existing.date=date;
      if(s.type==='study')existing.title=`Study practice · ${existing.sources.length} completed blocks this week`;
    } else groups.set(groupKey,{id:tag.id,skillId:tag.skillId,key,title:s.type==='study'?'Study practice · 1 completed block this week':s.title,date,stage:tag.stage as Stage,sources:[source]});
  }
  return [...groups.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}
export function skillSignals(evidence:Evidence[],now:Date) {
  const month=dkey(now).slice(0,7),previous=(n:number)=>dkey(new Date(now.getFullYear(),now.getMonth()-n,1)).slice(0,7);
  const thisMonth=evidence.filter(e=>e.date.startsWith(month)).length,prev1=evidence.filter(e=>e.date.startsWith(previous(1))).length,prev2=evidence.filter(e=>e.date.startsWith(previous(2))).length;
  const reached=STAGES.filter(stage=>evidence.some(e=>e.sources.some(s=>s.stage===stage))),highest=reached.at(-1)??null,next=highest?STAGES[STAGES.indexOf(highest)+1]??null:'Learn';
  return {count:evidence.length,recent:evidence.filter(e=>e.date>=dkey(addDays(sod(now),-29))).length,lastActivity:evidence[0]?.date??null,reached,highest,next,thisMonth,previousAverage:(prev1+prev2)/2,growing:thisMonth>=3&&(prev1+prev2)>0&&thisMonth>(prev1+prev2)/2};
}
export function connectionsFor(tags:Tag[],sources:GrowthSource[],visible:Set<string>,reviews:Review[]=[]) {
  const live=new Set(sources.filter(s=>s.eligible&&reviews.some(r=>r.sourceType===s.type&&r.sourceId===s.id&&r.sourceState===sourceStateOf(s))).map(s=>s.key)),byItem=new Map<string,Set<string>>(),pairs=new Map<string,{a:string;b:string;count:number}>();
  for(const tag of tags){let key=sourceKey(tag.sourceType,tag.sourceId);if(!visible.has(tag.skillId)||!tag.stage||!live.has(key))continue;const review=reviews.find(r=>r.sourceType===tag.sourceType&&r.sourceId===tag.sourceId);if(tag.sourceType==='portfolio'&&review?.linkedMilestoneId&&live.has(sourceKey('milestone',review.linkedMilestoneId)))key=sourceKey('milestone',review.linkedMilestoneId);const set=byItem.get(key)??new Set<string>();set.add(tag.skillId);byItem.set(key,set);}
  for(const skills of byItem.values()){const ids=[...skills].sort();for(let i=0;i<ids.length;i++)for(let k=i+1;k<ids.length;k++){const key=ids[i]+'|'+ids[k],pair=pairs.get(key)??{a:ids[i],b:ids[k],count:0};pair.count++;pairs.set(key,pair);}}
  return [...pairs.values()];
}

/** Source qualification and default stages belong to deterministic domain code. */
export const pastActivityDate=(date:string,now:Date)=>validDate(date)&&date<=dkey(now);
export const endedStudy=(end:string,now:Date)=>pastActivityDate(end.slice(0,10),now)&&end<=fmtLocal(now);
export function portfolioStage(kind:string):Stage {
  return /presentation|showcase|publication/.test(kind)?'Present':/competition/.test(kind)?'Compete':/volunteer|leadership|club|job/.test(kind)?'Apply':/certificate|course|reading/.test(kind)?'Learn':'Build';
}
export function milestoneStage(title:string):Stage {return /\b(build|built|create|created|design|write|wrote|prototype|project)\b/i.test(title)?'Build':'Learn';}
export function applicationStages(status:string,category:string) {
  const eligible=['applied','result','done'].includes(status);
  const allowedStages:Stage[]=eligible?(status!=='applied'&&/competition|challenge|tournament/i.test(category)?['Apply','Compete']:['Apply']):[];
  return {eligible,defaultStage:eligible?'Apply' as Stage:null,allowedStages};
}
