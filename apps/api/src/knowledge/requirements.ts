import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {prisma,j} from '../lib/db.js';
import {HttpError} from '../lib/errors.js';
import {Action} from '../domain/actions.js';
type Opportunity=Awaited<ReturnType<typeof prisma.opportunity.findUniqueOrThrow>>;
export function requirementsAction(o:Opportunity){
 if(['expired','stale'].includes(o.verificationStatus))throw new HttpError(422,'The program details need another check before adding requirements.');
 const evidence=j<Record<string,{sourceUrl:string;quote:string}>>(o.evidence,{}),requirements=j<string[]>(o.requirements,[]);
 const checklist=evidence.requirements?requirements.filter(title=>evidence.requirements.quote.includes(title)).map(title=>({title,sourceUrl:evidence.requirements.sourceUrl})):[];
 const deadline=o.deadline&&evidence.deadline&&o.deadline>=new Date().toISOString().slice(0,10)?o.deadline:undefined;
 if(!checklist.length&&!deadline)throw new HttpError(422,'The official pages do not list requirements or a current deadline to add.');
 const referenceHash=createHash('sha256').update(JSON.stringify({checklist,deadline,evidence})).digest('hex');
 return {type:'add_application_requirements' as const,opportunityId:o.id,checklist,deadline,referenceHash};
}
export async function validateRequirements(db:Prisma.TransactionClient,studentId:string,action:Extract<Action,{type:'add_application_requirements'}>){
 const [o,saved]=await Promise.all([db.opportunity.findUnique({where:{id:action.opportunityId}}),db.savedOpportunity.findUnique({where:{studentId_opportunityId:{studentId,opportunityId:action.opportunityId}}})]);
 if(!o||!saved||saved.status==='dismissed')throw new HttpError(422,'Add this program to Interested first.');
 const fresh=requirementsAction(o);if(JSON.stringify(fresh)!==JSON.stringify(action))throw new HttpError(422,'The official details changed. Ask for a fresh proposal.');return saved;
}
export async function applyRequirements(tx:Prisma.TransactionClient,studentId:string,action:Extract<Action,{type:'add_application_requirements'}>){const saved=await validateRequirements(tx,studentId,action),current=j<{title:string;done:boolean}[]>(saved.checklist,[]);
 const checklist=[...current,...action.checklist.filter(c=>!current.some(x=>x.title===c.title)).map(c=>({title:c.title,done:false}))];
 const citations={...j<Record<string,string>>(saved.citations,{}),...Object.fromEntries(action.checklist.map(c=>[c.title,c.sourceUrl])),...(action.deadline?{deadline:(j<Record<string,{sourceUrl:string}>>((await tx.opportunity.findUniqueOrThrow({where:{id:action.opportunityId}})).evidence,{}).deadline?.sourceUrl||'')}:{} )};
 const updated=await tx.savedOpportunity.update({where:{studentId_opportunityId:{studentId,opportunityId:action.opportunityId}},data:{checklist:JSON.stringify(checklist),citations:JSON.stringify(citations),citedDeadline:action.deadline||saved.citedDeadline}});
 if(action.checklist.some(c=>!j<{title:string}[]>(updated.checklist,[]).some(x=>x.title===c.title))||(action.deadline&&updated.citedDeadline!==action.deadline))throw new Error('Could not verify checklist changes');
}
