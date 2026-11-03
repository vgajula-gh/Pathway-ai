import {ResearchOutput} from './schema.js';
import type {PublicSearchContext} from './prompts.js';
import {parseJSON,type LLMUsage} from '../agent/llm/types.js';
import {DiscoveryFailure} from '../discovery/failures.js';

export type ResearchResponse={text:string;usage:LLMUsage;citations:string[];sources?:{name:string;url:string}[]};
export type ResearchProvider={research(context:PublicSearchContext,count:number):Promise<ResearchResponse>};
export function researchOutput(text:string) {
  let parsed:unknown;
  try{parsed=parseJSON(text);}catch{throw new DiscoveryFailure({stage:'search',code:'invalid_json'});}
  // These are unverified leads, not program facts. Missing metadata must not lose
  // readable named URLs; unknown cost remains unknown until source qualification.
  const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
  const root=record(parsed),raw=Array.isArray(parsed)?parsed:root.candidates||root.opportunities||root.programs||root.results||(root.name&&root.officialUrl?[root]:undefined);
  const strings=(v:unknown,max:number)=>Array.isArray(v)?v.filter((s):s is string=>typeof s==='string').slice(0,max).map(s=>s.slice(0,80)):[];
  const leads=Array.isArray(raw)?raw.slice(0,16).map(v=>{const c=record(v);const hint=typeof c.costHint==='string'?c.costHint.toLowerCase():'unknown';return {name:c.name,officialUrl:c.officialUrl||c.official_url||c.url,interests:strings(c.interests,10),costHint:['free','paid','unknown'].includes(hint)?hint:'unknown'};}):raw;
  const shape={candidates:leads,searchThemesUsed:strings(root.searchThemesUsed,10)};
  const value=ResearchOutput.safeParse(shape);
  if(!value.success) {
    // Keep valid siblings when another lead lacks identity or has an unsafe URL.
    const valid=Array.isArray(leads)?leads.flatMap(c=>{const r=ResearchOutput.shape.candidates.element.safeParse(c);return r.success?[r.data]:[];}):[];
    if(valid.length)return ResearchOutput.parse({...shape,candidates:valid});
    const fields=new Set(['candidates','name','officialUrl','interests','costHint','searchThemesUsed']);
    throw new DiscoveryFailure({stage:'search',code:'invalid_schema',issues:value.error.issues.slice(0,8).map(i=>({field:i.path.map(p=>typeof p==='number'?'item':fields.has(p)?p:'field').join('.')||'output',code:i.code}))});
  }
  return value.data;
}
export function validResearch(value:unknown){return ResearchOutput.parse(value);}
/** Fallback uses only provider-returned citations, never guessed URLs or facts. */
export function citedLeads(response:ResearchResponse,count:number) {
  const sources=[...(response.sources||[]),
    ...[...response.text.slice(0,20000).matchAll(/\[([^\]]{1,200})\]\((https:\/\/[^\s)]+)\)/g)].map(m=>({name:m[1],url:m[2]})),
    ...response.citations.map(url=>({url,name:''})),
    ...[...response.text.slice(0,20000).matchAll(/https:\/\/[^\s"'<>)}\]]+/g)].map(m=>({name:'',url:m[0].replace(/[.,;]+$/,'')}))];
  const candidates=sources.slice(0,100).flatMap(source=>{
    try {
      const url=new URL(source.url),name=source.name.trim().slice(0,200)||`Search result: ${url.host}${url.pathname}`.slice(0,200);
      const candidate=ResearchOutput.shape.candidates.element.safeParse({name,officialUrl:url.href,interests:[],costHint:'unknown'});
      return candidate.success?[candidate.data]:[];
    }catch{return [];}
  });
  const unique=new Map<string,(typeof candidates)[number]>();
  for(const candidate of candidates)if(!unique.has(candidate.officialUrl))unique.set(candidate.officialUrl,candidate);
  return {candidates:[...unique.values()].slice(0,Math.min(16,count)),searchThemesUsed:[]};
}
