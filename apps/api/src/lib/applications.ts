import { Prisma } from '@prisma/client';
import { prisma, j } from './db.js';
import { countdown, initialChecklist } from '../domain/applications.js';
import { HttpError } from './auth.js';

export async function saveApplication(db: Prisma.TransactionClient, studentId: string, opportunityId: string) {
  const opportunity = await db.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) throw new HttpError(404, 'Opportunity not found');
  const evidence=j<Record<string,{sourceUrl:string;quote:string}>>(opportunity.evidence,{});
  const requirements=evidence.requirements?j<string[]>(opportunity.requirements,[]).filter(t=>evidence.requirements.quote.includes(t)):[];
  const citations={...Object.fromEntries(requirements.map(t=>[t,evidence.requirements.sourceUrl])),...(evidence.deadline?{deadline:evidence.deadline.sourceUrl}:{})};
  return db.savedOpportunity.upsert({where:{studentId_opportunityId:{studentId,opportunityId}},update:{},create:{studentId,opportunityId,status:'interested',citedDeadline:opportunity.deadline&&evidence.deadline?opportunity.deadline:null,citations:JSON.stringify(citations),checklist:JSON.stringify(initialChecklist(requirements.length?requirements:j(opportunity.checks,[])))}});

}
export async function applicationsFor(studentId: string, today: string) {
  const [saved, opps] = await Promise.all([prisma.savedOpportunity.findMany({ where: { studentId, status: { not: 'dismissed' } } }), prisma.opportunity.findMany()]);
  return saved.map(a => {
    const opp = opps.find(o => o.id === a.opportunityId);
    const deadline = a.deadline || a.citedDeadline || (opp && (opp.sourceCheckedAt || j<Record<string,unknown>>(opp.evidence,{}).deadline) ? opp.deadline : null);
    let checklist = j<{ title: string; done: boolean }[]>(a.checklist, initialChecklist(j(opp?.checks, [])));
    if (!checklist.length) checklist = initialChecklist(j(opp?.checks, []));
    return { ...a, deadlinePassed:!!deadline && deadline<today, status: a.status === 'saved' ? 'interested' : a.status === 'done' ? 'result' : a.status, name: opp?.name || 'Saved opportunity', url: opp?.url, deadline, deadlineSource: a.deadline ? 'Added by you · not verified' : a.citedDeadline ? 'Official page citation · confirm before applying' : deadline ? 'Verified source' : 'Unknown · confirm on the official site', checklist, countdown: countdown(deadline, today), nextStep: checklist.find(s => !s.done)?.title || 'Review your application', completed: checklist.filter(s => s.done).length };
  });
}
