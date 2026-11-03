import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const dir=mkdtempSync(join(tmpdir(),'pathway-scout-owner-')),url=`file:${dir}/test.db`,db=new PrismaClient({datasourceUrl:url+'?connection_limit=1'});
const external=vi.hoisted(()=>({research:vi.fn(),fetch:vi.fn(),extract:vi.fn()}));
vi.mock('../src/lib/db.js',()=>({get prisma(){return db;},j:(v:string,f:unknown)=>{try{return v?JSON.parse(v):f;}catch{return f;}}}));
vi.mock('../src/discovery/search/index.js',()=>({getSearch:()=>({research:external.research,search:vi.fn()})}));
vi.mock('../src/scout/extract.js',()=>({extractScout:external.extract}));
vi.mock('../src/discovery/pages.js',async()=>({...await vi.importActual('../src/discovery/pages.js'),fetchOfficialPage:external.fetch}));
import {buildApp} from '../src/app.js';import {env} from '../src/lib/env.js';import {scoutFixture} from './fixtures/scout.js';
import {primaryFailure} from '../src/discovery/failures.js';
const previous={...env},secret='owner-diagnostic-secret-'.repeat(3),headers={authorization:'Bearer '+secret};
beforeAll(async()=>{writeFileSync(join(dir,'test.db'),'');await promisify(execFile)(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url}});},30000);
beforeEach(async()=>{
 vi.stubEnv('SCOUT_SOURCE_MODE','fetch_and_extract');
 vi.unstubAllEnvs();vi.stubEnv('SCOUT_SOURCE_MODE','fetch_and_extract');vi.stubEnv('JOBS_SECRET',secret);vi.stubEnv('OPENAI_API_KEY','sk-private-do-not-print');vi.stubEnv('LLM_PROVIDER','openai');vi.stubEnv('SEARCH_PROVIDER','openai');vi.stubEnv('OPENAI_MODEL','gpt-4.1-mini');vi.stubEnv('DISCOVERY_ENABLED','true');vi.stubEnv('AI_DISABLED','false');vi.stubEnv('AI_MONTHLY_LIMIT','100');vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','10');
 env.aiDisabled=false;env.provider='openai';env.openaiModel='gpt-4.1-mini';env.accessCodes=[];
 await db.discoveryRun.deleteMany();await db.discoveryUsage.deleteMany();await db.discoveryGroup.deleteMany();await db.aIUsage.deleteMany();await db.jobLease.deleteMany();await db.student.deleteMany();await db.opportunity.deleteMany();
 const fixture=scoutFixture('Public Coding Studio');
 external.research.mockReset().mockResolvedValue({text:JSON.stringify({candidates:[{name:'Public Coding Studio',officialUrl:fixture.page.sourceUrl,interests:['coding'],costHint:'free'}],searchThemesUsed:['coding']}),citations:[],usage:{provider:'openai',model:'gpt-4.1-mini',inputTokens:100,outputTokens:50,responseId:'test'}});
 external.fetch.mockReset().mockResolvedValue(fixture.page);external.extract.mockReset().mockResolvedValue({facts:fixture.facts,usage:{provider:'openai',model:'gpt-4.1-mini',inputTokens:500,outputTokens:400,responseId:'test-extract'}});
});
afterAll(async()=>{vi.unstubAllEnvs();Object.assign(env,previous);await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
it('protects diagnostics and live jobs with owner credentials and never accepts student or query-string secrets',async()=>{
 const app=await buildApp();app.log.level='silent';try{
  for(const path of ['/internal/diagnostics','/internal/diagnostics?secret='+secret])expect((await app.inject({url:path})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:'/internal/diagnostics/test-scout',payload:{mode:'live'}})).statusCode).toBe(401);
  expect((await app.inject({url:'/internal/diagnostics?secret='+secret,headers})).statusCode).toBe(422);
  expect(await db.discoveryRun.count()).toBe(0);expect(external.research).not.toHaveBeenCalled();
 }finally{await app.close();}
});
it('reports configuration and synthetic verification without providers, DB writes or secret values',async()=>{
 await db.student.create({data:{name:'private-student-sentinel',grade:10,discoveryPreferences:'{"personalProject":"private-project-sentinel"}'}});
 const app=await buildApp();app.log.level='silent';try{
  for(const mode of ['configuration','fixture']) {
   const response=await app.inject({method:'POST',url:'/internal/diagnostics/test-scout',headers,payload:{mode}});expect(response.statusCode).toBe(200);expect(response.json().providerRequests).toBe(0);
   if(mode==='fixture')expect(response.json()).toMatchObject({synthetic:true,ok:true,disposition:'verified'});
  }
  const response=await app.inject({url:'/internal/diagnostics',headers});expect(response.statusCode).toBe(200);expect(response.json().configuration.secretPresence.OPENAI_API_KEY).toBe(true);
  for(const privateValue of ['sk-private-do-not-print',secret,'private-student-sentinel','private-project-sentinel'])expect(response.body).not.toContain(privateValue);
  expect(await db.discoveryRun.count()).toBe(0);expect(await db.aIUsage.count()).toBe(0);expect(external.research).not.toHaveBeenCalled();expect(external.extract).not.toHaveBeenCalled();
 }finally{await app.close();}
});
it('queues one explicit public live job, advances bounded stages, preserves research/citations and does not charge on reads',async()=>{
 const app=await buildApp();app.log.level='silent';try{
  const start=await app.inject({method:'POST',url:'/internal/diagnostics/test-scout',headers,payload:{mode:'live'}});expect(start.statusCode).toBe(202);const id=start.json().result.runId;
  expect(external.research).not.toHaveBeenCalled();expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);
  expect((await app.inject({method:'POST',url:'/internal/diagnostics/test-scout',headers,payload:{mode:'live'}})).json().result).toMatchObject({runId:id,started:false});
  for(let step=0;step<6;step++) {
   const before=external.research.mock.calls.length+external.extract.mock.calls.length;
   const advance=await app.inject({method:'POST',url:'/internal/diagnostics/test-scout',headers,payload:{mode:'advance',runId:id}});expect(advance.statusCode).toBe(202);
   expect(external.research.mock.calls.length+external.extract.mock.calls.length-before).toBeLessThanOrEqual(1);
   if(advance.json().result.done)break;
  }
  expect(external.research).toHaveBeenCalledOnce();expect(external.extract).toHaveBeenCalledOnce();expect(await db.opportunity.count()).toBe(1);
  const beforeUsage=await db.discoveryUsage.findFirstOrThrow(),beforeAI=await db.aIUsage.findMany();
  const response=await app.inject({url:'/internal/diagnostics?runId='+id,headers});expect(response.statusCode).toBe(200);
  expect(response.json().runs[0]).toMatchObject({status:'complete',diagnostic:true,outcomes:{verified:1},researchOutput:{candidates:[{name:'Public Coding Studio'}]}});
  expect(response.json().runs[0].candidates[0].pages[0].text).toContain('Participation is free');expect(response.json().runs[0].calls.map((c:any)=>c.kind)).toEqual(['research','extract']);
  expect(await db.discoveryUsage.findFirstOrThrow()).toEqual(beforeUsage);expect(await db.aIUsage.findMany()).toEqual(beforeAI);
 }finally{await app.close();}
});
it('keeps normal monthly caps for owner live tests and prevents advancement of unrelated jobs',async()=>{
 vi.stubEnv('DISCOVERY_MONTHLY_BUDGET','0');const app=await buildApp();app.log.level='silent';try{
  expect((await app.inject({method:'POST',url:'/internal/diagnostics/test-scout',headers,payload:{mode:'live'}})).statusCode).toBe(429);
  expect((await app.inject({method:'POST',url:'/internal/diagnostics/test-scout',headers,payload:{mode:'advance',runId:'not-a-diagnostic'}})).statusCode).toBe(404);
  expect(await db.discoveryRun.count()).toBe(0);expect(external.research).not.toHaveBeenCalled();
 }finally{await app.close();}
});
it('reports repeated qualification failures before an incidental timeout, while preserving configuration failures',()=>{
 const verify={stage:'verify' as const,code:'missing_evidence' as const};
 expect(primaryFailure([verify,verify,{stage:'extract',code:'timeout'}])).toEqual(verify);
 expect(primaryFailure([verify,verify,{stage:'extract',code:'provider_authorization'}])?.code).toBe('provider_authorization');
});

