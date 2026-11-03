import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const remote=vi.hoisted(()=>({discover:vi.fn(async(..._args:unknown[]):Promise<string[]>=>[]),reconcile:vi.fn(async()=>0)}));
vi.mock('../src/knowledge/preparation.js',()=>({prepareKnowledgeBatch:async()=>0,knowledgeStates:async()=>({})}));
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
 for(let i=0;i<4;i++)await db.opportunity.create({data:{id:`paid${i}`,name:`Paid ${i}`,organizer:'Org',isSample:false,source:'discovery',verificationStatus:'verified',verifiedAt:new Date(),sourceCheckedAt:new Date(),deadline:'2030-12-01',evidence:JSON.stringify({deadline:{sourceUrl:'https://example.edu',quote:'Apply by 2030-12-01'}}),category:'Program',url:'https://example.edu',gradeMin:9,gradeMax:12,format:'Virtual',region:'["virtual"]',cost:'$30',costType:'paid',commitment:'Low',skills:'[]',tags:'["robotics"]'}});
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
 await queueDiscovery(studentId,new Date(+now+31*86400000));expect((await db.discoveryGroup.findFirstOrThrow()).status).toBe('queued_manual');
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

it('coalesces first visits across students and never starts a paid run from a status read',async()=>{
 await Promise.all([queueDiscovery(studentId),queueDiscovery(studentId)]);expect(await db.opportunitySearchRequest.count()).toBe(1);expect(await db.discoveryRun.count()).toBe(0);
 expect((await refreshStatus(studentId)).remaining).toBe(1);
});
it('charges a manual allowance only once after a successful search, including an honest empty result',async()=>{
 const {enqueueSearch,settleSearchRequests}=await import('../src/discovery/requests.js');
 await enqueueSearch(studentId,'manual');expect((await refreshStatus(studentId)).remaining).toBe(1);
 await runJobs();await settleSearchRequests(studentId);await settleSearchRequests(studentId);
 expect((await refreshStatus(studentId)).remaining).toBe(0);expect((await db.opportunitySearchRequest.findFirstOrThrow()).status).toBe('empty');
 expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);
});
it('does not debit a failed search, keeps global paid attempts counted and permits explicit retry',async()=>{
 const {enqueueSearch}=await import('../src/discovery/requests.js');remote.discover.mockRejectedValueOnce(new Error('provider failed with private details'));
 await enqueueSearch(studentId,'manual');await runJobs();const request=await db.opportunitySearchRequest.findFirstOrThrow();expect(request.status).toBe('failed');expect(request.error).not.toContain('private');expect(request.countedAt).toBeNull();expect((await refreshStatus(studentId)).remaining).toBe(1);
 expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);await queueDiscovery(studentId);expect(await db.opportunitySearchRequest.count()).toBe(1);
 await enqueueSearch(studentId,'manual');expect(await db.opportunitySearchRequest.count()).toBe(2);
});
it('reuses a full active catalog on both first use and explicit Search again without web work',async()=>{
 for(let i=0;i<3;i++)await db.opportunity.create({data:{id:'free'+i,name:'Free '+i,organizer:'Org',source:'discovery',isSample:false,verificationStatus:'verified',verifiedAt:new Date(),sourceCheckedAt:new Date(),category:'Program',url:'https://example.edu',gradeMin:9,gradeMax:12,format:'Virtual',cost:'Free',costType:'free',costVerifiedAt:new Date(),commitment:'Low',skills:'[]',tags:'["robotics"]',deadline:'2030-12-01',evidence:JSON.stringify({deadline:{sourceUrl:'https://example.edu',quote:'Apply by 2030-12-01'}})}});
 const {enqueueSearch}=await import('../src/discovery/requests.js');expect(await enqueueSearch(studentId,'initial')).toMatchObject({usedSharedCatalog:true});expect(await db.discoveryGroup.count()).toBe(0);expect(await db.discoveryRun.count()).toBe(0);expect(await db.studentPick.count()).toBe(6);expect((await refreshStatus(studentId)).remaining).toBe(1);expect(await enqueueSearch(studentId,'manual')).toMatchObject({usedSharedCatalog:true,requested:false});expect(await db.discoveryGroup.count()).toBe(0);expect(await db.discoveryRun.count()).toBe(0);expect((await refreshStatus(studentId)).remaining).toBe(1);
});
it('does not queue a first-use search without interests or beyond the global monthly cap',async()=>{
 await db.student.update({where:{id:studentId},data:{interests:'[]'}});await queueDiscovery(studentId);expect(await db.opportunitySearchRequest.count()).toBe(0);
 await db.student.update({where:{id:studentId},data:{interests:'["robotics"]'}});vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','0');await queueDiscovery(studentId);expect((await db.opportunitySearchRequest.findFirstOrThrow()).status).toBe('limited');expect(await db.discoveryGroup.count()).toBe(0);expect((await refreshStatus(studentId)).remaining).toBe(1);
});

