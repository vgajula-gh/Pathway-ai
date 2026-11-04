import type {FastifyInstance} from 'fastify';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {requireStudent,HttpError} from '../lib/auth.js';
import {prisma,j} from '../lib/db.js';
import {wallNow,dkey} from '../domain/time.js';
import {CalendarDate} from '../domain/applications.js';
import {SKILL_CATALOG,AREAS,CATALOG_VERSION} from '../growth-map/catalog.js';
import {STAGES,STAGE_DESCRIPTION,sourceKey} from '../domain/growth-map.js';
import {growthSnapshot,confirmTags,editGrowthSkill,growthWrite} from '../growth-map/service.js';
const params=z.object({type:z.enum(['portfolio','milestone','study','application']),id:z.string().min(1).max(200)});
export default async function routes(app:FastifyInstance){
  // Isolate a pending migration from all existing session/Today/Explore routes.
  app.setErrorHandler((err,_req,reply)=>{if(err instanceof Prisma.PrismaClientKnownRequestError&&['P2021','P2022'].includes(err.code))return reply.code(503).send({error:'Growth Map setup is not ready yet. Your other Pathway features are available.'});throw err;});
  app.addHook('onRequest',async(_req,reply)=>{reply.header('Cache-Control','no-store');});
  app.get('/api/growth-map/catalog',async req=>{await requireStudent(req);return {version:CATALOG_VERSION,areas:AREAS,skills:SKILL_CATALOG};});
  app.get('/api/growth-map',async req=>{const s=await requireStudent(req),snapshot=await growthSnapshot(s);return {...snapshot.map,interests:j<string[]>(s.interests,[])};});
  app.get('/api/growth-map/activities',async req=>{
    const s=await requireStudent(req),q=z.object({offset:z.coerce.number().int().min(0).default(0),limit:z.coerce.number().int().min(1).max(20).default(10),all:z.enum(['true','false']).default('false')}).parse(req.query),snapshot=await growthSnapshot(s);
    const list=q.all==='true'?snapshot.activities:snapshot.activities.filter(a=>!a.reviewed);
    return {items:list.slice(q.offset,q.offset+q.limit),total:list.length,offset:q.offset,limit:q.limit,all:q.all==='true'};
  });
  app.get('/api/growth-map/activities/:type/:id',async req=>{const s=await requireStudent(req),p=params.parse(req.params),data=await growthSnapshot(s),source=data.sources.find(a=>a.type===p.type&&a.id===p.id);if(!source)throw new HttpError(404,'This activity is no longer available.');const review=data.reviews.find(r=>r.sourceType===p.type&&r.sourceId===p.id);
    let original:Record<string,unknown>={};
    if(p.type==='study'){const e=await prisma.event.findFirst({where:{id:p.id,studentId:s.id}});if(e)original={start:e.start,end:e.end,status:e.done?'Completed':'Not complete'};}
    if(p.type==='milestone'){const m=await prisma.milestone.findFirst({where:{id:p.id,goal:{studentId:s.id}},include:{goal:true}});if(m)original={goalTitle:m.goal.title,purpose:m.purpose,status:m.status};}
    if(p.type==='application'){const a=await prisma.savedOpportunity.findUnique({where:{studentId_opportunityId:{studentId:s.id,opportunityId:p.id}}});if(a)original={status:a.status,notes:a.notes,deadline:a.deadline??''};}
    return {...data.view(source),date:source.date??review?.occurredOn??null,reflection:source.reflection??'',linkedMilestoneId:review?.linkedMilestoneId??null,original};});
  app.post('/api/growth-map/activities/:type/:id',async req=>{
    const s=await requireStudent(req),p=params.parse(req.params),body=z.object({tags:z.array(z.object({skillId:z.string().max(80),stage:z.enum(STAGES).nullable().optional()})).max(10).refine(tags=>new Set(tags.map(t=>t.skillId)).size===tags.length,'Do not repeat a skill.'),occurredOn:CalendarDate.optional(),linkedMilestoneId:z.string().min(1).max(200).nullable().optional()}).parse(req.body);
    return confirmTags(s,p.type,p.id,body);
  });
  app.get('/api/growth-map/skills/:id',async req=>{const s=await requireStudent(req),{id}=z.object({id:z.string().max(80)}).parse(req.params),data=await growthSnapshot(s),skill=[...data.map.skills,...data.map.hidden].find(k=>k.id===id);if(!skill)throw new HttpError(404,'Skill not found.');return {skill,evidence:data.evidence.filter(e=>e.skillId===id),interestSources:data.tags.filter(t=>t.skillId===id&&!t.stage).flatMap(t=>{const s=data.sources.find(s=>s.key===sourceKey(t.sourceType,t.sourceId));return s?[data.view(s)]:[];}),ladder:STAGES.map(stage=>({stage,description:STAGE_DESCRIPTION[stage],reached:skill.reached.includes(stage),next:skill.next===stage})),connections:data.map.connections.filter(c=>c.a===id||c.b===id)};});
  app.patch('/api/growth-map/skills/:id',async req=>{const s=await requireStudent(req),{id}=z.object({id:z.string().max(80)}).parse(req.params),body=z.object({hidden:z.boolean().optional(),area:z.enum(AREAS).optional(),replacementSkillId:z.string().max(80).optional()}).refine(b=>Object.keys(b).length>0).parse(req.body);return editGrowthSkill(s,id,body);});
  app.post('/api/growth-map/focus',async req=>{const s=await requireStudent(req),{skillId}=z.object({skillId:z.string().max(80).nullable()}).parse(req.body),month=dkey(wallNow(s.timezone)).slice(0,7);return growthWrite(async tx=>{
    if(skillId){const skill=await tx.studentSkill.findUnique({where:{studentId_skillId:{studentId:s.id,skillId}}});if(!skill||skill.status==='hidden')throw new HttpError(422,'Choose a visible confirmed skill.');await tx.growthFocus.upsert({where:{studentId_month:{studentId:s.id,month}},create:{studentId:s.id,month,skillId},update:{skillId}});}else await tx.growthFocus.deleteMany({where:{studentId:s.id,month}});
    await tx.auditEvent.create({data:{studentId:s.id,actor:'student',event:'Changed Growth Map focus',record:skillId??'cleared'}});return {ok:true};
  });});
  app.post('/api/growth-map/skill-requests',async req=>{const s=await requireStudent(req),{name}=z.object({name:z.string().trim().min(2).max(80)}).parse(req.body);if(SKILL_CATALOG.some(k=>k.name.toLowerCase()===name.toLowerCase()||k.synonyms.includes(name.toLowerCase())))throw new HttpError(422,'That skill or synonym is already in the catalog.');const request=await prisma.skillRequest.upsert({where:{studentId_name:{studentId:s.id,name:name.toLowerCase()}},create:{studentId:s.id,name:name.toLowerCase()},update:{}});await prisma.auditEvent.create({data:{studentId:s.id,actor:'student',event:'Suggested catalog skill',record:request.id}});return {id:request.id,status:request.status};});
}