it('runs a research-evidence owner test with one research request, no extraction and complete cost diagnostics',async()=>{
 vi.stubEnv('SCOUT_SOURCE_MODE','research_evidence');const app=await buildApp();app.log.level='silent';expect(app.initialConfig.connectionTimeout).toBe(180000);try{
  const start=(await app.inject({method:'POST',url:'/internal/diagnostics/test-scout',headers,payload:{mode:'live'}})).json();expect(start.maxProviderRequests).toBe(1);const id=start.result.runId;
  for(let n=0;n<5;n++){const result=(await app.inject({method:'POST',url:'/internal/diagnostics/test-scout',headers,payload:{mode:'advance',runId:id}})).json();if(result.result.done)break;}
  expect(external.research).toHaveBeenCalledOnce();expect(external.extract).not.toHaveBeenCalled();
  const report=(await app.inject({url:'/internal/diagnostics?runId='+id,headers})).json();expect(report.runs[0]).toMatchObject({sourceMode:'research_evidence',outcomes:{needs_verification:1}});expect(report.runs[0].calls).toHaveLength(1);expect(report.runs[0].calls[0]).toHaveProperty('estimatedCost');expect(report.monthly.spend.costIsEstimate).toBe(true);expect(report.configuration.settings.webToolCalls).toBe(5);
 }finally{await app.close();}
});
