import type {Factor,Opp} from './scoring.js';
import type {StudentContext} from './types.js';
import {discoveryPreferences} from './discovery-preferences.js';
import {cityDistanceMiles} from './discovery-location.js';
import {normalizeTopic} from '../discovery/groups.js';
export const SCOUT_WEIGHTS={interest:30,urgency:20,build:15,location:15,time:10,confidence:10};
type Weights=typeof SCOUT_WEIGHTS;
export function scoutWeights(raw=process.env.SCOUT_SCORE_WEIGHTS) {
  if(!raw)return {weights:SCOUT_WEIGHTS,valid:true};
  try {const data=JSON.parse(raw);const keys=Object.keys(SCOUT_WEIGHTS) as (keyof Weights)[];
    if(Object.keys(data).length===keys.length&&keys.every(k=>typeof data[k]==='number'&&Number.isFinite(data[k])&&data[k]>=0)&&keys.reduce((sum,k)=>sum+data[k],0)===100)return {weights:data as Weights,valid:true};
  }catch{}return {weights:SCOUT_WEIGHTS,valid:false};
}
export type PublicScoutFacts={schoolLevel?:string;city?:string|null;state?:string|null;currency?:string|null;costMin?:number|null;costMax?:number|null;additionalCosts?:string|null;hoursMin?:number|null;hoursMax?:number|null;projectBased?:boolean|null;parentConsent?:boolean|null;openingDate?:string|null;parentActionDetails?:string|null};
export function publicScoutFacts(o:Pick<Opp,'scoutFacts'>):PublicScoutFacts {try {const value=typeof o.scoutFacts==='string'?JSON.parse(o.scoutFacts):o.scoutFacts;return value&&typeof value==='object'?value:{};}catch{return {};}}
const aliases:Record<string,string>={ai:'artificial intelligence',ml:'machine learning',coding:'programming','computer science':'programming',cs:'programming',robotic:'robotics'};
export const topicKey=(s:string)=>{const n=normalizeTopic(s);return aliases[n]||n;};
export function matchedInterests(o:Opp,s:StudentContext) {
  let searched:string[]=[];try{searched=JSON.parse(o.discoveredFor||'[]').map((key:string)=>key.split('|')[0]);}catch{}
  const terms=[...o.tags,...o.skills,...searched].map(topicKey);
  return s.interests.filter(i=>{const key=topicKey(i);return key.length>1&&terms.some(t=>t===key||t.split(' ').length>1&&(` ${t} `).includes(` ${key} `));});
}
export function scoutPreferenceChecks(o:Opp,s:StudentContext) {
  const p=discoveryPreferences(s.discovery),f=publicScoutFacts(o),reasons:string[]=[],checks:string[]=[];
  const online=/\b(online|virtual|hybrid)\b/i.test(o.format),inPerson=/\b(in.person|hybrid)\b/i.test(o.format);
  if((s.format==='virtual'||s.region==='virtual'||p.format==='online')&&!online)reasons.push('You chose online opportunities only; online participation is not confirmed');
  if(p.format==='in_person'&&!inPerson)reasons.push('You chose in-person opportunities only; in-person participation is not confirmed');
  const distance=!online?cityDistanceMiles(p,f):null;
  if(distance!=null&&distance>p.radiusMiles)reasons.push(`About ${distance} miles between city centers, outside your ${p.radiusMiles}-mile radius`);
  if(p.city&&!online&&distance==null)checks.push('Distance not confirmed');
  if(p.maxCost!=null&&o.costType!=='free') {
    if(f.currency==='USD'&&f.costMin!=null&&f.costMin>p.maxCost)reasons.push(`Confirmed fee exceeds your $${p.maxCost} maximum`);
    else if(f.currency!=='USD'||f.costMax==null||f.costMax>p.maxCost||!!f.additionalCosts)checks.push('Check total cost against your maximum');
  }
  return {reasons,checks,distance,online};
}
export function scoutScore(o:Opp,s:StudentContext,freeMin:number,e:{status:string;reasons:string[];checks:string[]}) {
  const p=discoveryPreferences(s.discovery),f=publicScoutFacts(o),weights=scoutWeights().weights;
  const matched=matchedInterests(o,s),local=scoutPreferenceChecks(o,s);
  const privateText=[...s.goals,p.goals,p.personalProject].join(' ').toLowerCase();
  const goalHit=[...o.tags,...o.skills].some(t=>t.length>=3&&(` ${privateText.replace(/[^\p{L}\p{N} ]/gu,' ')} `).includes(` ${t.toLowerCase()} `));
  const days=o.deadline?Math.ceil((Date.parse(o.deadline+'T12:00:00Z')-Date.now())/86400000):null;
  const values={interest:matched.length?Math.min(1,0.75+0.25*(matched.length-1)):goalHit?0.4:0,
    urgency:days==null?0.4:days<7?0.35:days<=60?1:days<=120?0.8:0.5,
    build:f.projectBased===true?(goalHit?1:0.85):goalHit?0.65:0.3,
    location:local.online?1:local.distance!=null?Math.max(0.5,1-local.distance/p.radiusMiles*0.5):p.state&&f.state===p.state?0.75:0.4,
    time:0.5,confidence:o.verificationStatus==='verified'&&o.sourceCheckedAt?1:0.4};
  const available=p.hoursPerWeek==null?freeMin/60:Math.min(p.hoursPerWeek,freeMin/60);
  if(f.hoursMax!=null)values.time=f.hoursMax<=available?1:f.hoursMin!=null&&f.hoursMin>available?0:0.5;
  const breakdown=Object.fromEntries((Object.keys(weights) as (keyof Weights)[]).map(k=>[k,Math.round(values[k]*weights[k]*100)/100]));
  const score=Object.values(breakdown).reduce((sum,n)=>sum+n,0)/100,verified=values.confidence===1;
  const factors:Factor[]=[
    {key:'Interests',state:matched.length?'ok':'mid',text:matched.length?`Matches ${matched.slice(0,2).join(', ')}`:'Outside your listed interests'},
    {key:'Eligibility',state:e.status==='eligible'?'ok':'mid',text:e.status==='eligible'?`Source includes high-school grade ${s.grade}`:`Check: ${e.checks.join('; ')}`},
    {key:'Timing',state:days==null||days<7?'mid':'ok',text:o.deadline?`Official deadline ${o.deadline}${days!=null&&days<7?' — little time to prepare':''}`:'Deadline not confirmed — check application timing on the program page'},
    {key:'Project',state:goalHit&&f.projectBased?'ok':'mid',text:goalHit?`Connects with your goals${p.personalProject?' or personal project':''}${f.projectBased?' through a source-described project':''}`:f.projectBased?'Includes a source-described project':'Project work is not confirmed'},
    {key:'Location',state:local.online?'ok':local.distance!=null?'ok':'mid',text:local.online?'Online participation available':local.distance!=null?`About ${local.distance} miles between city centers; check the actual venue`:'Location or distance not confirmed'},
    {key:'Time',state:values.time===1?'ok':values.time===0?'no':'mid',text:f.hoursMax!=null?`${f.hoursMin??f.hoursMax}–${f.hoursMax} hours/week; about ${Math.round(available)}h available`:'Weekly hours not confirmed — check the commitment'},
    {key:'Cost',state:o.costType==='free'?'ok':'mid',text:o.cost},
    {key:'Source',state:verified?'ok':'mid',text:verified?`Source verified ${o.sourceCheckedAt!.toISOString().slice(0,10)}`:o.sourceReadAt?`Page read ${new Date(o.sourceReadAt).toISOString().slice(0,10)}; check flagged details`:'Search link only — program details have not been confirmed'},
  ];
  const why=matched.length?`Suggested for your interest in ${matched.slice(0,2).join(' and ')}${goalHit?' and its connection to your goals or project':''}.`:goalHit?'Connects with your goals or project.':'A chance to explore another interest.';
  return {id:o.id,excluded:false as const,eligibility:e,score,fit:score>=0.65?'strong':score>=0.45?'good':'look',factors,why,matched,goalHit,breakdown};
}