it('requires the explicit interest-change bonus action instead of automatically paying for every profile edit',async()=>{
 await queueDiscovery(studentId);await runJobs();await db.student.update({where:{id:studentId},data:{interests:'["art"]'}});await noteInterestChange(studentId,['robotics'],['art']);await queueDiscovery(studentId);expect(await db.opportunitySearchRequest.count()).toBe(1);expect((await refreshStatus(studentId)).remaining).toBe(2);
 const {enqueueSearch}=await import('../src/discovery/requests.js');await enqueueSearch(studentId,'manual');expect(await db.opportunitySearchRequest.count()).toBe(2);
});

it('rechecks raised discovery limits and resumes an unfunded initial search without erasing its history or spending on status reads',async()=>{
 const {searchState}=await import('../src/discovery/requests.js');
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','0');await queueDiscovery(studentId);
 const original=await db.opportunitySearchRequest.findFirstOrThrow();
 expect(await searchState(studentId)).toMatchObject({limited:true,finding:false,monthlyAllowance:{reasons:['discovery_monthly_limit']}});
 expect((await refreshStatus(studentId)).remaining).toBe(1);
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','2');
 expect(await searchState(studentId)).toMatchObject({limited:false,finding:false,search:{phase:'idle'}});
 expect(await db.discoveryRun.count()).toBe(0);expect(await db.aIUsage.count()).toBe(0);
 await Promise.all([queueDiscovery(studentId),queueDiscovery(studentId)]);
 expect(await db.opportunitySearchRequest.count()).toBe(2);
 expect((await db.opportunitySearchRequest.findUniqueOrThrow({where:{id:original.id}})).status).toBe('limited');
 expect(await searchState(studentId)).toMatchObject({finding:true,limited:false});
 await runJobs();expect(remote.discover).toHaveBeenCalledTimes(1);expect((await refreshStatus(studentId)).remaining).toBe(1);
});
it('distinguishes both shared monthly caps and only recovers when every reached cap has room',async()=>{
 const {searchState}=await import('../src/discovery/requests.js');
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','0');vi.stubEnv('AI_MONTHLY_LIMIT','0');await queueDiscovery(studentId);
 expect((await searchState(studentId)).monthlyAllowance.reasons).toEqual(['discovery_monthly_limit','ai_monthly_limit']);
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','30');await queueDiscovery(studentId);
 expect(await searchState(studentId)).toMatchObject({limited:true,monthlyAllowance:{reasons:['ai_monthly_limit']}});
 expect(await db.opportunitySearchRequest.count()).toBe(1);
 vi.stubEnv('AI_MONTHLY_LIMIT','1');await queueDiscovery(studentId);
 expect(await searchState(studentId)).toMatchObject({finding:true,limited:false,monthlyAllowance:{reasons:[]}});
 expect(await db.aIUsage.count()).toBe(0);
});
it('resumes blocked manual intent with the manual allowance intact until success, rather than spending in the background without a tracked request',async()=>{
 const {enqueueSearch,searchState}=await import('../src/discovery/requests.js');
 await enqueueSearch(studentId,'manual');vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','0');await runJobs();
 expect(await searchState(studentId)).toMatchObject({limited:true,finding:false});
 expect((await db.opportunitySearchRequest.findFirstOrThrow()).manualSlot).toBe('base');
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','1');await runJobs();expect(remote.discover).not.toHaveBeenCalled();
 await queueDiscovery(studentId);
 const pending=await db.opportunitySearchRequest.findFirstOrThrow({where:{status:'queued'}});
 expect(pending).toMatchObject({kind:'manual',manualSlot:'base'});expect((await refreshStatus(studentId)).remaining).toBe(1);
 await runJobs();expect(remote.discover).toHaveBeenCalledTimes(1);expect((await refreshStatus(studentId)).remaining).toBe(0);
 expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);
});
it('never replays a paid provider failure automatically after the owner raises a cap',async()=>{
 const {enqueueSearch,searchState}=await import('../src/discovery/requests.js');
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','1');remote.discover.mockRejectedValueOnce(new Error('provider failed'));
 await enqueueSearch(studentId,'manual');await runJobs();expect((await db.opportunitySearchRequest.findFirstOrThrow()).status).toBe('failed');
 expect((await searchState(studentId)).limited).toBe(true);
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','30');await queueDiscovery(studentId);await runJobs();
 expect(await searchState(studentId)).toMatchObject({limited:false,finding:false,search:{phase:'failed'}});
 expect(await db.opportunitySearchRequest.count()).toBe(1);expect(remote.discover).toHaveBeenCalledTimes(1);
 expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);
});
it('reports the UTC calendar-month reset separately from the student rolling refresh cycle',async()=>{
 const {monthlySearchAllowance}=await import('../src/discovery/monthly-allowance.js');
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','1');await db.discoveryUsage.create({data:{month:'2026-12',runs:1}});
 expect(await monthlySearchAllowance(db,new Date('2026-12-31T23:59:59Z'))).toEqual({limited:true,reasons:['discovery_monthly_limit'],resetsAt:'2027-01-01T00:00:00.000Z'});
 expect(await monthlySearchAllowance(db,new Date('2027-01-01T00:00:00Z'))).toEqual({limited:false,reasons:[],resetsAt:'2027-02-01T00:00:00.000Z'});
 expect(await db.discoveryUsage.count()).toBe(1);
});

