import {readFileSync} from 'node:fs';
import {ResearchJSON} from './schema.js';
export const PROMPT_VERSION='scout-v1';
const read=(name:string)=>readFileSync(new URL(`../agent/prompts/${name}.md`,import.meta.url),'utf8');
export const scoutSystem=()=>read('opportunity-scout.system');
export const extractionSystem=()=>read('opportunity-extract.system');
export type PublicSearchContext={today:string;gradeBand:string;interests:string[];focusInterests:string[];region:string;city?:string;state?:string;format?:string;buckets:('free'|'paid')[];excludeUrls?:string[]};
export function publicSearchContext(input:PublicSearchContext):PublicSearchContext {
  // An allowlist prevents accidentally forwarding names, private goals or a whole profile.
  const clean=(v:unknown,max=80)=>typeof v==='string'?v.normalize('NFKC').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
  const list=(v:unknown,max:number)=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string').map(x=>clean(x)).filter(Boolean))].slice(0,max):[];
  return {today:clean(input.today,10),gradeBand:clean(input.gradeBand,10),interests:list(input.interests,20),focusInterests:list(input.focusInterests,3),
    region:clean(input.region),city:clean(input.city),state:clean(input.state,2),format:['online','in_person','both'].includes(input.format||'')?input.format:'both',
    buckets:input.buckets.filter(b=>b==='free'||b==='paid').slice(0,2),excludeUrls:(input.excludeUrls||[]).slice(0,30).filter(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}})};
}
export function scoutPrompt(input:PublicSearchContext,count=6) {
  const context=publicSearchContext(input);
  return read('opportunity-scout.user').replace('{{today}}',context.today).replace('{{context}}',JSON.stringify(context))
    .replace('{{count}}',String(Math.max(1,Math.min(16,count)))).replace('{{schema}}',JSON.stringify(ResearchJSON.schema));
}
