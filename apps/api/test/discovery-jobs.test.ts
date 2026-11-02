import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const remote=vi.hoisted(()=>({discover:vi.fn(async()=>[]),reconcile:vi.fn(async()=>0)}));
vi.mock('../src/knowledge/runtime.js',()=>({initializeKnowledge:async()=>({}),knowledgeUnavailable:()=>null}));
vi.mock('../src/discovery/pipeline.js',async()=>({...await vi.importActual('../src/discovery/pipeline.js'),discover:remote.discover}));
vi.mock('../src/knowledge/service.js',async()=>({...await vi.importActual('../src/knowledge/service.js'),reconcileVectors:remote.reconcile}));
const dir=mkdtempSync(join(tmpdir(),'pathway-jobs-')),url=`file:${dir}/test.db`,db=new PrismaClient({datasourceUrl:url+'?connection_limit=1'});
vi.mock('../src/lib/db.js',()=>({get prisma(){return db;},j:(v:string,f:unknown)=>{try{return v?JSON.parse(v):f;}catch{return f;}}}));
import {withJobLock,reserveRun,runJobs,expireCatalog,recheckOpportunity} from '../src/discovery/jobs.js';
import {useManualRefresh,noteInterestChange,queueDiscovery,refreshStatus} from '../src/discovery/refresh.js';import {RunBudget} from '../src/discovery/config.js';import {Extraction} from '../src/discovery/extraction.js';import {buildApp} from '../src/app.js';import {env} from '../src/lib/env.js';
const originalDisabled=env.aiDisabled,originalCodes=env.accessCodes;let studentId='';
beforeAll(async()=>{writeFileSync(join(dir,'test.db'),'');await promisify(execFile)(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url}});},30000);
beforeEach(async()=>{vi.unstubAllEnvs();vi.stubEnv('DISCOVERY_ENABLED','true');vi.stubEnv('AI_DISABLED','false');vi.stubEnv('SEARCH_PROVIDER','openai');vi.stubEnv('OPENAI_API_KEY','test');vi.stubEnv('DISCOVERY_RECHECKS_PER_MONTH','0');env.aiDisabled=false;env.accessCodes=[];
 await db.student.deleteMany();await db.opportunity.deleteMany();await db.discoveryGroup.deleteMany();await db.jobLease.deleteMany();await db.discoveryRun.deleteMany();await db.discoveryUsage.deleteMany();await db.aIUsage.deleteMany();remote.discover.mockClear();remote.reconcile.mockClear();studentId=(await db.student.create({data:{name:'Private name',grade:10,interests:'["robotics"]',region:'NC'}})).id;
 for(let i=0;i<4;i++)await db.opportunity.create({data:{id:`paid${i}`,name:`Paid ${i}`,organizer:'Org',category:'Program',url:'https://example.edu',gradeMin:9,gradeMax:12,format:'Virtual',region:'["virtual"]',cost:'$30',costType:'paid',commitment:'Low',skills:'[]',tags:'["robotics"]'}});
});
afterAll(async()=>{env.aiDisabled=originalDisabled;env.accessCodes=originalCodes;vi.unstubAllEnvs();await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
it('enforces one manual refresh plus at most one meaningful-interest bonus per 30-day cycle',async()=>{
 const now=new Date('2029-01-01');expect((await refreshStatus(studentId,now)).remaining).toBe(1);await useManualRefresh(studentId,now);await expect(useManualRefresh(studentId,now)).rejects.toThrow('next opportunity refresh');
 await noteInterestChange(studentId,['robotics'],[' ROBOTICS '],now);expect((await refreshStatus(studentId,now)).remaining).toBe(0);
 await noteInterestChange(studentId,['robotics'],['art'],now);expect((await refreshStatus(studentId,now)).remaining).toBe(1);await useManualRefresh(studentId,now);await noteInterestChange(studentId,['art'],['robotics'],now);await expect(useManualRefresh(studentId,now)).rejects.toThrow('next opportunity refresh');
 expect((await refreshStatus(studentId,new Date('2029-02-01'))).remaining).toBe(1);
});
it('shares a group, queues only a short bucket and respects the 30-day discovery cooldown',async()=>{
 const now=new Date();await queueDiscovery(studentId,now);const group=await db.discoveryGroup.findFirstOrThrow();expect(JSON.parse(group.pendingBuckets)).toEqual(['free']);
 const other=await db.student.create({data:{name:'Different student',grade:9,region:'NC',interests:'["Robotics"]'}});await queueDiscovery(other.id,now);expect(await db.discoveryGroup.count()).toBe(1);
 await db.discoveryGroup.update({where:{key:group.key},data:{status:'idle',lastDiscoveredAt:now,pendingBuckets:'[]'}});await queueDiscovery(studentId,now);expect((await db.discoveryGroup.findFirstOrThrow()).status).toBe('idle');
 await queueDiscovery(studentId,new Date(+now+31*86400000));expect((await db.discoveryGroup.findFirstOrThrow()).status).toBe('queued');
});
it('reserves the overall discovery budget atomically and never starts an unfunded run',async()=>{
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','1');const results=await Promise.all([reserveRun('one','discovery'),reserveRun('two','discovery')]);expect(results.filter(Boolean)).toHaveLength(1);expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);expect(await db.discoveryRun.count()).toBe(1);
});
it('prevents overlapping workers and releases the lease after an error',async()=>{
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);let started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve);
 const first=withJobLock('test',async()=>{started();await pending;return 'done';});await ready;expect(await withJobLock('test',async()=>'duplicate')).toEqual({skipped:true});release();expect(await first).toMatchObject({skipped:false,result:'done'});
 await expect(withJobLock('test',async()=>{throw new Error('failure');})).rejects.toThrow('failure');expect(await withJobLock('test',async()=>'retry')).toMatchObject({skipped:false,result:'retry'});
});
it('runs due discovery once, persists usage and keeps catalog-only mode when AI is disabled',async()=>{
 await queueDiscovery(studentId);await runJobs();await runJobs();expect(remote.discover).toHaveBeenCalledTimes(1);expect((await db.discoveryRun.findFirstOrThrow()).status).toBe('complete');expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);expect(remote.reconcile).toHaveBeenCalledTimes(1);
 vi.stubEnv('AI_DISABLED','true');await db.discoveryGroup.updateMany({data:{lastDiscoveredAt:null,status:'queued'}});await runJobs();expect(remote.discover).toHaveBeenCalledTimes(1);
});
it('marks expiry, removes picks and keeps a source-backed deadline and the student application',async()=>{
 const yesterday=new Date(Date.now()-2*86400000).toISOString().slice(0,10);await db.opportunity.update({where:{id:'paid0'},data:{deadline:yesterday,sourceCheckedAt:new Date(),verificationStatus:'verified',evidence:JSON.stringify({deadline:{sourceUrl:'https://example.edu',quote:yesterday}})}});
 await db.savedOpportunity.create({data:{studentId,opportunityId:'paid0',notes:'Keep my notes'}});await db.studentPick.create({data:{studentId,opportunityId:'paid0',bucket:'paid',rank:0,refreshCycle:'test'}});expect(await expireCatalog()).toBe(1);expect(await db.studentPick.count()).toBe(0);
 const app=await buildApp();app.log.level='silent';try{const r=await app.inject({url:'/api/applications',headers:{'x-student-id':studentId}});expect(r.json()[0]).toMatchObject({notes:'Keep my notes',deadline:yesterday,deadlinePassed:true});}finally{await app.close();}
});
it('rechecks changed pages, re-ingests their knowledge, and marks unreachable sources stale',async()=>{
 const sourceUrl='https://example.edu',text='Paid 0 is organized by Org. Grades 9–12. Participation is free.';
 const facts=Extraction.parse({...Object.fromEntries(Object.keys(Extraction.shape).map(k=>[k,null])),name:'Paid 0',organizer:'Org',gradeMin:9,gradeMax:12,costType:'free',evidence:Object.fromEntries(['name','organizer','gradeMin','gradeMax','costType'].map(k=>[k,{sourceUrl,quote:k==='costType'?'Participation is free.':text}]))});
 const fetch=vi.fn().mockResolvedValue({sourceUrl,pageTitle:'Program',text,contentHash:'new',checkedAt:new Date(),links:[]}),extract=vi.fn().mockResolvedValue(facts),ingest=vi.fn().mockResolvedValue(undefined);
 await recheckOpportunity('paid0',new RunBudget(),{fetch,extract,ingest});expect(ingest).toHaveBeenCalledWith('paid0',expect.any(RunBudget));expect((await db.sourcePage.findFirstOrThrow()).contentHash).toBe('new');
 fetch.mockRejectedValue(new Error('unavailable'));await expect(recheckOpportunity('paid0',new RunBudget(),{fetch,extract,ingest})).rejects.toThrow('unavailable');expect((await db.opportunity.findUniqueOrThrow({where:{id:'paid0'}})).verificationStatus).toBe('stale');expect((await db.sourcePage.findFirstOrThrow()).text).toBe(text);
});
it('protects the cron endpoint with an owner secret',async()=>{
 vi.stubEnv('JOBS_SECRET','a-secret-with-more-than-32-characters-for-jobs');vi.stubEnv('AI_DISABLED','true');const app=await buildApp();app.log.level='silent';try{
 expect((await app.inject({method:'POST',url:'/internal/jobs/run'})).statusCode).toBe(401);expect((await app.inject({method:'POST',url:'/internal/jobs/run',headers:{authorization:'Bearer wrong'}})).statusCode).toBe(401);expect((await app.inject({method:'POST',url:'/internal/jobs/run',headers:{authorization:`Bearer ${process.env.JOBS_SECRET}`}})).statusCode).toBe(200);
 }finally{await app.close();}
});
it('rechecks at the seven-day boundary even if the previous check was only yesterday',async()=>{
 const {recheckDue}=await import('../src/domain/refresh.js');expect(recheckDue({deadline:'2030-01-10',lastRecheckedAt:new Date('2030-01-02')},new Date('2030-01-03T12:00:00Z'))).toBe(true);expect(recheckDue({deadline:'2030-01-10',lastRecheckedAt:new Date('2030-01-03')},new Date('2030-01-04'))).toBe(false);
});

it('respects the existing overall AI monthly cap without charging any student daily allowance',async()=>{
 vi.stubEnv('AI_MONTHLY_LIMIT','0');expect(await reserveRun('robotics','discovery')).toBeNull();expect(await db.discoveryRun.count()).toBe(0);expect(await db.discoveryUsage.count()).toBe(0);
 vi.stubEnv('AI_MONTHLY_LIMIT','1');expect(await reserveRun('robotics','discovery')).not.toBeNull();expect(await reserveRun('program','recheck')).toBeNull();expect(await db.aIUsage.count({where:{key:{startsWith:'day:'}}})).toBe(0);
});