it('recovers through the real list/status endpoints after a reached cap is raised to 30 and preserves paid counters',async()=>{
 const month=new Date().toISOString().slice(0,7);
 await db.discoveryUsage.create({data:{month,runs:10}});await db.aIUsage.create({data:{key:'month:'+month,count:10}});
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','10');await queueDiscovery(studentId);
 const app=await buildApp();app.log.level='silent';const headers={'x-student-id':studentId};
 try{
  expect((await app.inject({url:'/api/discovery/status',headers})).json()).toMatchObject({enabled:true,limited:true,refresh:{remaining:1}});
  vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','5');await queueDiscovery(studentId);expect(await db.opportunitySearchRequest.count()).toBe(1);
  expect((await app.inject({url:'/api/discovery/status',headers})).json().limited).toBe(true);
  vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','30');
  expect((await app.inject({url:'/api/discovery/status',headers})).json()).toMatchObject({enabled:true,limited:false,monthlyAllowance:{limited:false,reasons:[]}});
  const response=await app.inject({url:'/api/opportunities',headers});expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({finding:false,limited:false});
  expect((await app.inject({method:'POST',url:'/api/opportunities/refresh',headers})).json()).toMatchObject({finding:true,limited:false});
  expect((await db.discoveryUsage.findUniqueOrThrow({where:{month}})).runs).toBe(10);expect((await db.aIUsage.findUniqueOrThrow({where:{key:'month:'+month}})).count).toBe(10);
  await runJobs();expect((await db.discoveryUsage.findUniqueOrThrow({where:{month}})).runs).toBe(11);expect((await db.aIUsage.findUniqueOrThrow({where:{key:'month:'+month}})).count).toBe(11);
 }finally{await app.close();}
});
it('reuses a shared catalog that filled while a manual search was blocked, without debiting the manual allowance',async()=>{
 const {enqueueSearch}=await import('../src/discovery/requests.js');
 await enqueueSearch(studentId,'manual');vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','0');await runJobs();
 for(let i=0;i<3;i++)await db.opportunity.create({data:{id:'new-free'+i,name:'New free '+i,organizer:'Org',source:'discovery',isSample:false,verificationStatus:'verified',verifiedAt:new Date(),sourceCheckedAt:new Date(),category:'Program',url:'https://example.edu',gradeMin:9,gradeMax:12,format:'Virtual',cost:'Free',costType:'free',costVerifiedAt:new Date(),commitment:'Low',skills:'[]',tags:'["robotics"]',deadline:'2030-12-01',evidence:JSON.stringify({deadline:{sourceUrl:'https://example.edu',quote:'Apply by 2030-12-01'}})}});
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','30');expect(await queueDiscovery(studentId)).toMatchObject({requested:false,usedSharedCatalog:true});
 await runJobs();expect(remote.discover).not.toHaveBeenCalled();expect((await refreshStatus(studentId)).remaining).toBe(1);expect(await db.discoveryRun.count()).toBe(0);
});

