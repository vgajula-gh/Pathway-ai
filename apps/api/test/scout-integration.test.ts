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
vi.mock('../src/knowledge/preparation.js',()=>({prepareKnowledgeBatch:async()=>0,knowledgeStates:async()=>({})}));
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
 vi.unstubAllEnvs();vi.stubEnv('DISCOVERY_ENABLED','true');vi.stubEnv('AI_DISABLED','false');vi.stubEnv('SEARCH_PROVIDER','openai');vi.stubEnv('OPENAI_API_KEY','fake-key');vi.stubEnv('AI_MODEL_EXTRACTION','reader');vi.stubEnv('DISCOVERY_RECHECKS_PER_MONTH','0');
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
it('bounds five interest groups to three funded research calls and retains private profile data locally',async()=>{
 await db.student.update({where:{id:studentId},data:{interests:'["AI","business","coding","engineering","entrepreneurship"]'}});
 const app=await buildApp();app.log.level='silent';try{
  expect((await search(app)).finding).toBe(false);expect(remote.research).toHaveBeenCalledTimes(3);expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(3);
  expect(remote.research.mock.calls.every(c=>c[1].focusInterests.length<=2)).toBe(true);
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
