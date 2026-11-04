import type {Prisma} from '@prisma/client';
import {j} from '../lib/db.js';
import {env} from '../lib/env.js';
import {dkey,wallNow} from '../domain/time.js';
import {validDate,sourceKey,STAGES,pastActivityDate,endedStudy,portfolioStage,milestoneStage,applicationStages,type GrowthSource} from '../domain/growth-map.js';
export async function growthSources(db:Prisma.TransactionClient,student:{id:string;timezone:string},now=wallNow(student.timezone)):Promise<GrowthSource[]> {
  const [portfolio,goals,study,saved,audits]=await Promise.all([
    db.portfolioEntry.findMany({where:{studentId:student.id,type:{not:'growth_letter'}}}),db.goal.findMany({where:{studentId:student.id},include:{milestones:true}}),
    db.event.findMany({where:{studentId:student.id,type:'study',done:true,...(env.demoMode?{}:{source:{not:'sample'}})}}),
    db.savedOpportunity.findMany({where:{studentId:student.id,status:{not:'dismissed'}}}),
    db.auditEvent.findMany({where:{studentId:student.id,event:'Updated application tracker'},orderBy:{at:'asc'}})
  ]);
  const opps=await db.opportunity.findMany({where:{id:{in:saved.map(s=>s.opportunityId)}}}),oppsById=new Map(opps.map(o=>[o.id,o]));
  const applied=new Map<string,string>();
  for(const audit of audits){const r=j<{opportunityId?:string;status?:string;occurredOn?:string}>(audit.record,{});if(r.status==='applied'&&r.opportunityId)applied.set(r.opportunityId,r.occurredOn&&validDate(r.occurredOn)?r.occurredOn:dkey(wallNow(student.timezone,audit.at)));}
  const dated=(date:string)=>pastActivityDate(date,now);
  const sources:GrowthSource[]=[];
  for(const p of portfolio){
    const stage=portfolioStage(p.type);
    sources.push({key:sourceKey('portfolio',p.id),type:'portfolio',id:p.id,title:p.title,date:p.date,kind:p.type,defaultStage:stage,allowedStages:[...STAGES],eligible:dated(p.date),note:'Self-reported experience. Confirm only skills you used.',text:p.title+' '+p.type+' '+j<string[]>(p.skills,[]).join(' '),reflection:p.reflection});
  }
  for(const goal of goals)for(const m of goal.milestones)if(m.status==='done'&&m.doneAt){const date=dkey(wallNow(student.timezone,m.doneAt));sources.push({key:sourceKey('milestone',m.id),type:'milestone',id:m.id,title:m.title,date,revision:m.doneAt.toISOString(),kind:'Completed goal step',defaultStage:milestoneStage(m.title),allowedStages:[...STAGES],eligible:dated(date),note:'Completed step in '+goal.title,text:goal.title+' '+m.title});}
  for(const e of study)if(!j<number[]>(e.recurDays,[]).length){const date=e.end.slice(0,10);sources.push({key:sourceKey('study',e.id),type:'study',id:e.id,title:e.title,date,revision:e.start+'|'+e.end,kind:'Completed study',defaultStage:'Learn',allowedStages:['Learn'],eligible:endedStudy(e.end,now),note:'Confirm skills from the subject you actually studied. Grouped once per skill per week.',text:e.title});}
  for(const a of saved){const o=oppsById.get(a.opportunityId);if(!o)continue;const stages=applicationStages(a.status,o.category),done=stages.eligible,date=done?applied.get(a.opportunityId)??null:a.createdAt.toISOString().slice(0,10);sources.push({key:sourceKey('application',a.opportunityId),type:'application',id:a.opportunityId,title:o.name,date,revision:a.status,kind:done?'Application action':'Interested opportunity',...stages,note:done?'An application is not evidence of program attendance. Confirm the date; choose Compete only if you actually entered.':'Interested tags describe an interest and do not advance your ladder.',text:o.name+' '+o.category+' '+j<string[]>(o.skills,[]).join(' ')+' '+j<string[]>(o.tags,[]).join(' ')});}
  return sources.sort((a,b)=>(b.date??'').localeCompare(a.date??'')||a.key.localeCompare(b.key));
}