async function fillFree(topic='robotics') {
 const template=await db.opportunity.findUniqueOrThrow({where:{id:'paid0'}});
 for(let i=0;i<3;i++)await db.opportunity.create({data:{...template,id:'free'+i,name:'Free '+i,cost:'Free',costType:'free',costVerifiedAt:new Date(),tags:JSON.stringify([topic])}});
}
it('keeps first visits read-only and searches only Student A’s missing interest, then lets Student B reuse six shared picks with AI and caps off',async()=>{
 await db.opportunity.updateMany({data:{tags:'["art"]'}});await fillFree('art');
 await db.student.update({where:{id:studentId},data:{interests:'["art","robotics"]'}});
 const app=await buildApp();app.log.level='silent';const headers={'x-student-id':studentId};
 try{
  const first=(await app.inject({url:'/api/opportunities',headers})).json();
  expect(first).toMatchObject({picks:[],finding:false,catalog:{complete:false,missingInterests:['robotics']}});
  await runJobs();expect(await db.opportunitySearchRequest.count()).toBe(0);expect(await db.discoveryRun.count()).toBe(0);expect(remote.discover).not.toHaveBeenCalled();
  const started=await app.inject({method:'POST',url:'/api/opportunities/refresh',headers});expect(started.statusCode).toBe(202);expect(started.json()).toMatchObject({requested:true,finding:true});
  expect((await db.discoveryGroup.findMany()).map(g=>g.topic)).toEqual(['robotics']);
  expect((await app.inject({url:'/api/opportunities',headers})).json().picks).toHaveLength(6);
  remote.discover.mockImplementationOnce(async()=>{
   const template=await db.opportunity.findUniqueOrThrow({where:{id:'paid0'}});
   const found=[];
   for(const bucket of ['free','paid']){const id='robotics-'+bucket;await db.opportunity.create({data:{...template,id,name:id,tags:'["robotics"]',costType:bucket,cost:bucket==='free'?'Free':'$30',costVerifiedAt:new Date()}});found.push(id);}
   return found;
  });
  expect((await app.inject({method:'POST',url:'/api/discovery/run',headers})).statusCode).toBe(200);
  expect(remote.discover).toHaveBeenCalledTimes(1);expect(remote.discover.mock.calls[0][0]).toMatchObject({topic:'robotics'});expect(remote.discover.mock.calls[0][1]).toEqual(['free','paid']);
  const a=(await app.inject({url:'/api/opportunities',headers})).json();expect(a.picks.filter((p:any)=>p.bucket==='free')).toHaveLength(3);expect(a.picks.filter((p:any)=>p.bucket==='paid')).toHaveLength(3);expect(a.picks.some((p:any)=>p.tags.includes('robotics'))).toBe(true);
  const b=await db.student.create({data:{name:'Student B',grade:10,interests:'["art","robotics"]',region:'NC',aiConsent:false}}),bHeaders={'x-student-id':b.id};
  vi.stubEnv('DISCOVERY_ENABLED','false');vi.stubEnv('AI_MONTHLY_LIMIT','0');vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','0');vi.stubEnv('AI_DISABLED','true');env.aiDisabled=true;
  await useManualRefresh(b.id);
  for(let n=0;n<2;n++){
   const reuse=await app.inject({method:'POST',url:'/api/opportunities/refresh',headers:bHeaders});expect(reuse.statusCode).toBe(202);expect(reuse.json()).toMatchObject({usedSharedCatalog:true,requested:false,finding:false,catalog:{complete:true}});
   expect((await app.inject({url:'/api/opportunities',headers:bHeaders})).json().picks).toHaveLength(6);
  }
  expect((await refreshStatus(b.id)).remaining).toBe(0);expect(remote.discover).toHaveBeenCalledTimes(1);expect(await db.discoveryRun.count()).toBe(1);expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);expect((await db.aIUsage.findFirstOrThrow()).count).toBe(1);
  expect(await db.aIUsage.count({where:{key:{startsWith:'day:'}}})).toBe(0);
 }finally{await app.close();}
});
it('rechecks a queued gap before funding it and settles a newly complete shared library without a manual debit',async()=>{
 const {enqueueSearch,searchState}=await import('../src/discovery/requests.js');
 await enqueueSearch(studentId,'manual');await fillFree();await runJobs();
 expect(remote.discover).not.toHaveBeenCalled();expect(await db.discoveryRun.count()).toBe(0);expect((await db.discoveryUsage.findFirst())?.runs||0).toBe(0);expect(await db.aIUsage.count()).toBe(0);expect((await refreshStatus(studentId)).remaining).toBe(1);
 expect(await searchState(studentId)).toMatchObject({finding:false,search:{phase:'cached',found:6}});
});
it('keeps expired, closed and unverified records from preventing a necessary missing-bucket search',async()=>{
 await fillFree();await db.opportunity.update({where:{id:'free0'},data:{applicationStatus:'closed'}});await db.opportunity.update({where:{id:'free1'},data:{sourceCheckedAt:new Date(Date.now()-31*86400000)}});await db.opportunity.update({where:{id:'free2'},data:{verificationStatus:'unverified'}});
 const {enqueueSearch}=await import('../src/discovery/requests.js');
 expect(await enqueueSearch(studentId,'initial')).toMatchObject({requested:true,catalog:{complete:false,free:0}});
 expect(JSON.parse((await db.discoveryGroup.findFirstOrThrow()).pendingBuckets)).toEqual(['free']);
});
it('cancels unfunded queued work when consent is withdrawn or the student changes interests',async()=>{
 const {enqueueSearch}=await import('../src/discovery/requests.js');
 for(const update of [{aiConsent:false},{interests:'["art"]'}]) {
  await db.student.update({where:{id:studentId},data:{aiConsent:true,interests:'["robotics"]'}});
  await enqueueSearch(studentId,'manual');await db.student.update({where:{id:studentId},data:update});await runJobs();
 }
 expect(remote.discover).not.toHaveBeenCalled();expect(await db.discoveryRun.count()).toBe(0);expect(await db.opportunitySearchRequest.count({where:{status:'cancelled'}})).toBe(2);expect((await refreshStatus(studentId)).remaining).toBe(1);
});
it('reports current cached results when an older cached request predates a newer limited attempt',async()=>{
 const {enqueueSearch,searchState}=await import('../src/discovery/requests.js');
 await fillFree();await enqueueSearch(studentId,'initial',new Date(Date.now()-2000));
 await db.opportunitySearchRequest.create({data:{studentId,kind:'manual',signature:'robotics|9-10|NC',status:'limited',createdAt:new Date(Date.now()-1000),finishedAt:new Date()}});
 await enqueueSearch(studentId,'manual');expect(await searchState(studentId)).toMatchObject({finding:false,search:{phase:'cached',found:6}});
});
it('marks all-extraction failures failed, records requested models and retains the student allowance and shared usage',async()=>{
 const {enqueueSearch,searchState}=await import('../src/discovery/requests.js');
 vi.stubEnv('SEARCH_MODEL','test-web-model');vi.stubEnv('AI_MODEL_EXTRACTION','test-reader-model');
 remote.discover.mockImplementationOnce(async(_group,_buckets,budget:any)=>{
  budget.failures.push({stage:'fetch',code:'unsupported_content',mediaType:'application/pdf'},{stage:'extract',code:'invalid_schema',issues:[{field:'gradeMin',code:'invalid_type'}]});
  budget.candidates={found:2,filtered:1,queued:1};
  budget.workflow.push({node:'search_candidates',status:'completed'},{node:'fetch_official_pages',status:'completed'},{node:'extract_facts',status:'failed'});
  return [];
 });
 await enqueueSearch(studentId,'manual');await runJobs();
 const run=await db.discoveryRun.findFirstOrThrow(),usage=JSON.parse(run.usage);
 expect(run.status).toBe('failed');expect(usage).toMatchObject({phase:'failed',savedIds:[],models:{search:{provider:'openai',model:'test-web-model'},extraction:{model:'test-reader-model'}}});
 expect((await searchState(studentId)).search.phase).toBe('failed');expect((await refreshStatus(studentId)).remaining).toBe(1);
 expect(run.error).toContain('unexpected format');
 const status=await searchState(studentId);
 expect(status.diagnostics).toMatchObject({runs:1,candidates:{found:2,filtered:1,queued:1},steps:{extract:{completed:0,failed:1}},programsSaved:0});
 expect(status.diagnostics.failures.map(f=>f.code)).toEqual(['unsupported_content','invalid_schema']);
 expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);expect((await db.aIUsage.findFirstOrThrow()).count).toBe(1);
 expect(await db.opportunitySearchRequest.findFirstOrThrow()).toMatchObject({status:'failed',countedAt:null});
 await runJobs();expect(remote.discover).toHaveBeenCalledTimes(1);
 expect(run.usage).not.toContain('fake-test-key');
});
it('reports all historical failures for the authenticated request without another search or rewriting old usage',async()=>{
 const {enqueueSearch}=await import('../src/discovery/requests.js');
 remote.discover.mockImplementationOnce(async(_group,_buckets,budget:any)=>{
  budget.failures.push({stage:'fetch',code:'unsupported_content'},{stage:'extract',code:'incomplete_response',finishReason:'length'});return [];
 });
 await enqueueSearch(studentId,'manual');await runJobs();
 const run=await db.discoveryRun.findFirstOrThrow(),oldUsage=JSON.parse(run.usage);delete oldUsage.candidates;delete oldUsage.models;
 await db.discoveryRun.update({where:{id:run.id},data:{usage:JSON.stringify(oldUsage)}});
 await db.opportunitySearchRequest.updateMany({where:{studentId},data:{error:'The official source is not a readable web page.'}});
 await db.discoveryRun.create({data:{groupKey:'unrelated',kind:'discovery',status:'failed',usage:JSON.stringify({failures:[{stage:'extract',code:'invalid_schema',issues:[{field:'private-unrelated-field',code:'invalid_type'}]}]})}});
 const app=await buildApp();app.log.level='silent';
 try{
  const response=await app.inject({url:'/api/discovery/status',headers:{'x-student-id':studentId}});
  expect(response.statusCode).toBe(200);const status=response.json();
  expect(status.error).toContain('could not finish reading');expect(status.diagnostics).toMatchObject({runs:1,candidates:null,models:[]});expect(status.diagnostics.failures).toHaveLength(2);
  expect(response.body).not.toContain('private-unrelated-field');expect(remote.discover).toHaveBeenCalledTimes(1);
  expect((await db.discoveryRun.findUniqueOrThrow({where:{id:run.id}})).usage).toBe(JSON.stringify(oldUsage));
  expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);expect((await refreshStatus(studentId)).remaining).toBe(1);
 }finally{await app.close();}
});
