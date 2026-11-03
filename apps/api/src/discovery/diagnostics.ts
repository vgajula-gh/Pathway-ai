import {z} from 'zod';
import {safeModelId} from './config.js';
import {Extraction} from './extraction.js';
import {knownFailureCode,type FailureInfo,type FailureStage} from './failures.js';
import {sourceTypes} from './source-urls.js';
import {verificationFields,verificationReasons} from '../domain/opportunity-evidence.js';

const stages=new Set(['search','robots','fetch','extract','verify','store','index']);
const fields=new Set([...Object.keys(Extraction.shape),'sourceUrl','quote','field','item','output']);
const issueCodes=new Set<string>(Object.values(z.ZodIssueCode));
const stepNames={search_candidates:'search',fetch_official_pages:'fetch',extract_facts:'extract',verify_facts:'verify',store_catalog:'save',ingest_knowledge:'index'} as const;
const record=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1e6?v:0;
function cleanFailure(value:unknown):FailureInfo|null {
  const f=record(value);
  if(!stages.has(f.stage)||!knownFailureCode(f.code))return null;
  const issues=Array.isArray(f.issues)?f.issues.slice(0,8).flatMap((value:unknown)=>{
    const i=record(value);
    return typeof i.field==='string'&&i.field.length<=150&&i.field.split('.').every(p=>fields.has(p))&&issueCodes.has(i.code)?[{field:i.field,code:i.code as string}]:[];
  }):[];
  return {stage:f.stage as FailureStage,code:f.code,
    ...(Array.isArray(f.verification)?{verification:f.verification.slice(0,10).flatMap((value:unknown)=>{
      const i=record(value);return verificationFields.includes(i.field)&&verificationReasons.includes(i.reason)?[{field:i.field,reason:i.reason}]:[];
    })}:{}),
    ...(sourceTypes.includes(f.mediaType)?{mediaType:f.mediaType}:{}),
    ...(['gzip','br','deflate','identity','other'].includes(f.contentEncoding)?{contentEncoding:f.contentEncoding}:{}),
    ...(issues.length?{issues}:{}),
    ...(['length','content_filter','empty','refusal'].includes(f.finishReason)?{finishReason:f.finishReason}:{}),
    ...(Number.isInteger(f.httpStatus)&&f.httpStatus>=400&&f.httpStatus<=599?{httpStatus:f.httpStatus}:{}),
    ...(['TypeError','ReferenceError','Error'].includes(f.errorType)?{errorType:f.errorType}:{}),
    ...(typeof f.location==='string'&&/^(?:agent\/llm\/(?:openai|anthropic|ollama|extraction|types)|discovery\/extraction)\.(?:ts|js):\d{1,6}$/.test(f.location)?{location:f.location}:{}),
  };
}

/** Student-request-bound, read-only summaries. Never forward arbitrary stored objects. */
export function searchDiagnostics(runs:{id:string;usage:string}[]) {
  const unique=[...new Map(runs.map(r=>[r.id,r])).values()];
  const steps=Object.fromEntries(Object.values(stepNames).map(name=>[name,{completed:0,failed:0}])) as Record<typeof stepNames[keyof typeof stepNames],{completed:number;failed:number}>;
  let searchAttempts=0,httpAttempts=0,knownCandidates=true;
  const candidates={found:0,filtered:0,queued:0},ids=new Set<string>(),models=new Map<string,unknown>(),failures:FailureInfo[]=[];
  for(const run of unique) {
    let u:Record<string,any>={};try{u=record(JSON.parse(run.usage));}catch{/* Legacy missing diagnostics. */}
    searchAttempts+=count(u.searches);httpAttempts+=count(u.pages);
    if(u.candidates&&typeof u.candidates==='object'&&!Array.isArray(u.candidates)&&['found','filtered','queued'].every(k=>typeof u.candidates[k]==='number'&&Number.isSafeInteger(u.candidates[k])&&u.candidates[k]>=0&&u.candidates[k]<=1e6))for(const key of ['found','filtered','queued'] as const)candidates[key]+=count(u.candidates[key]);
    else knownCandidates=false;
    if(Array.isArray(u.savedIds))for(const id of u.savedIds)if(typeof id==='string')ids.add(id);
    if(Array.isArray(u.workflow))for(const value of u.workflow.slice(0,200)) {
      const s=record(value);
      if(typeof s.node==='string'&&Object.hasOwn(stepNames,s.node)&&(s.status==='completed'||s.status==='failed'))steps[stepNames[s.node as keyof typeof stepNames]][s.status as 'completed'|'failed']++;
    }
    if(Array.isArray(u.failures))for(const value of u.failures.slice(0,100)){const failure=cleanFailure(value);if(failure)failures.push(failure);}
    if(u.models) {
      const model=record(u.models),clean:Record<string,unknown>={};
      for(const kind of ['search','extraction']) {
        const value=record(model[kind]);
        if(['openai','anthropic','ollama','none'].includes(value.provider))clean[kind]={provider:value.provider,model:safeModelId(typeof value.model==='string'?value.model:undefined)};
      }
      if(Object.keys(clean).length)models.set(JSON.stringify(clean),clean);
    }
  }
  const grouped=new Map<string,FailureInfo&{count:number}>();
  for(const failure of failures){const key=JSON.stringify(failure),old=grouped.get(key);grouped.set(key,{...failure,count:(old?.count||0)+1});}
  return {failures,diagnostics:{runs:unique.length,searchAttempts,httpAttempts,candidates:knownCandidates?candidates:null,
    steps,programsSaved:ids.size,failures:[...grouped.values()],models:[...models.values()]}};
}
