import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const remote=vi.hoisted(()=>({fixtures:[] as any[],research:vi.fn(),extract:vi.fn(),fetch:vi.fn()}));
vi.mock('../src/scout/research.js',()=>({research:remote.research}));
vi.mock('../src/scout/extract.js',()=>({extractScout:remote.extract}));
vi.mock('../src/discovery/pages.js',async()=>({...await vi.importActual('../src/discovery/pages.js'),fetchOfficialPage:remote.fetch}));
vi.mock('../src/knowledge/preparation.js',()=>({prepareKnowledgeBatch:async()=>0,knowledgeStates:async()=>({}),knowledgeDetails:async()=>({})}));
vi.mock('../src/knowledge/runtime.js',()=>({initializeKnowledge:async()=>null,knowledgeUnavailable:()=>null}));
const dir=mkdtempSync(join(tmpdir(),'pathway-scout-api-')),url=`file:${dir}/test.db`,db=new PrismaClient({datasourceUrl:url+'?connection_limit=1'});
vi.mock('../src/lib/db.js',()=>({get prisma(){return db;},j:(v:string,f:unknown)=>{try{return v?JSON.parse(v):f;}catch{return f;}}}));
import {buildApp} from '../src/app.js';
import {env} from '../src/lib/env.js';
import {scoutFixture} from './fixtures/scout.js';
import {runJobs} from '../src/discovery/jobs.js';
const previous={...env};let studentId='';
beforeAll(async()=>{writeFileSync(join(dir,'test.db'),'');await promisify(execFile)(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url}});},30000);
beforeEach(async()=>{
 vi.stubEnv('SCOUT_SOURCE_MODE','fetch_and_extract');
 vi.unstubAllEnvs();vi.stubEnv('SCOUT_SOURCE_MODE','fetch_and_extract');vi.stubEnv('DISCOVERY_ENABLED','true');vi.stubEnv('AI_DISABLED','false');vi.stubEnv('SEARCH_PROVIDER','openai');vi.stubEnv('OPENAI_API_KEY','fake-key');vi.stubEnv('AI_MODEL_EXTRACTION','reader');vi.stubEnv('DISCOVERY_RECHECKS_PER_MONTH','0');
 Object.assign(env,{provider:'openai',openaiKey:'fake-key',openaiModel:'reader',aiDisabled:false,accessCodes:[]});
 await db.student.deleteMany();await db.discoveryRun.deleteMany();await db.discoveryGroup.deleteMany();await db.opportunity.deleteMany();await db.jobLease.deleteMany();await db.discoveryUsage.deleteMany();await db.aIUsage.deleteMany();
 studentId=(await db.student.create({data:{name:'Private name sentinel',grade:10,region:'NC',interests:'["coding","robotics"]',discoveryPreferences:JSON.stringify({goals:'private goal sentinel',personalProject:'private project sentinel'})}})).id;
 remote.fixtures=[];remote.fetch.mockReset().mockImplementation(async(url:string)=>remote.fixtures.find(f=>f.page.sourceUrl===url)!.page);
 remote.extract.mockReset().mockImplementation(async(pages:any[])=>({facts:remote.fixtures.find(f=>f.page.sourceUrl===pages[0].sourceUrl)!.facts,usage:{provider:'openai',model:'reader',inputTokens:50,outputTokens:30,responseId:'extract-test'}}));
 remote.research.mockReset().mockImplementation(async(_provider,context)=>({output:{candidates:remote.fixtures.map(f=>({name:f.facts.name,officialUrl:f.page.sourceUrl,interests:context.focusInterests,costHint:f.facts.costType==='free'?'free':'paid'})),searchThemesUsed:context.focusInterests},query:'public query',repaired:false}));
});
afterAll(async()=>{Object.assign(env,previous);vi.unstubAllEnvs();await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
async function search(app:Awaited<ReturnType<typeof buildApp>>) {
 const headers={'x-student-id':studentId};
 expect((await app.inject({method:'POST',url:'/api/opportunities/refresh',headers})).statusCode).toBe(202);
 for(let i=0;i<45;i++) {
  expect((await app.inject({method:'POST',url:'/api/discovery/run',headers})).statusCode).toBe(200);
  const status=(await app.inject({url:'/api/discovery/status',headers})).json();if(!status.finding)return status;
 }
 throw new Error('Search did not settle');
}
it('researches two interests once, saves real fixture evidence, displays three Free/three Paid and reuses them for Student B',async()=>{
 remote.fixtures=Array.from({length:6},(_,i)=>scoutFixture('Coding Robotics '+i,i<3?'free':'paid'));
 const app=await buildApp();app.log.level='silent';try{
  const status=await search(app);expect(status.resultIds).toHaveLength(6);expect(remote.research).toHaveBeenCalledOnce();
  expect(await db.discoveryRunGroup.count()).toBe(2);expect(await db.sourcePage.count()).toBe(6);expect(await db.researchCandidate.count({where:{status:'verified'}})).toBe(6);
  const a=(await app.inject({url:'/api/opportunities',headers:{'x-student-id':studentId}})).json();expect(a.picks.filter((p:any)=>p.bucket==='free')).toHaveLength(3);expect(a.picks.filter((p:any)=>p.bucket==='paid')).toHaveLength(3);
  const b=await db.student.create({data:{name:'Second student',grade:9,region:'NC',interests:'["robotics","coding"]',aiConsent:false}});
  const reused=await app.inject({method:'POST',url:'/api/opportunities/refresh',headers:{'x-student-id':b.id}});expect(reused.json()).toMatchObject({usedSharedCatalog:true,requested:false});
  expect(remote.research).toHaveBeenCalledOnce();expect(remote.extract).toHaveBeenCalledTimes(6);
  const context=remote.research.mock.calls[0][1];expect(context.interests).toEqual(['coding','robotics']);expect(JSON.stringify(context)).not.toContain('private');
 }finally{await app.close();}
});
it('shows an active source-review candidate instead of silently discarding it',async()=>{
 const f=scoutFixture();f.page.sourceUrl='https://new-organizer.org/robotics';remote.fixtures=[f];
 const app=await buildApp();app.log.level='silent';try{
  expect((await search(app)).resultIds).toHaveLength(1);
  const pick=(await app.inject({url:'/api/opportunities',headers:{'x-student-id':studentId}})).json().picks[0];
  expect(pick).toMatchObject({verified:false,verificationStatus:'needs_verification',sourceCheckedAt:null});expect(pick.checks).toContain('Source needs owner review');
 }finally{await app.close();}
});
it('shows real search links immediately and retains all of them when every extraction returns unreadable JSON',async()=>{
 remote.fixtures=Array.from({length:6},(_,i)=>scoutFixture('Unconfirmed Coding '+i));
 const actual=await vi.importActual<typeof import('../src/scout/research.js')>('../src/scout/research.js');
 const web=vi.fn(async()=>({text:'Programs found. This is not a JSON response.',citations:remote.fixtures.map(f=>f.page.sourceUrl),sources:remote.fixtures.map(f=>({name:f.facts.name,url:f.page.sourceUrl})),usage:{provider:'openai' as const,model:'test',inputTokens:20,outputTokens:10,responseId:'public-search'}}));
 remote.research.mockImplementation((_provider,context,count,repair,onCall,beforeRepair,deadline)=>actual.research({research:web},context,count,repair,onCall,beforeRepair,deadline));
 remote.extract.mockRejectedValue(new SyntaxError('unreadable'));
 const app=await buildApp();app.log.level='silent';try{
  const result=await search(app);expect(result.search.phase).toBe('partial');expect(result.error).toBeNull();expect(web).toHaveBeenCalledOnce();expect(remote.extract).toHaveBeenCalledTimes(6);
  const response=(await app.inject({url:'/api/opportunities',headers:{'x-student-id':studentId}})).json();expect(response.recommended).toHaveLength(6);expect(response.recommended.every((o:any)=>!o.verified&&o.deadline===null&&o.costType==='unknown')).toBe(true);
  expect(await db.sourcePage.count()).toBe(6);expect(await db.opportunity.count()).toBe(6);
 }finally{await app.close();}
});
it('shows stale, closed, wrong-grade, distant and unknown-cost results while excluding only a confirmed past deadline',async()=>{
 const template=await import('./fixtures/scout.js');const {storeCandidate}=await import('../src/discovery/pipeline.js');const {qualifyScout}=await import('../src/scout/qualify.js');
 const group=await db.discoveryGroup.create({data:{key:'coding|9-10|NC',topic:'coding',gradeBand:'9-10',region:'NC'}});
 const f=template.scoutFixture('Filter-free Coding'),data=qualifyScout(f.facts,[f.page],new Set()).data!;
 const id=await storeCandidate(data,[f.page],group);
 await db.opportunity.update({where:{id},data:{gradeMin:12,gradeMax:12,region:'["CA"]',format:'In person',applicationStatus:'closed',costType:'unknown',sourceCheckedAt:null,sourceReadAt:new Date('2000-01-01'),verificationStatus:'stale',deadline:null}});
 await db.student.update({where:{id:studentId},data:{format:'virtual',discoveryPreferences:JSON.stringify({city:'Raleigh',state:'NC',radiusMiles:1,maxCost:0})}});
 const app=await buildApp();app.log.level='silent';try{
  const response=(await app.inject({url:'/api/opportunities',headers:{'x-student-id':studentId}})).json();expect(response.recommended.map((o:any)=>o.id)).toContain(id);expect(response.recommended[0].fit.eligibility.checks.join()).toContain('grade 12');
  await db.opportunity.update({where:{id},data:{deadline:'2000-01-01'}});
  expect((await app.inject({url:'/api/opportunities',headers:{'x-student-id':studentId}})).json().recommended).toEqual([]);
 }finally{await app.close();}
});
it('recovers already-paid rejected leads without another provider call and preserves confirmed expiry evidence',async()=>{
 const group=await db.discoveryGroup.create({data:{key:'coding|9-10|NC',topic:'coding',gradeBand:'9-10',region:'NC'}});
 const run=await db.discoveryRun.create({data:{groupKey:group.key,kind:'discovery',status:'failed'}});
 await db.researchCandidate.create({data:{runId:run.id,name:'Earlier Coding Result',url:'https://example.edu/earlier',status:'error',reasons:'[{"field":"extract","reason":"invalid_json"}]'}});
 await db.researchCandidate.create({data:{runId:run.id,name:'Expired Coding Result',url:'https://example.edu/expired',status:'excluded',reasons:'[{"field":"deadline","reason":"past_deadline"}]'}});
 const app=await buildApp();app.log.level='silent';try{
  for(let n=0;n<2;n++){const response=(await app.inject({url:'/api/opportunities',headers:{'x-student-id':studentId}})).json();expect(response.recommended.map((o:any)=>o.name)).toEqual(['Earlier Coding Result']);}
  expect(remote.research).not.toHaveBeenCalled();expect(remote.extract).not.toHaveBeenCalled();expect(remote.fetch).not.toHaveBeenCalled();expect(await db.opportunity.count()).toBe(1);
 }finally{await app.close();}
});
it('covers five interest groups in two funded research calls and retains private profile data locally',async()=>{
 await db.student.update({where:{id:studentId},data:{interests:'["AI","business","coding","engineering","entrepreneurship"]'}});
 const app=await buildApp();app.log.level='silent';try{
  expect((await search(app)).finding).toBe(false);expect(remote.research).toHaveBeenCalledTimes(2);expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(2);
  expect(remote.research.mock.calls.every(c=>c[1].focusInterests.length<=3)).toBe(true);expect(new Set(remote.research.mock.calls.flatMap(c=>c[1].focusInterests)).size).toBe(5);
  expect(JSON.stringify(remote.research.mock.calls.map(c=>c[1]))).not.toContain('private');
 }finally{await app.close();}
});
it('cancels a pending search after preferences change without starting extraction',async()=>{
 remote.fixtures=[scoutFixture()];const app=await buildApp();app.log.level='silent';const headers={'x-student-id':studentId};
 try{
  await app.inject({method:'POST',url:'/api/opportunities/refresh',headers});await app.inject({method:'POST',url:'/api/discovery/run',headers});
  await app.inject({method:'PATCH',url:'/api/me',headers,payload:{discoveryPreferences:{maxCost:25}}});
  await runJobs();expect(remote.extract).not.toHaveBeenCalled();expect(await db.opportunitySearchRequest.findFirstOrThrow()).toMatchObject({status:'cancelled'});
 }finally{await app.close();}
});

it('confirms research evidence without extraction while retaining blocked, redirected and PDF links',async()=>{
 vi.stubEnv('SCOUT_SOURCE_MODE','research_evidence');
 const {ResearchDetails}=await import('../src/scout/schema.js');const {DiscoveryFailure}=await import('../src/discovery/failures.js');
 const fixtures=Array.from({length:10},(_,i)=>scoutFixture('Research Coding '+i,i<3?'free':'paid'));
 fixtures[9].page.sourceUrl='https://example.edu/program.pdf';
 const leads=fixtures.map((f,i)=>({name:f.facts.name!,officialUrl:f.page.sourceUrl,interests:['coding','robotics'],costHint:i<3?'free':'paid',details:ResearchDetails.parse({
  ...Object.fromEntries(Object.keys(ResearchDetails.shape).map(k=>[k,null])),organizer:'Example',costType:i<3?'free':'paid',costAmount:i<3?null:'USD $50',deadline:'2030-12-01',applicationStatus:'open',format:'online',
  evidence:[['name',f.facts.name!],['organizer','Organized by Example.'],['gradeEligibility','Open to grades 9–12 and high school students.'],['costType',i<3?'Participation is free.':'Program fee USD $50.'],['costAmount','Program fee USD $50.'],['deadline','Application deadline December 1, 2030.'],['applicationStatus','Applications are now open.'],['format','Online.']].map(([field,quote])=>({field,quote,sourceUrl:f.page.sourceUrl}))
 })}));
 remote.research.mockResolvedValue({output:{candidates:leads,searchThemesUsed:['coding']},query:'public test',repaired:false});
 remote.fetch.mockImplementation(async(url:string)=>{const i=leads.findIndex(l=>l.officialUrl===url);if(i>=3&&i<=6)throw new DiscoveryFailure({stage:'fetch',code:'http_error',httpStatus:403});return {...fixtures[i].page,...(i===7||i===8?{sourceUrl:'https://applications.example.edu/'+i}:{})};});
 const app=await buildApp();app.log.level='silent';const headers={'x-student-id':studentId};try{
  await app.inject({method:'POST',url:'/api/opportunities/refresh',headers});await app.inject({method:'POST',url:'/api/discovery/run',headers});
  expect((await app.inject({url:'/api/opportunities',headers})).json().recommended).toHaveLength(10);
  for(let i=0;i<15;i++){await app.inject({method:'POST',url:'/api/discovery/run',headers});if(!(await app.inject({url:'/api/discovery/status',headers})).json().finding)break;}
  const list=(await app.inject({url:'/api/opportunities',headers})).json();expect(list.recommended).toHaveLength(10);expect(list.picks.filter((p:any)=>p.bucket==='free')).toHaveLength(3);expect(list.picks.filter((p:any)=>p.bucket==='paid')).toHaveLength(3);
  expect(list.recommended.filter((o:any)=>o.verified)).toHaveLength(5);expect(list.recommended.filter((o:any)=>!o.verified)).toHaveLength(5);expect(list.search.phase).toBe('partial');
  expect(remote.extract).not.toHaveBeenCalled();expect(remote.fetch).toHaveBeenCalledTimes(9);expect(await db.sourcePage.count()).toBe(5);
  expect(await db.researchCandidate.count({where:{status:'needs_verification'}})).toBe(5);
  const {recheckOpportunity}=await import('../src/discovery/jobs.js'),{RunBudget}=await import('../src/discovery/config.js');
  const first=list.recommended.find((o:any)=>o.name==='Research Coding 0');
  await recheckOpportunity(first.id,new RunBudget(),{fetch:async()=>({...fixtures[0].page,contentHash:'changed-but-supported'}),extract:remote.extract,ingest:async()=>{}});
  expect(remote.extract).not.toHaveBeenCalled();expect(await db.opportunity.findUniqueOrThrow({where:{id:first.id}})).toMatchObject({costType:'free',deadline:'2030-12-01'});

 }finally{await app.close();}
});
