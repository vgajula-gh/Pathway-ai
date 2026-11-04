import {createHash} from 'node:crypto';
import {z} from 'zod';
import {SKILL_CATALOG} from '../growth-map/catalog.js';
import {deadlineExpired} from './opportunity-active.js';
import type {Evidence,Stage} from './growth-map.js';

export const INSIGHT_TYPES=['growing','strength','connection','next'] as const;
export type InsightType=typeof INSIGHT_TYPES[number];
export type InsightAction='evidence'|'goal'|'explore';
export interface InsightSkill {id:string;name:string;count:number;growing:boolean;thisMonth:number;previousAverage:number;next:Stage|null;focus:boolean}
export interface InsightCandidate {id:string;fingerprint:string;type:InsightType;skillIds:string[];evidenceIds:string[];texts:string[];action:InsightAction}
export interface CachedInsight {id:string;fingerprint:string;text:string}
export const signature=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const words=(s:string)=>s.trim().split(/\s+/).length;
const phrase=(s:string)=>s.toLowerCase().replace(/[^a-z0-9+#]+/g,' ').trim();
export function mentionsSkill(text:string,id:string) {
  const skill=SKILL_CATALOG.find(s=>s.id===id);if(!skill)return false;
  const hay=' '+phrase(text)+' ';
  return [skill.name,...skill.synonyms].some(name=>hay.includes(' '+phrase(name)+' '));
}
export function insightCandidates(skills:InsightSkill[],evidence:Evidence[],reflections:Map<string,string>,dismissals:{signature:string;type:string}[]):InsightCandidate[] {
  const dismissed=new Set(dismissals.map(d=>d.signature)),candidates:InsightCandidate[]=[];
  const visible=new Set(skills.filter(s=>s.count>0).map(s=>s.id)),live=evidence.filter(e=>visible.has(e.skillId));
  const add=(type:InsightType,ids:string[],items:Evidence[],texts:string[],action:InsightAction='evidence')=>{
    const skillIds=[...ids].sort(),id=signature([type,skillIds,type==='next'?skills.find(s=>s.id===ids[0])?.next:null]);
    const evidenceIds=[...new Set(items.map(e=>e.id))].slice(0,6).sort();
    if(dismissed.has(id)||!evidenceIds.length||texts.some(t=>words(t)>=35))return;
    const fingerprint=signature([id,texts,items.map(e=>[e.id,e.key,e.date,e.sources.map(s=>[s.type,s.id,s.title,s.date,s.stage])]).sort()]);
    candidates.push({id,fingerprint,type,skillIds,evidenceIds,texts,action});
  };
  const growing=skills.filter(s=>s.growing).sort((a,b)=>(b.thisMonth-b.previousAverage)-(a.thisMonth-a.previousAverage)||a.id.localeCompare(b.id))[0];
  if(growing)add('growing',[growing.id],live.filter(e=>e.skillId===growing.id),[
    `${growing.name} has ${growing.thisMonth} recorded activities this month, more than your previous two-month average. See which experiences contributed.`,
    `You recorded ${growing.thisMonth} ${growing.name} activities this month. Your recorded activity is picking up compared with the previous two months.`]);
  for(const skill of skills.filter(s=>s.count>0)){
    const reflected=live.filter(e=>e.skillId===skill.id&&e.sources.some(s=>mentionsSkill(reflections.get(`${s.type}:${s.id}`)??'',skill.id)));
    if(reflected.length>=3)add('strength',[skill.id],reflected,[
      `${skill.name} appears in ${reflected.length} of your reflections on confirmed activities. It is a theme you keep recording.`,
      `Across ${reflected.length} confirmed activities, your reflections mention ${skill.name}. Take a look at the experiences behind that pattern.`]);
  }
  // Grouped milestone/capture records share a canonical activity key. Never infer a connection from unconfirmed interests.
  for(let i=0;i<skills.length;i++)for(let j=i+1;j<skills.length;j++){
    const a=skills[i],b=skills[j];if(!visible.has(a.id)||!visible.has(b.id))continue;
    const aa=live.filter(e=>e.skillId===a.id),bb=live.filter(e=>e.skillId===b.id),shared=new Set(aa.filter(e=>bb.some(f=>e.key===f.key&&(!e.key.startsWith('study-week:')||e.sources.some(s=>f.sources.some(t=>t.type===s.type&&t.id===s.id))))).map(e=>e.key));
    if(shared.size)add('connection',[a.id,b.id],live.filter(e=>[a.id,b.id].includes(e.skillId)&&shared.has(e.key)),[
      `${a.name} and ${b.name} appear together in ${shared.size} confirmed ${shared.size===1?'activity':'activities'}. Open the evidence to explore that connection.`,
      `You used ${a.name} alongside ${b.name} in ${shared.size} recorded ${shared.size===1?'activity':'activities'}. These experiences connect the two skills.`]);
  }
  for(const skill of skills.filter(s=>s.count>0&&s.next).slice(0,12))add('next',[skill.id],live.filter(e=>e.skillId===skill.id),[
    `Your next ${skill.name} stage is ${skill.next}. Choose a small experience to try; this is an idea, not an achievement already completed.`,
    `Try a small ${skill.next} experience with ${skill.name}. Your confirmed activities suggest this as a possible next step, with your choice and approval.`],'goal');
  const dismissedType=(type:string)=>dismissals.filter(d=>d.type===type).length;
  const priority=(c:InsightCandidate)=>(c.skillIds.some(id=>skills.find(s=>s.id===id)?.focus)?-10:0)+dismissedType(c.type)*3+INSIGHT_TYPES.indexOf(c.type);
  const counts=new Map<string,number>();
  return candidates.sort((a,b)=>priority(a)-priority(b)||a.id.localeCompare(b.id)).filter(c=>{const n=counts.get(c.type)??0;counts.set(c.type,n+1);return n<3;}).slice(0,12);
}
// Text is deliberately bounded to approved factual formulations. A numerical check alone cannot rule out invented achievements or sensitive claims.
export function validateInsightOutput(raw:unknown,candidates:InsightCandidate[]):CachedInsight[] {
  const parsed=z.object({insights:z.array(z.object({candidateId:z.string(),text:z.string().max(500),evidenceIds:z.array(z.string()).min(1),action:z.enum(['evidence','goal','explore'])}).strict()).max(3)}).strict().safeParse(raw);
  if(!parsed.success)return [];
  const result:CachedInsight[]=[];const types=new Set<string>();
  for(const item of parsed.data.insights){const c=candidates.find(c=>c.id===item.candidateId);
    if(!c||types.has(c.type)||!c.texts.includes(item.text)||item.action!==c.action||JSON.stringify([...item.evidenceIds].sort())!==JSON.stringify(c.evidenceIds))continue;
    result.push({id:c.id,fingerprint:c.fingerprint,text:item.text});types.add(c.type);
  }
  return result;
}
export const nextStep=(name:string,stage:Stage)=>({
  Learn:`Practice one new ${name} technique`,Build:`Build a small ${name} project`,Apply:`Use ${name} for a real need`,Present:`Share your ${name} work`,Compete:`Explore a ${name} challenge`
})[stage];
export interface MatchOpportunity {id:string;name:string;category:string;opportunityType?:string;skills:string;tags:string;deadline:string|null;isSample:boolean;source:string;url:string;cost:string;format:string;sourceCheckedAt:Date|null;verificationStatus:string}
const stringList=(s:string)=>{try{const v=JSON.parse(s);return Array.isArray(v)?v.filter(x=>typeof x==='string').join(' '):'';}catch{return '';}};
export function stageForOpportunity(o:Pick<MatchOpportunity,'name'|'category'|'opportunityType'>):Stage|null {
  const text=[o.name,o.category,o.opportunityType].join(' ');
  if(/\b(contest|competition|hackathon|challenge|olympiad|tournament)\b/i.test(text))return 'Compete';
  if(/\b(showcase|presentation|conference speaker|exhibition|publication)\b/i.test(text))return 'Present';
  if(/\b(volunteer|volunteering|internship|service|job)\b/i.test(text))return 'Apply';
  if(/\b(project|prototype|maker|build|design lab)\b/i.test(text))return 'Build';
  if(/\b(course|class|workshop|lesson|reading|learning|camp|training)\b/i.test(text))return 'Learn';
  return null;
}
export function matchingOpportunities(id:string,stage:Stage,opps:MatchOpportunity[],picks:Set<string>,dismissed:Set<string>,today:string,demo=false) {
  return opps.filter(o=>!dismissed.has(o.id)&&(demo||!o.isSample&&o.source!=='seed')&&!deadlineExpired(o.deadline,today)&&stageForOpportunity(o)===stage&&mentionsSkill([o.name,stringList(o.skills),stringList(o.tags)].join(' '),id)&&/^https?:\/\//i.test(o.url))
    .sort((a,b)=>Number(picks.has(b.id))-Number(picks.has(a.id))||Number(!!b.sourceCheckedAt)-Number(!!a.sourceCheckedAt)||a.name.localeCompare(b.name)).slice(0,2)
    .map(o=>({id:o.id,name:o.name,url:o.url,cost:o.cost,format:o.format,deadline:o.deadline,verified:o.verificationStatus==='verified'&&!!o.sourceCheckedAt,reason:`Matches this skill and a ${stage} experience. Confirm eligibility, location, cost and application details on the program page.`}));
}
