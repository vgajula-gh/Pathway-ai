import {prisma} from '../lib/db.js';
import {HttpError} from '../lib/errors.js';
import {activeOpportunity} from '../domain/opportunity-active.js';
import {wallNow,dkey} from '../domain/time.js';
import {env} from '../lib/env.js';
export const MY_OPPORTUNITIES='my_opportunities';
/** PostgreSQL owns membership. Neither a browser nor a model may supply an ID allowlist. */
export async function studentOpportunityIds(studentId:string) {
  const [student,picks,saved,feedback]=await Promise.all([
    prisma.student.findUnique({where:{id:studentId},select:{timezone:true}}),
    prisma.studentPick.findMany({where:{studentId},include:{opportunity:true}}),
    prisma.savedOpportunity.findMany({where:{studentId,status:{not:'dismissed'}},select:{opportunityId:true}}),
    prisma.opportunityFeedback.findMany({where:{studentId},select:{opportunityId:true}}),
  ]);
  if(!student)throw new HttpError(401,'Please sign in again.');
  const now=new Date(),today=dkey(wallNow(student.timezone,now)),hidden=new Set(feedback.map(f=>f.opportunityId));
  return [...new Set([...picks.filter(p=>env.demoMode&&p.opportunity.isSample||activeOpportunity(p.opportunity,today,now)).map(p=>p.opportunityId),...saved.map(s=>s.opportunityId)])].filter(id=>!hidden.has(id));
}
export async function knowledgeScope(studentId:string,scope:string) {
  const ids=await studentOpportunityIds(studentId);
  if(scope!==MY_OPPORTUNITIES&&!ids.includes(scope))throw new HttpError(403,'Choose a program from your picks or Interested list.');
  return prisma.opportunity.findMany({where:{id:{in:scope===MY_OPPORTUNITIES?ids:[scope]}},orderBy:{name:'asc'}});
}
