import {z} from 'zod';
import {dkey,parseLocal} from './time.js';
import {skillSignals,validDate,type Evidence,type GrowthSource,type Review,type Stage} from './growth-map.js';
import {nextStep,signature,words} from './growth-insights.js';
export const validMonth=(month:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month)&&Number(month.slice(0,4))>=2000;
export const monthOf=(now:Date)=>dkey(now).slice(0,7);
export const shiftedMonth=(month:string,offset:number)=>{const [year,m]=month.split('-').map(Number);return dkey(new Date(year,m-1+offset,1)).slice(0,7);};
export const previousMonth=(now:Date)=>shiftedMonth(monthOf(now),-1);
export const monthLabel=(month:string)=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(parseLocal(month+'-01')!);
export interface LetterSkill {id:string;name:string;focus:boolean}
export interface LetterInput {month:string;skills:LetterSkill[];evidence:Evidence[];sources:GrowthSource[];reviews:Review[];saved:{createdOn:string;status:string}[]}
export function monthlyGrowth(input:LetterInput) {
  const {month,skills,sources,reviews}=input,visible=new Set(skills.map(s=>s.id)),lastDay=dkey(new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0));
  const evidence=input.evidence.filter(e=>visible.has(e.skillId)&&e.date<=lastDay),inMonth=(date:string|null)=>!!date&&validDate(date)&&date.startsWith(month);
  const items=evidence.filter(e=>inMonth(e.date)),activityCount=new Set(items.map(e=>e.key)).size;
  const counts={stepsFinished:sources.filter(s=>s.type==='milestone'&&s.eligible&&inMonth(s.date)).length,experiencesCaptured:sources.filter(s=>s.type==='portfolio'&&s.eligible&&inMonth(s.date)).length,opportunitiesSaved:input.saved.filter(s=>s.status!=='dismissed'&&inMonth(s.createdOn)).length,opportunitiesApplied:sources.filter(s=>s.type==='application'&&s.eligible&&inMonth(s.date??reviews.find(r=>r.sourceType==='application'&&r.sourceId===s.id)?.occurredOn??null)).length};
  const signals=skills.map(s=>({...s,...skillSignals(evidence.filter(e=>e.skillId===s.id),parseLocal(lastDay)!)}));
  const grown=signals.filter(s=>s.growing).sort((a,b)=>b.thisMonth-a.thisMonth||a.id.localeCompare(b.id)).map(s=>({id:s.id,name:s.name,count:s.thisMonth}));
  const nextSkill=signals.filter(s=>s.thisMonth>0&&s.next).sort((a,b)=>Number(b.focus)-Number(a.focus)||b.thisMonth-a.thisMonth||a.id.localeCompare(b.id))[0];
  const idea=nextSkill?{skillId:nextSkill.id,stage:nextSkill.next as Stage,title:nextStep(nextSkill.name,nextSkill.next!)}:{skillId:null,stage:null,title:'Capture one experience and reflect on what you tried'};
  const label=monthLabel(month),skillText=grown.length?` Recorded activity grew in ${grown.slice(0,3).map(s=>s.name).join(', ')}.`:'';
  const quiet=activityCount<3;
  const quantity=(n:number,noun:string)=>`${n} ${noun}${n===1?'':'s'}`;
  const stories=quiet?["A quieter month. Here’s one idea to get going: choose a small experience you want to try, then capture what you did. Your records are yours to build at your own pace."]:[
    `In ${label}, you recorded ${activityCount} confirmed activities. Your records include ${quantity(counts.stepsFinished,'finished step')}, ${quantity(counts.experiencesCaptured,'captured experience')}, ${quantity(counts.opportunitiesSaved,'saved program')} and ${quantity(counts.opportunitiesApplied,'application action')}.${skillText} Each experience adds to the story you can revisit. For the next month, consider one small step you choose.`,
    `Looking back at ${label}, ${activityCount} confirmed activities connect your experiences. You recorded ${quantity(counts.experiencesCaptured,'capture')} and ${quantity(counts.stepsFinished,'finished step')}, alongside ${quantity(counts.opportunitiesSaved,'saved program')} and ${quantity(counts.opportunitiesApplied,'application action')}.${skillText} Take a moment to revisit what you tried, then choose one manageable idea for the next month.`
  ];
  // Factual formulations are bounded, even with long catalog names.
  const allowedStories=stories.filter(s=>words(s)<120);
  const evidenceIds=[...new Set(items.map(e=>e.id))].slice(0,6).sort();
  const fingerprint=signature([month,counts,activityCount,grown,idea,allowedStories,items.map(e=>[e.id,e.key,e.date,e.sources.map(s=>[s.type,s.id,s.title,s.date,s.stage])]).sort()]);
  return {month,label,quiet,activityCount,counts,skillsGrown:grown,idea,allowedStories,evidenceIds,fingerprint};
}
export type MonthlyGrowth=ReturnType<typeof monthlyGrowth>;
export function validateLetter(raw:unknown,report:MonthlyGrowth):string|null {
  const result=z.object({text:z.string().max(2000),evidenceIds:z.array(z.string()).max(6)}).strict().safeParse(raw);
  if(!result.success||!report.allowedStories.includes(result.data.text)||words(result.data.text)>=120||JSON.stringify([...result.data.evidenceIds].sort())!==JSON.stringify(report.evidenceIds))return null;
  return result.data.text;
}
export function activityHistory(evidence:Evidence[],id:string,now:Date) {
  const current=monthOf(now);
  return Array.from({length:6},(_,i)=>{const month=shiftedMonth(current,i-5),items=evidence.filter(e=>e.skillId===id&&e.date.startsWith(month)&&e.date<=dkey(now));return {month,label:monthLabel(month),count:items.length,current:month===current};});
}
