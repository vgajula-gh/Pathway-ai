import {prisma,j} from '../lib/db.js';
import {storeCandidate,type Group} from '../discovery/pipeline.js';
import {identity} from '../discovery/groups.js';
import type {CandidateData} from './qualify.js';
import {PROMPT_VERSION} from './prompts.js';
import {ScoutFacts} from './schema.js';
import {qualifyScout} from './qualify.js';
import {programSourceURL} from '../domain/program-source.js';

/** A search lead is a link to check, not verified program facts. */
export function leadData(name:string,url:string):CandidateData {
  const source=programSourceURL(url);if(!source||!name.trim())throw new Error('Invalid search lead');
  return {name:name.trim(),url:source.href,officialDomain:source.hostname.replace(/^www\./,''),organizer:'Organizer not confirmed',category:'Program',opportunityType:'program',
    applicationStatus:'unknown',applicationStatusCheckedAt:null,activityDate:null,gradeMin:null,gradeMax:null,minAge:null,format:'Format not confirmed',region:'[]',cost:'Cost not confirmed — check the program page',costType:'unknown',costAmount:null,costVerifiedAt:null,financialAidNote:null,feeFlag:false,
    commitment:'Time commitment not confirmed',skills:'[]',tags:'[]',checks:JSON.stringify(['Search result — program details and deadline are not confirmed. Check the program page.']),deadline:null,requirements:'[]',evidence:'{}',verificationStatus:'needs_verification',verifiedAt:null,sourceCheckedAt:null,sourceReadAt:null,scoutFacts:'{}',qualificationNotes:'[]',promptVersion:PROMPT_VERSION,isSample:false};
}
export async function storeLead(name:string,url:string,group:Group) {
  const data=leadData(name,url);
  const existing=(await prisma.opportunity.findMany()).find(o=>o.url===data.url||identity(o.officialDomain||new URL(o.url).hostname,o.name)===identity(data.officialDomain,data.name));
  if(existing) {
    await prisma.opportunity.update({where:{id:existing.id},data:{discoveredFor:JSON.stringify([...new Set([...j<string[]>(existing.discoveredFor,[]),group.key])])}});
    return existing;
  }
  const id=await storeCandidate(data,[],group);return prisma.opportunity.findUniqueOrThrow({where:{id}});
}

/** Recover already-paid public search results, with no new model or source call.
 * Existing past-deadline evidence is respected; a failed parser never invents facts. */
export async function recoverStoredLeads() {
  const candidates=await prisma.researchCandidate.findMany({where:{opportunityId:null,status:{in:['excluded','error']}},include:{run:true},orderBy:{createdAt:'desc'},take:100});
  for(const candidate of candidates) {
    if(!candidate.name||!programSourceURL(candidate.url))continue;
    const reasons=j<{reason:string}[]>(candidate.reasons,[]);if(reasons.some(r=>['past_deadline','deadline_passed'].includes(r.reason)))continue;
    const group=await prisma.discoveryGroup.findUnique({where:{key:candidate.run.groupKey}});if(!group)continue;
    const existing=await prisma.opportunity.findFirst({where:{url:candidate.url}});
    if(existing){await prisma.researchCandidate.update({where:{id:candidate.id},data:{opportunityId:existing.id}});continue;}
    const parsed=ScoutFacts.safeParse(j(candidate.facts,{}));
    const pages=j<any[]>(candidate.pages,[]).map(p=>({...p,checkedAt:new Date(p.checkedAt)}));
    let id:string;
    if(parsed.success&&pages.length) {
      const result=qualifyScout(parsed.data,pages,new Set(),new Date(),candidate);
      if(!result.data)continue;
      id=await storeCandidate(result.data,pages,group);
    }else id=(await storeLead(candidate.name,candidate.url,group)).id;
    await prisma.researchCandidate.update({where:{id:candidate.id},data:{opportunityId:id}});
  }
}
