import {Prisma} from '@prisma/client';
import {prisma} from '../lib/db.js';
import {HttpError} from '../lib/auth.js';
import {dkey,wallNow} from '../domain/time.js';
import {SKILL_CATALOG} from './catalog.js';
import {evidenceFor,skillSignals,connectionsFor,suggestSkills,sourceKey,sourceStateOf,STAGES,type GrowthSource,type Stage} from '../domain/growth-map.js';
import {growthSources} from './sources.js';
export type GrowthStudent={id:string;timezone:string;interests:string};
const publicSource=(s:GrowthSource)=>{const {text,reflection,revision,...rest}=s;return rest;};
export async function growthSnapshot(student:GrowthStudent,db:Prisma.TransactionClient=prisma,now=wallNow(student.timezone)) {
  const [sources,tags,skills,reviews,suggestions,focus]=await Promise.all([
    growthSources(db,student,now),db.skillEvidence.findMany({where:{studentId:student.id}}),db.studentSkill.findMany({where:{studentId:student.id}}),
    db.growthReview.findMany({where:{studentId:student.id}}),db.skillTagSuggestion.findMany({where:{studentId:student.id}}),db.growthFocus.findUnique({where:{studentId_month:{studentId:student.id,month:dkey(now).slice(0,7)}}})
  ]);
  const evidence=evidenceFor(tags,sources,reviews,now),hiddenIds=new Set(skills.filter(s=>s.status==='hidden').map(s=>s.skillId));
  const items=skills.map(s=>{const cat=SKILL_CATALOG.find(c=>c.id===s.skillId)!;return {...cat,area:s.areaOverride??cat.area,hidden:s.status==='hidden',focus:focus?.skillId===s.skillId,...skillSignals(evidence.filter(e=>e.skillId===s.skillId),now)};});
  const liveKeys=new Set(sources.map(s=>s.key));
  const visible=items.filter(s=>!s.hidden&&tags.some(t=>t.skillId===s.id&&liveKeys.has(sourceKey(t.sourceType,t.sourceId)))).sort((a,b)=>Number(b.focus)-Number(a.focus)||b.count-a.count||(b.lastActivity??'').localeCompare(a.lastActivity??'')||a.name.localeCompare(b.name));
  const reviewKeys=new Map(reviews.map(r=>[sourceKey(r.sourceType,r.sourceId),r.sourceState]));
  const view=(s:GrowthSource)=>({...publicSource(s),reviewed:reviewKeys.get(s.key)===sourceStateOf(s),tags:tags.filter(t=>t.sourceType===s.type&&t.sourceId===s.id).map(t=>({skillId:t.skillId,stage:t.stage})),suggestions:suggestSkills(s.text).filter(id=>!hiddenIds.has(id)&&!suggestions.some(t=>t.sourceType===s.type&&t.sourceId===s.id&&t.skillId===id&&t.status==='rejected'))});
  const activities=sources.map(view);
  return {now,sources,tags,skills,reviews,evidence,activities,view,map:{date:dkey(now),month:dkey(now).slice(0,7),skills:visible,hidden:items.filter(s=>s.hidden),connections:connectionsFor(tags,sources,new Set(visible.map(s=>s.id)),reviews),activityCount:new Set(evidence.filter(e=>!hiddenIds.has(e.skillId)).map(e=>e.key)).size,reviewCount:activities.filter(a=>!a.reviewed).length,suggestedCount:activities.filter(a=>!a.reviewed).reduce((n,a)=>n+a.suggestions.length,0),focusSkillId:visible.find(s=>s.focus)?.id??null}};
}
/** Retry only a rolled-back database conflict; no provider or external side effect. */
export async function growthWrite<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T> {
  for(let attempt=0;;attempt++)try{return await prisma.$transaction(work,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});}
  catch(e){if(attempt<3&&e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002','P1008'].includes(e.code))continue;throw e;}
}
export async function confirmTags(student:GrowthStudent,type:string,id:string,input:{tags:{skillId:string;stage?:Stage|null}[];occurredOn?:string;linkedMilestoneId?:string|null}) {
  return growthWrite(async tx=>{
    const now=wallNow(student.timezone),sources=await growthSources(tx,student,now),source=sources.find(s=>s.type===type&&s.id===id);
    if(!source)throw new HttpError(404,'This activity is no longer available.');
    if(input.tags.length&&!source.eligible&&source.allowedStages.length)throw new HttpError(422,'This activity is future-dated or has not ended. Confirm its skills after it is complete.');
    const selected=input.tags.map(t=>t.skillId);
    if(selected.some(id=>!SKILL_CATALOG.some(s=>s.id===id&&s.active)))throw new HttpError(422,'Choose a skill from the catalog.');
    const prior=await tx.growthReview.findUnique({where:{studentId_sourceType_sourceId:{studentId:student.id,sourceType:type,sourceId:id}}});
    const occurredOn=source.date??input.occurredOn??prior?.occurredOn??null;
    if(input.tags.length&&source.type==='application'&&source.eligible&&(!occurredOn||occurredOn>dkey(now)))throw new HttpError(422,'Confirm the date you applied or entered; it cannot be in the future.');
    const linkedMilestoneId=input.linkedMilestoneId===undefined?prior?.linkedMilestoneId??null:input.linkedMilestoneId;
    if(linkedMilestoneId&&(type!=='portfolio'||!sources.some(s=>s.type==='milestone'&&s.id===linkedMilestoneId)))throw new HttpError(422,'Link only to your own completed goal step.');
    await tx.skillEvidence.deleteMany({where:{studentId:student.id,sourceType:type,sourceId:id,skillId:{notIn:selected}}});
    for(const tag of input.tags){
      const stage=tag.stage===undefined?source.defaultStage:tag.stage;
      if(stage?!source.allowedStages.includes(stage):source.allowedStages.length>0)throw new HttpError(422,'Choose a stage supported by this activity.');
      await tx.studentSkill.upsert({where:{studentId_skillId:{studentId:student.id,skillId:tag.skillId}},create:{studentId:student.id,skillId:tag.skillId},update:{}});
      await tx.skillEvidence.upsert({where:{studentId_sourceType_sourceId_skillId:{studentId:student.id,sourceType:type,sourceId:id,skillId:tag.skillId}},create:{studentId:student.id,sourceType:type,sourceId:id,skillId:tag.skillId,stage},update:{stage}});
    }
    const previous=await tx.skillTagSuggestion.findMany({where:{studentId:student.id,sourceType:type,sourceId:id}});
    for(const skillId of new Set([...suggestSkills(source.text),...selected,...previous.map(p=>p.skillId)]))await tx.skillTagSuggestion.upsert({where:{studentId_sourceType_sourceId_skillId:{studentId:student.id,sourceType:type,sourceId:id,skillId}},create:{studentId:student.id,sourceType:type,sourceId:id,skillId,status:selected.includes(skillId)?'confirmed':'rejected',origin:suggestSkills(source.text).includes(skillId)?'rule':'student'},update:{status:selected.includes(skillId)?'confirmed':'rejected'}});
    await tx.growthReview.upsert({where:{studentId_sourceType_sourceId:{studentId:student.id,sourceType:type,sourceId:id}},create:{studentId:student.id,sourceType:type,sourceId:id,occurredOn,sourceState:sourceStateOf(source),linkedMilestoneId},update:{occurredOn,sourceState:sourceStateOf(source),linkedMilestoneId,reviewedAt:new Date()}});
    await tx.auditEvent.create({data:{studentId:student.id,actor:'student',event:'Confirmed Growth Map skills',record:source.key}});
    return {ok:true};
  });
}
export async function editGrowthSkill(student:GrowthStudent,id:string,input:{hidden?:boolean;area?:string;replacementSkillId?:string}) {
  return growthWrite(async tx=>{
    const where={studentId_skillId:{studentId:student.id,skillId:id}},old=await tx.studentSkill.findUnique({where});if(!old)throw new HttpError(404,'Skill not found.');
    if(input.replacementSkillId&&input.replacementSkillId!==id){
      const to=input.replacementSkillId;if(!SKILL_CATALOG.some(s=>s.id===to&&s.active))throw new HttpError(422,'Choose a catalog skill.');
      await tx.studentSkill.upsert({where:{studentId_skillId:{studentId:student.id,skillId:to}},create:{studentId:student.id,skillId:to,status:old.status,areaOverride:input.area??old.areaOverride},update:input.area?{areaOverride:input.area}:{}});
      for(const e of await tx.skillEvidence.findMany({where:{studentId:student.id,skillId:id}})){
        const key={studentId_sourceType_sourceId_skillId:{studentId:student.id,sourceType:e.sourceType,sourceId:e.sourceId,skillId:to}},existing=await tx.skillEvidence.findUnique({where:key});
        const stage=existing&&STAGES.indexOf(existing.stage as Stage)>STAGES.indexOf(e.stage as Stage)?existing.stage:e.stage;
        await tx.skillEvidence.upsert({where:key,create:{studentId:student.id,skillId:to,sourceType:e.sourceType,sourceId:e.sourceId,stage},update:{stage}});
      }
      await tx.skillEvidence.deleteMany({where:{studentId:student.id,skillId:id}});
      for(const suggestion of await tx.skillTagSuggestion.findMany({where:{studentId:student.id,skillId:id,status:'confirmed'}}))await tx.skillTagSuggestion.upsert({where:{studentId_sourceType_sourceId_skillId:{studentId:student.id,sourceType:suggestion.sourceType,sourceId:suggestion.sourceId,skillId:to}},create:{studentId:student.id,sourceType:suggestion.sourceType,sourceId:suggestion.sourceId,skillId:to,origin:'student',status:'confirmed'},update:{status:'confirmed'}});
      await tx.skillTagSuggestion.updateMany({where:{studentId:student.id,skillId:id,status:'confirmed'},data:{status:'rejected'}});await tx.growthFocus.updateMany({where:{studentId:student.id,skillId:id},data:{skillId:to}});await tx.studentSkill.delete({where});
    } else {
      await tx.studentSkill.update({where,data:{...(input.hidden!==undefined?{status:input.hidden?'hidden':'confirmed'}:{}),...(input.area?{areaOverride:input.area}:{})}});
      if(input.hidden)await tx.growthFocus.deleteMany({where:{studentId:student.id,skillId:id,month:dkey(wallNow(student.timezone)).slice(0,7)}});
    }
    await tx.auditEvent.create({data:{studentId:student.id,actor:'student',event:'Edited Growth Map skill',record:id}});return {ok:true};
  });
}
