import {beforeAll,beforeEach,afterEach,afterAll,it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PrismaClient,Prisma} from '@prisma/client';
const dir=mkdtempSync(join(tmpdir(),'pathway-growth-')),url=`file:${dir}/test.db`,db=new PrismaClient({datasourceUrl:url+'?connection_limit=1'});
vi.mock('../src/lib/db.js',()=>({get prisma(){return db;},j:(s:string,f:unknown)=>{try{return JSON.parse(s);}catch{return f;}}}));
import {buildApp} from '../src/app.js';
import {env} from '../src/lib/env.js';
import {seedGrowthCatalog} from '../src/growth-map/seed.js';
let app:Awaited<ReturnType<typeof buildApp>>,sid='';const originalCodes=env.accessCodes;
const call=(method:string,path:string,body?:unknown,studentId=sid)=>app.inject({method:method as any,url:path,headers:{'x-student-id':studentId},...(body!==undefined?{payload:body as any}:{})});
const map=async()=>{const r=await call('GET','/api/growth-map');expect(r.statusCode).toBe(200);return r.json();};
const capture=async(title='Built a Python prototype',date='2030-01-07')=>db.portfolioEntry.create({data:{studentId:sid,title,date,type:'project'}});
const tag=(type:string,id:string,tags:any[],extra={})=>call('POST',`/api/growth-map/activities/${type}/${id}`,{tags,...extra});
beforeAll(async()=>{writeFileSync(join(dir,'test.db'),'');await promisify(execFile)(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url}});app=await buildApp();app.log.level='silent';},30000);
beforeEach(async()=>{env.accessCodes=[];await db.student.deleteMany();sid=(await db.student.create({data:{name:'Student',grade:10,timezone:'America/New_York',interests:'["Coding","Music"]',aiConsent:false}})).id;vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2030-01-15T20:00:00Z'));});
afterEach(()=>vi.useRealTimers());
afterAll(async()=>{env.accessCodes=originalCodes;await app.close();await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
it('migrates a 70-skill versioned catalog and starts without invented evidence or AI work',async()=>{
 const r=await call('GET','/api/growth-map/catalog');expect(r.statusCode).toBe(200);expect(r.json().skills).toHaveLength(70);expect(await db.skill.count()).toBe(70);
 const data=await map();expect(data.skills).toEqual([]);expect(data.interests).toEqual(['Coding','Music']);expect(data.activityCount).toBe(0);expect(data.date).toBe('2030-01-15');
 expect(await db.aIUsage.count()).toBe(0);expect(r.headers['cache-control']).toBe('no-store');
});
it('suggests at most three catalog tags, requires explicit confirmation and preserves rejections',async()=>{
 const p=await capture();let list=(await call('GET','/api/growth-map/activities')).json();expect(list.items[0].suggestions).toContain('coding');expect(list.items[0].suggestions.length).toBeLessThanOrEqual(3);
 expect((await map()).skills).toEqual([]);expect(await db.skillEvidence.count()).toBe(0);
 expect((await tag('portfolio',p.id,[{skillId:'coding'}])).statusCode).toBe(200);
 let data=await map();expect(data.skills[0]).toMatchObject({id:'coding',count:1,highest:'Build',reached:['Build'],next:'Apply'});expect(data.reviewCount).toBe(0);
 expect((await tag('portfolio',p.id,[{skillId:'coding'}])).statusCode).toBe(200);expect(await db.skillEvidence.count()).toBe(1);
 expect((await tag('portfolio',p.id,[])).statusCode).toBe(200);expect((await map()).skills).toEqual([]);
 list=(await call('GET','/api/growth-map/activities?all=true')).json();expect(list.items[0].suggestions).not.toContain('coding');
});
it('supports manual catalog tags, stage correction and atomic rejection of invalid selections',async()=>{
 const old=await capture('An older experience');await db.portfolioEntry.update({where:{id:old.id},data:{skills:'["Creativity"]'}});expect((await call('GET','/api/growth-map/activities/portfolio/'+old.id)).json().suggestions).toContain('creative-thinking');
 const p=await capture('An untitled experience');expect((await tag('portfolio',p.id,[{skillId:'music',stage:'Present'}])).statusCode).toBe(200);
 const detail=(await call('GET','/api/growth-map/skills/music')).json();expect(detail.ladder.filter((r:any)=>r.reached).map((r:any)=>r.stage)).toEqual(['Present']);expect(detail.skill.next).toBe('Compete');
 expect((await tag('portfolio',p.id,[{skillId:'fake-skill'}])).statusCode).toBe(422);expect(await db.skillEvidence.count()).toBe(1);
 expect((await tag('portfolio',p.id,[{skillId:'coding'},{skillId:'coding'}])).statusCode).toBe(422);
 expect((await tag('portfolio',p.id,Array.from({length:11},(_,i)=>({skillId:'x'+i})))).statusCode).toBe(422);
});
it('keeps all reads and writes student-isolated, including source links and corrections',async()=>{
 const p=await capture();await tag('portfolio',p.id,[{skillId:'coding'}]);const other=await db.student.create({data:{name:'Other',grade:10}});
 for(const method of ['GET','POST'])expect((await call(method,`/api/growth-map/activities/portfolio/${p.id}`,method==='POST'?{tags:[{skillId:'coding'}]}:undefined,other.id)).statusCode).toBe(404);
 expect((await call('GET','/api/growth-map/skills/coding',undefined,other.id)).statusCode).toBe(404);
 expect((await call('PATCH','/api/growth-map/skills/coding',{replacementSkillId:'music'},other.id)).statusCode).toBe(404);
 expect((await app.inject({url:'/api/growth-map'})).statusCode).toBe(401);
});
it('groups completed study once per skill per local week and excludes future/reopened/deleted work',async()=>{
 for(const day of ['07','08','09']){const e=await db.event.create({data:{studentId:sid,title:'Python course practice',type:'study',start:`2030-01-${day}T17:00`,end:`2030-01-${day}T18:00`,done:true}});expect((await tag('study',e.id,[{skillId:'coding'}])).statusCode).toBe(200);}
 let data=await map();expect(data.skills[0].count).toBe(1);expect(data.activityCount).toBe(1);
 const detail=(await call('GET','/api/growth-map/skills/coding')).json();expect(detail.evidence[0].sources).toHaveLength(3);
 const first=detail.evidence[0].sources[0];expect((await tag('study',first.id,[{skillId:'coding',stage:'Compete'}])).statusCode).toBe(422);
 await db.event.updateMany({where:{studentId:sid},data:{done:false}});expect((await map()).skills).toEqual([]);
 await db.event.deleteMany({where:{studentId:sid}});expect((await map()).activityCount).toBe(0);
 const future=await capture('Python project','2030-02-02');expect((await tag('portfolio',future.id,[{skillId:'coding'}])).statusCode).toBe(422);expect((await map()).skills).toEqual([]);
});
it('deduplicates a captured milestone while preserving explicit stages and supports unlinking',async()=>{
 const g=await db.goal.create({data:{studentId:sid,title:'Learn coding',milestones:{create:{title:'Built Python app',status:'done',doneAt:new Date('2030-01-07T20:00Z')}}},include:{milestones:true}}),m=g.milestones[0],p=await capture();
 await tag('milestone',m.id,[{skillId:'coding'}]);expect((await tag('portfolio',p.id,[{skillId:'coding',stage:'Present'}],{linkedMilestoneId:m.id})).statusCode).toBe(200);
 expect((await map()).skills[0].count).toBe(1);expect((await map()).skills[0].reached).toEqual(['Build','Present']);expect((await call('GET','/api/growth-map/skills/coding')).json().evidence[0].sources).toHaveLength(2);
 await tag('portfolio',p.id,[{skillId:'coding'}],{linkedMilestoneId:null});expect((await map()).skills[0].count).toBe(2);
 await db.milestone.update({where:{id:m.id},data:{status:'todo',doneAt:null}});expect((await map()).skills[0].count).toBe(1);
 await db.portfolioEntry.delete({where:{id:p.id}});expect((await map()).skills).toEqual([]);
});
it('does not invent application participation or historical dates and prompts again after status changes',async()=>{
 await db.opportunity.upsert({where:{id:'growth-program'},update:{},create:{id:'growth-program',name:'Robotics competition',organizer:'Example',category:'Competition',url:'https://example.org/program',gradeMin:9,gradeMax:12,format:'Virtual',cost:'Free',commitment:'Low',skills:'["Robotics"]',tags:'[]',checks:'[]'}});
 await db.savedOpportunity.create({data:{studentId:sid,opportunityId:'growth-program',status:'interested'}});
 await tag('application','growth-program',[{skillId:'robotics'}]);expect((await map()).skills[0]).toMatchObject({count:0,highest:null});
 expect((await tag('application','growth-program',[{skillId:'robotics',stage:'Apply'}])).statusCode).toBe(422);
 expect((await call('PATCH','/api/applications/growth-program',{status:'applied'})).statusCode).toBe(200);
 const queue=(await call('GET','/api/growth-map/activities')).json();expect(queue.items).toHaveLength(1);expect(queue.items[0].date).toBe('2030-01-15');
 await tag('application','growth-program',[{skillId:'robotics',stage:'Apply'}]);expect((await map()).skills[0]).toMatchObject({count:1,highest:'Apply',reached:['Apply']});
 await db.auditEvent.deleteMany({where:{studentId:sid,event:'Updated application tracker'}});await db.growthReview.deleteMany({where:{studentId:sid}});
 expect((await tag('application','growth-program',[{skillId:'robotics',stage:'Apply'}])).statusCode).toBe(422);
 expect((await tag('application','growth-program',[{skillId:'robotics',stage:'Apply'}],{occurredOn:'2030-01-12'})).statusCode).toBe(200);
});
it('hides and restores evidence, clears hidden focus and keeps only one focus per local month',async()=>{
 const p=await capture();await tag('portfolio',p.id,[{skillId:'coding'},{skillId:'teamwork'}]);
 const results=await Promise.all(['coding','teamwork'].map(skillId=>call('POST','/api/growth-map/focus',{skillId})));expect(results.every(r=>r.statusCode===200)).toBe(true);expect(await db.growthFocus.count()).toBe(1);
 await call('POST','/api/growth-map/focus',{skillId:'coding'});await call('PATCH','/api/growth-map/skills/coding',{hidden:true});
 let data=await map();expect(data.skills.map((s:any)=>s.id)).not.toContain('coding');expect(data.hidden[0].count).toBe(1);expect(data.focusSkillId).toBeNull();expect(data.connections).toEqual([]);
 expect((await call('POST','/api/growth-map/focus',{skillId:'coding'})).statusCode).toBe(422);
 await call('PATCH','/api/growth-map/skills/coding',{hidden:false});expect((await map()).skills.find((s:any)=>s.id==='coding').count).toBe(1);
 await call('POST','/api/growth-map/focus',{skillId:'coding'});vi.setSystemTime(new Date('2030-02-02T20:00Z'));expect((await map()).focusSkillId).toBeNull();expect(await db.growthFocus.count()).toBe(1);
});
it('corrects only a student assignment and merges duplicates without changing the shared catalog',async()=>{
 const p=await capture();await tag('portfolio',p.id,[{skillId:'coding',stage:'Learn'},{skillId:'music',stage:'Build'}]);
 expect((await call('PATCH','/api/growth-map/skills/coding',{replacementSkillId:'music',area:'Creative'})).statusCode).toBe(200);
 const data=await map();expect(data.skills).toHaveLength(1);expect(data.skills[0]).toMatchObject({id:'music',count:1,highest:'Build',area:'Creative'});expect(await db.skill.count()).toBe(70);expect((await db.skill.findUniqueOrThrow({where:{id:'coding'}})).name).toBe('Coding');expect((await call('GET','/api/growth-map/activities/portfolio/'+p.id)).json().suggestions).not.toContain('coding');
});
it('links co-occurring skills and computes evidence trends without comparing students',async()=>{
 for(const date of ['2029-12-03','2030-01-03','2030-01-05','2030-01-07']){const p=await capture('Python team project',date);await tag('portfolio',p.id,[{skillId:'coding'},{skillId:'teamwork'}]);}
 const data=await map();expect(data.skills.find((s:any)=>s.id==='coding')).toMatchObject({count:4,thisMonth:3,previousAverage:.5,growing:true,recent:3});expect(data.connections).toContainEqual({a:'coding',b:'teamwork',count:4});expect(data.activityCount).toBe(4);
});
it('reviews historical sources in bounded batches and stores missing-skill requests for owner review',async()=>{
 for(let i=0;i<12;i++)await capture('Python work '+i);
 const first=(await call('GET','/api/growth-map/activities?limit=10')).json();expect(first.items).toHaveLength(10);expect(first.total).toBe(12);
 expect((await call('GET','/api/growth-map/activities?offset=10')).json().items).toHaveLength(2);
 expect((await call('GET','/api/growth-map/activities?limit=999')).statusCode).toBe(422);
 expect((await call('POST','/api/growth-map/skill-requests',{name:'Python'})).statusCode).toBe(422);
 const request=(await call('POST','/api/growth-map/skill-requests',{name:'Urban gardening'})).json();expect(request.status).toBe('pending');await call('POST','/api/growth-map/skill-requests',{name:'Urban Gardening'});expect(await db.skillRequest.count()).toBe(1);expect(await db.skill.count()).toBe(70);
});
it('exports private growth records and deletes them with the student while retaining the shared catalog',async()=>{
 const p=await capture();await tag('portfolio',p.id,[{skillId:'coding'}]);await call('POST','/api/growth-map/focus',{skillId:'coding'});await call('POST','/api/growth-map/skill-requests',{name:'Urban gardening'});
 const exported=(await call('GET','/api/me/export')).json();expect(exported.growthMap.evidence).toHaveLength(1);expect(exported.growthMap.focus).toHaveLength(1);expect(exported.growthMap.requests).toHaveLength(1);
 expect((await call('DELETE','/api/me')).statusCode).toBe(204);for(const model of [db.studentSkill,db.skillEvidence,db.skillTagSuggestion,db.growthFocus,db.growthReview,db.skillRequest] as any[])expect(await model.count()).toBe(0);expect(await db.skill.count()).toBe(70);
});
it('contains a missing Growth Map migration without failing session or Today',async()=>{
 const spy=vi.spyOn(db.skillEvidence,'findMany').mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Missing table',{code:'P2021',clientVersion:'test'}));
 try{expect((await call('GET','/api/growth-map')).statusCode).toBe(503);expect((await call('GET','/api/today')).statusCode).toBe(200);expect((await app.inject({url:'/api/auth/session'})).statusCode).toBe(200);}finally{spy.mockRestore();}
});

it('seeds a schema-only catalog safely and tolerates a pending feature migration at startup',async()=>{
 await db.skill.deleteMany();expect(await seedGrowthCatalog()).toEqual({available:true});expect(await db.skill.count()).toBe(70);
 expect(await seedGrowthCatalog()).toEqual({available:true});expect(await db.skill.count()).toBe(70);
 const spy=vi.spyOn(db.skill,'findFirst').mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Missing table',{code:'P2021',clientVersion:'test'}));
 try{expect(await seedGrowthCatalog()).toEqual({available:false});}finally{spy.mockRestore();}
});

it('requires confirmation again after source facts change instead of silently qualifying future work',async()=>{
 const e=await db.event.create({data:{studentId:sid,title:'Python practice',type:'study',start:'2030-01-07T17:00',end:'2030-01-07T18:00',done:true}});
 await tag('study',e.id,[{skillId:'coding'}]);expect((await map()).skills[0].count).toBe(1);
 await db.event.update({where:{id:e.id},data:{start:'2030-02-01T17:00',end:'2030-02-01T18:00'}});expect((await map()).skills[0].count).toBe(0);
 vi.setSystemTime(new Date('2030-02-02T20:00Z'));expect((await map()).skills[0].count).toBe(0);
 expect((await call('GET','/api/growth-map/activities')).json().items[0].reviewed).toBe(false);
 await tag('study',e.id,[{skillId:'coding'}]);expect((await map()).skills[0].count).toBe(1);
});
