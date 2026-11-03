import type {Page} from '../discovery/pages.js';
import {Extraction} from '../discovery/extraction.js';
import {verifyCandidate} from '../discovery/verification.js';
import {failureInfo} from '../discovery/failures.js';
import {resolveEvidence,sourcePassages} from './passages.js';
import type {ScoutFacts} from './schema.js';
import type {storeCandidate} from '../discovery/pipeline.js';
export type QualificationReason={field:string;reason:string};
export type CandidateData=Parameters<typeof storeCandidate>[0]&{scoutFacts?:string;qualificationNotes?:string;promptVersion?:string;sourceReadAt?:Date|null};
export type Qualification={disposition:'verified'|'needs_verification'|'watchlist'|'excluded';reasons:QualificationReason[];data?:CandidateData};

/** Transitional adapter; deterministic Scout gates extend this in the qualification commit. */
export function qualifyScout(facts:ScoutFacts,pages:Page[],trusted:Set<string>,now=new Date()):Qualification {
  const evidence=resolveEvidence(facts,sourcePassages(pages));
  const keys=Object.keys(Extraction.shape);
  const raw=Object.fromEntries(keys.filter(k=>k!=='evidence').map(k=>[k,(facts as Record<string,unknown>)[k]??null]));
  raw.costType=facts.costType==='tuition_free_other_costs'?'paid':facts.costType;
  try {
    const data=verifyCandidate(Extraction.parse({...raw,evidence}),pages,trusted,now);
    return {disposition:'verified',reasons:[],data:{...data,scoutFacts:JSON.stringify(facts),sourceReadAt:now}};
  }catch(error){return {disposition:'excluded',reasons:failureInfo(error,'verify').verification||[{field:'source',reason:'unverifiable'}]};}
}
