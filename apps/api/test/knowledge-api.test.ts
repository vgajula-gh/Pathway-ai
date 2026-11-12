import {beforeAll,beforeEach,afterEach,afterAll,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const holder=vi.hoisted(()=>({runtime:null as any,llm:null as any}));
const dir=mkdtempSync(join(tmpdir(),'pathway-knowledge-')),url=`file:${dir}/test.db`,db=new PrismaClient({datasourceUrl:url+'?connection_limit=1'});
vi.mock('../src/lib/db.js',()=>({get prisma(){return db;},j:(v:string,f:unknown)=>{try{return v?JSON.parse(v):f;}catch{return f;}}}));
vi.mock('../src/knowledge/runtime.js',async()=>({...await vi.importActual('../src/knowledge/runtime.js'),initializeKnowledge:async()=>holder.runtime,knowledgeUnavailable:()=>({code:'vector_unavailable',message:'The program library cannot connect right now. Catalog picks still work.',settings:[]}),pauseKnowledge:()=>{}}));
vi.mock('../src/agent/llm/index.js',async()=>({...await vi.importActual('../src/agent/llm/index.js'),getLLM:()=>holder.llm,requireLLM:()=>holder.llm}));
import {memoryStore} from '../src/knowledge/adapters/memory.js';import {ingestKnowledge,searchKnowledge,reconcileVectors} from '../src/knowledge/service.js';import {RunBudget} from '../src/discovery/config.js';import {buildApp} from '../src/app.js';import {env} from '../src/lib/env.js';
import {documentIndexResponse} from './fixtures/pinecone-document-index.js';
let studentId='';const originalCodes=env.accessCodes,headers=()=>({'x-student-id':studentId});
const pageText='Applications require a teacher recommendation. Submit a project outline. The deadline is January 10, 2030.';
beforeAll(async()=>{writeFileSync(join(dir,'test.db'),'');await promisify(execFile)(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url}});},30000);
beforeEach(async()=>{
 vi.unstubAllEnvs();vi.stubEnv('DISCOVERY_ENABLED','true');vi.stubEnv('SEARCH_PROVIDER','openai');vi.stubEnv('OPENAI_API_KEY','test');vi.stubEnv('AI_DISABLED','false');env.aiDisabled=false;env.accessCodes=[];await db.student.deleteMany();await db.opportunity.deleteMany();await db.aIUsage.deleteMany();await db.jobLease.deleteMany();await db.discoveryRun.deleteMany();await db.discoveryUsage.deleteMany();
 studentId=(await db.student.create({data:{name:'Student',grade:10}})).id;
 await db.opportunity.create({data:{id:'program',name:'Program',organizer:'Example',category:'Program',url:'https://example.edu/rules',gradeMin:9,gradeMax:12,format:'Virtual',cost:'Free',commitment:'Low',skills:'[]',tags:'[]',deadline:'2030-01-10',requirements:'["Submit a project outline."]',evidence:JSON.stringify({requirements:{sourceUrl:'https://example.edu/rules',quote:pageText},deadline:{sourceUrl:'https://example.edu/rules',quote:pageText}})}});
 await db.sourcePage.create({data:{opportunityId:'program',sourceUrl:'https://example.edu/rules',pageTitle:'Rules',text:pageText,contentHash:'initial'}});
 await db.savedOpportunity.create({data:{studentId,opportunityId:'program',status:'interested'}});
 holder.runtime={store:memoryStore(2),embedder:{dimension:2,model:'test',embed:vi.fn(async(texts:string[])=>texts.map(()=>[1,0]))}};
 holder.llm={runTools:vi.fn(async()=>({})),text:vi.fn(),json:vi.fn()};
});
afterAll(async()=>{vi.unstubAllEnvs();env.accessCodes=originalCodes;await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('ingests shared chunks, skips unchanged content, replaces changed vectors and removes orphans',async()=>{
 await ingestKnowledge('program',new RunBudget());const first=await db.knowledgeChunk.findFirstOrThrow();await ingestKnowledge('program',new RunBudget());expect(holder.runtime.embedder.embed).toHaveBeenCalledTimes(1);
 await db.sourcePage.updateMany({data:{text:pageText+' New requirement.',contentHash:'changed'}});await ingestKnowledge('program',new RunBudget());const second=await db.knowledgeChunk.findFirstOrThrow();expect(second.id).not.toBe(first.id);expect((await holder.runtime.store.list()).ids).toEqual([second.id]);
 await holder.runtime.store.upsert([{id:'orphan',values:[1,0],metadata:{chunkId:'orphan',opportunityId:'program',sourceUrl:'https://example.edu',pageTitle:'Old',checkedAt:new Date().toISOString()}}]);expect(await reconcileVectors()).toBe(1);
 await expect(searchKnowledge(studentId,'requirements','different-program')).rejects.toMatchObject({status:403});expect((await searchKnowledge(studentId,'requirements','program'))[0].id).toBe(second.id);
});
it('rejects wrong-opportunity records returned by a faulty vector service',async()=>{
 await ingestKnowledge('program',new RunBudget());const c=await db.knowledgeChunk.findFirstOrThrow();const other=await db.opportunity.create({data:{...(await db.opportunity.findUniqueOrThrow({where:{id:'program'}})),id:'someone-else',name:'Other'}});await db.savedOpportunity.create({data:{studentId,opportunityId:other.id}});holder.runtime.store.query=async()=>[{id:c.id,score:1}];expect(await searchKnowledge(studentId,'requirements','someone-else')).toEqual([]);
});
it('answers scoped Buddy questions with source citations, limits retrieval and rejects fabricated claims',async()=>{
 await ingestKnowledge('program',new RunBudget());const c=await db.knowledgeChunk.findFirstOrThrow();let round=0;holder.llm.json.mockImplementation(async()=>({claims:[{chunkId:c.id,quote:'Applications require a teacher recommendation.'},{chunkId:c.id,quote:'Acceptance is guaranteed.'}],nextQuery:`requirements search ${++round}`}));
 const app=await buildApp();app.log.level='silent';try{const r=await app.inject({method:'POST',url:'/api/buddy/messages',headers:headers(),payload:{text:'What is required?',opportunityId:'program'}});expect(r.statusCode).toBe(200);expect(r.json().reply).toContain('teacher recommendation');expect(r.json().reply).not.toContain('guaranteed');expect(r.json().citations[0]).toMatchObject({sourceUrl:'https://example.edu/rules',pageTitle:'Rules'});expect(holder.runtime.embedder.embed.mock.calls.length).toBe(4);expect(await db.agentAction.count()).toBe(0);
 holder.llm.json.mockResolvedValue({claims:[],nextQuery:null});const next=await app.inject({method:'POST',url:'/api/buddy/messages',headers:headers(),payload:{text:'Is lunch provided?',conversationId:r.json().conversationId}});expect(next.json().reply).toContain('official pages don’t say');
 }finally{await app.close();}
});
it('creates a source-backed checklist proposal and applies only after approval, preserving student notes and completed steps',async()=>{
 const app=await buildApp();app.log.level='silent';try{
 await app.inject({method:'POST',url:'/api/opportunities/program/status',headers:headers(),payload:{status:'saved'}});
 await db.savedOpportunity.updateMany({data:{citedDeadline:null,notes:'My private notes',deadline:'2030-01-05',checklist:'[{"title":"My completed step","done":true}]'}});
 const r=await app.inject({method:'POST',url:'/api/opportunities/program/requirements',headers:headers()});expect(r.statusCode).toBe(200);expect(r.json().status).toBe('AWAITING_APPROVAL');expect((await db.savedOpportunity.findFirstOrThrow()).citedDeadline).toBeNull();
 const approved=await app.inject({method:'POST',url:`/api/proposals/${r.json().id}/approve`,headers:headers()});expect(approved.json().status).toBe('VERIFIED');const saved=await db.savedOpportunity.findFirstOrThrow();expect(saved).toMatchObject({notes:'My private notes',deadline:'2030-01-05',citedDeadline:'2030-01-10'});expect(JSON.parse(saved.checklist)).toContainEqual({title:'My completed step',done:true});expect(JSON.parse(saved.checklist)).toContainEqual({title:'Submit a project outline.',done:false});
 }finally{await app.close();}
});
it('fails and rolls back a checklist proposal if source facts change before approval',async()=>{
 const app=await buildApp();app.log.level='silent';try{await app.inject({method:'POST',url:'/api/opportunities/program/status',headers:headers(),payload:{status:'saved'}});await db.savedOpportunity.updateMany({data:{citedDeadline:null}});const r=await app.inject({method:'POST',url:'/api/opportunities/program/requirements',headers:headers()});await db.opportunity.update({where:{id:'program'},data:{requirements:'[]'}});const approved=await app.inject({method:'POST',url:`/api/proposals/${r.json().id}/approve`,headers:headers()});expect(approved.json().status).toBe('FAILED');expect((await db.savedOpportunity.findFirstOrThrow()).citedDeadline).toBeNull();}finally{await app.close();}
});
it('pins the official deadline when Interested so a later catalog update cannot silently change the application',async()=>{
 await db.savedOpportunity.deleteMany();
 const app=await buildApp();app.log.level='silent';try{await app.inject({method:'POST',url:'/api/opportunities/program/status',headers:headers(),payload:{status:'saved'}});await db.opportunity.update({where:{id:'program'},data:{deadline:'2031-01-10'}});expect((await app.inject({url:'/api/applications',headers:headers()})).json()[0].deadline).toBe('2030-01-10');}finally{await app.close();}
});

it('does not answer from an outdated snapshot while changed pages await embedding, and retires removed-page vectors',async()=>{
 await ingestKnowledge('program',new RunBudget());expect(await searchKnowledge(studentId,'requirements','program')).toHaveLength(1);
 await db.sourcePage.updateMany({data:{contentHash:'pending',text:'A changed official page with different requirements.'}});expect(await searchKnowledge(studentId,'requirements','program')).toEqual([]);
 await db.sourcePage.deleteMany();await ingestKnowledge('program',new RunBudget());expect(await db.knowledgeChunk.count()).toBe(0);expect((await holder.runtime.store.list()).ids).toEqual([]);
});

it('keeps the friendly service-unavailable response when a LangGraph retrieval node fails',async()=>{
 holder.runtime.embedder.embed.mockRejectedValue(new Error('private provider error'));
 const app=await buildApp();app.log.level='silent';try{const r=await app.inject({method:'POST',url:'/api/buddy/messages',headers:headers(),payload:{text:'What is required?',opportunityId:'program'}});expect(r.statusCode).toBe(503);expect(r.json().error).toContain('questions are taking a break');expect(r.json().error).not.toContain('private provider error');expect(await db.agentAction.count()).toBe(0);}finally{await app.close();}
});

it('keeps search available when the independent program library is unavailable',async()=>{
 holder.runtime=null;const app=await buildApp();app.log.level='silent';try{
 const status=await app.inject({url:'/api/discovery/status',headers:headers()});expect(status.json()).toMatchObject({enabled:true,error:null,unavailable:null});
 const catalog=await app.inject({url:'/api/opportunities',headers:headers()});expect(catalog.json()).toMatchObject({discoveryEnabled:true,knowledgeUnavailable:{code:'vector_unavailable'}});
 expect(await db.aIUsage.count()).toBe(0);
 }finally{await app.close();}
});

it('reports student consent separately and clears the setup issue when discovery is ready',async()=>{
 const app=await buildApp();app.log.level='silent';try{
 await db.student.update({where:{id:studentId},data:{aiConsent:false}});
 expect((await app.inject({url:'/api/discovery/status',headers:headers()})).json()).toMatchObject({enabled:false,unavailable:{code:'ai_consent_required'}});
 await db.student.update({where:{id:studentId},data:{aiConsent:true}});
 expect((await app.inject({url:'/api/discovery/status',headers:headers()})).json()).toMatchObject({enabled:true,unavailable:null});
 }finally{await app.close();}
});

it('enforces membership for direct requests, follow-ups and agent tools without an AI charge',async()=>{
 const other=await db.student.create({data:{name:'Other',grade:10}});await ingestKnowledge('program',new RunBudget());const app=await buildApp();app.log.level='silent';
 try {const r=await app.inject({method:'POST',url:'/api/buddy/messages',headers:{'x-student-id':other.id},payload:{text:'Requirements?',opportunityId:'program'}});expect(r.statusCode).toBe(403);expect(holder.llm.json).not.toHaveBeenCalled();expect(await db.aIUsage.count()).toBe(0);
 const {TOOLS}=await import('../src/agent/tools.js');await expect(TOOLS.find(t=>t.name==='search_knowledge')!.run({opportunityId:'program',query:'requirements'},other.id,[],[])).rejects.toMatchObject({status:403});
 const mine=await app.inject({method:'POST',url:'/api/buddy/messages',headers:headers(),payload:{text:'Requirements?',opportunityId:'program'}});await db.savedOpportunity.deleteMany({where:{studentId}});
 expect((await app.inject({method:'POST',url:'/api/buddy/messages',headers:headers(),payload:{text:'More?',conversationId:mine.json().conversationId}})).statusCode).toBe(403);
 }finally{await app.close();}
});
it('groups my_opportunities answers by program and renders structured facts from SQL',async()=>{
 const sourceUrl='https://other.edu/apply';const first=await db.opportunity.findUniqueOrThrow({where:{id:'program'}});await db.opportunity.update({where:{id:'program'},data:{cost:'Cost not confirmed',costType:'unknown',applicationStatus:'rolling'}});
 await db.opportunity.create({data:{...first,id:'second',name:'Second program',url:sourceUrl,deadline:'2031-02-10',cost:'$50',costType:'paid',costAmount:'$50',costVerifiedAt:new Date(),sourceCheckedAt:new Date()}});
 await db.savedOpportunity.create({data:{studentId,opportunityId:'second'}});await db.sourcePage.create({data:{opportunityId:'second',sourceUrl,pageTitle:'Second rules',text:'Teams must submit a project outline. The deadline is 2099-01-01. Participation is free.',contentHash:'second'}});
 await ingestKnowledge('program',new RunBudget());await ingestKnowledge('second',new RunBudget());const chunks=await db.knowledgeChunk.findMany();holder.llm.json.mockResolvedValue({claims:chunks.map(c=>({chunkId:c.id,quote:c.opportunityId==='program'?'Applications require a teacher recommendation.':'Teams must submit a project outline.'})),nextQuery:null});
 const app=await buildApp();app.log.level='silent';try{const r=await app.inject({method:'POST',url:'/api/buddy/messages',headers:headers(),payload:{text:'What are my opportunities’ deadlines, costs and requirements?',scope:'my_opportunities'}});expect(r.statusCode).toBe(200);const answer=r.json();expect(answer.reply).toContain('Program\n');expect(answer.reply).toContain('Second program\n');expect(answer.reply).toContain('2031-02-10');expect(answer.reply).toContain('$50');expect(answer.reply).not.toContain('2099-01-01');expect(answer.reply).toContain('Cost not confirmed');expect(answer.citations.some((c:any)=>c.opportunityId==='second')).toBe(true);expect(answer.scope).toBe('my_opportunities');expect(answer.opportunityId).toBeUndefined();
 const {TOOLS}=await import('../src/agent/tools.js');const result:any=await TOOLS.find(t=>t.name==='search_knowledge')!.run({scope:'my_opportunities',query:'requirements'},studentId,[],[]);expect(result.programs.map((p:any)=>p.opportunityId)).toEqual(['program','second']);
 await expect(TOOLS.find(t=>t.name==='search_knowledge')!.run({scope:'my_opportunities',opportunityIds:['program'],query:'requirements'},studentId,[],[])).rejects.toThrow();
 }finally{await app.close();}
});
it('re-ingests into a different index even when the embedding model and source text are unchanged',async()=>{
 holder.runtime.store.identity='index-one';await ingestKnowledge('program',new RunBudget());const first=await db.knowledgeChunk.findFirstOrThrow();holder.runtime.store=memoryStore(2);holder.runtime.store.identity='index-two';await ingestKnowledge('program',new RunBudget());const second=await db.knowledgeChunk.findFirstOrThrow();expect(second.id).not.toBe(first.id);expect(second.vectorStoreKey).toBe('index-two');expect((await holder.runtime.store.list()).ids).toEqual([second.id]);expect(holder.runtime.embedder.embed).toHaveBeenCalledTimes(2);
});
it('prepares a shared program once for multiple students and leaves failed paid work for an explicit new generation',async()=>{
 const {prepareKnowledgeBatch,knowledgeStates}=await import('../src/knowledge/preparation.js');expect((await knowledgeStates(['program'])).program).toBe('preparing');
 await db.opportunity.update({where:{id:'program'},data:{sourceCheckedAt:new Date()}});expect(await prepareKnowledgeBatch(studentId)).toBe(1);expect((await knowledgeStates(['program'])).program).toBe('ready');
 const other=await db.student.create({data:{name:'Other',grade:10}});await db.savedOpportunity.create({data:{studentId:other.id,opportunityId:'program'}});expect(await prepareKnowledgeBatch(other.id)).toBe(0);expect(holder.runtime.embedder.embed).toHaveBeenCalledTimes(1);
 await db.sourcePage.updateMany({data:{contentHash:'new generation'}});holder.runtime.embedder.embed.mockRejectedValueOnce(new Error('private provider error'));expect(await prepareKnowledgeBatch(other.id)).toBe(1);expect((await knowledgeStates(['program'])).program).toBe('unavailable');const calls=holder.runtime.embedder.embed.mock.calls.length;expect(await prepareKnowledgeBatch(studentId)).toBe(0);expect(holder.runtime.embedder.embed).toHaveBeenCalledTimes(calls);
});
it('reconciliation preserves expired programs still referenced by a student and retires unreferenced chunks',async()=>{
 await ingestKnowledge('program',new RunBudget());await db.opportunity.update({where:{id:'program'},data:{verificationStatus:'expired'}});expect(await reconcileVectors()).toBe(0);expect(await db.knowledgeChunk.count()).toBe(1);await db.savedOpportunity.deleteMany();expect(await reconcileVectors()).toBe(1);expect(await db.knowledgeChunk.count()).toBe(0);expect((await holder.runtime.store.list()).ids).toEqual([]);expect(await db.sourcePage.count()).toBe(1);
});
it('a dismissal removes retrieval scope immediately while shared passages stay stored',async()=>{
 await ingestKnowledge('program',new RunBudget());const app=await buildApp();app.log.level='silent';try{await app.inject({method:'POST',url:'/api/opportunities/program/status',headers:headers(),payload:{status:'dismissed',reason:'cost'}});await expect(searchKnowledge(studentId,'requirements','program')).rejects.toMatchObject({status:403});expect(await db.knowledgeChunk.count()).toBe(1);}finally{await app.close();}
});

it('prepares the student’s existing program details while live search is turned off',async()=>{
 vi.stubEnv('DISCOVERY_ENABLED','false');await db.opportunity.update({where:{id:'program'},data:{sourceCheckedAt:new Date()}});const app=await buildApp();app.log.level='silent';try{
 const response=await app.inject({method:'POST',url:'/api/discovery/run',headers:headers(),payload:{}});expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({skipped:false,result:{discovered:0,prepared:1}});expect(holder.runtime.embedder.embed).toHaveBeenCalledTimes(1);expect(holder.llm.json).not.toHaveBeenCalled();expect((await db.discoveryRun.findFirstOrThrow()).kind).toBe('knowledge');
 expect((await app.inject({method:'POST',url:'/api/discovery/run',headers:headers(),payload:{opportunityIds:['program']}})).statusCode).toBe(422);
 }finally{await app.close();}
});
it('prepares a needs-checking Scout pick once without re-extracting, and Buddy retains its warning',async()=>{
 await db.savedOpportunity.deleteMany();
 await db.opportunity.update({where:{id:'program'},data:{verificationStatus:'needs_verification',promptVersion:'scout-v1',sourceReadAt:new Date(),sourceCheckedAt:null,minAge:16,checks:'["Confirm minimum age 16; age is not inferred from grade"]',evidence:JSON.stringify({name:{sourceUrl:'https://example.edu/rules',quote:'Program'},deadline:{sourceUrl:'https://example.edu/rules',quote:pageText}})}});
 await db.studentPick.create({data:{studentId,opportunityId:'program',bucket:'paid',rank:0,refreshCycle:'test'}});
 const {studentOpportunityIds}=await import('../src/knowledge/scope.js');expect(await studentOpportunityIds(studentId)).toEqual(['program']);
 const {prepareKnowledgeBatch}=await import('../src/knowledge/preparation.js');expect(await prepareKnowledgeBatch(studentId)).toBe(1);expect(await prepareKnowledgeBatch(studentId)).toBe(0);
 expect(holder.runtime.embedder.embed).toHaveBeenCalledTimes(1);expect(holder.llm.json).not.toHaveBeenCalled();
 const {structuredFacts}=await import('../src/knowledge/facts.js');const {loadContext}=await import('../src/lib/context.js');
 const facts=structuredFacts(await db.opportunity.findUniqueOrThrow({where:{id:'program'}}),(await loadContext(studentId)).ctx);
 expect(facts.source.value).toContain('details need checking');expect(facts.eligibility.value).toContain('minimum age 16');
 await db.opportunityFeedback.create({data:{studentId,opportunityId:'program',reason:'other'}});expect(await studentOpportunityIds(studentId)).toEqual([]);expect(await db.knowledgeChunk.count()).toBeGreaterThan(0);
});

const ownerSecret='knowledge-owner-secret-'.repeat(3);
const ownerHeaders=()=>({authorization:'Bearer '+ownerSecret});
it('recovers legacy limited markers after a cap increase, using saved text without a source recheck',async()=>{
 const {prepareKnowledgeBatch,knowledgeSnapshot,knowledgeDetails}=await import('../src/knowledge/preparation.js');
 const external=vi.spyOn(await import('../src/discovery/pages.js'),'fetchOfficialPage');
 vi.stubEnv('DISCOVERY_RECHECKS_PER_MONTH','0');
 const state=await knowledgeSnapshot('program',holder.runtime);
 await db.jobLease.create({data:{key:state.key,owner:'limited',expiresAt:new Date('2100-01-01')}});
 expect((await knowledgeDetails(['program'])).program.reason).toBe('preparation_monthly_limit');
 expect(await prepareKnowledgeBatch(studentId)).toBe(0);expect(holder.runtime.embedder.embed).not.toHaveBeenCalled();
 vi.stubEnv('DISCOVERY_RECHECKS_PER_MONTH','1');
 expect((await knowledgeDetails(['program'])).program.state).toBe('preparing');
 expect(await prepareKnowledgeBatch(studentId)).toBe(1);expect(external).not.toHaveBeenCalled();
 expect((await knowledgeDetails(['program'])).program.state).toBe('ready');
 expect((await db.discoveryUsage.findFirstOrThrow()).rechecks).toBe(1);
 const run=await db.discoveryRun.findFirstOrThrow();expect(JSON.parse(run.usage).indexing).toMatchObject({embeddingCallsSucceeded:1,vectorRecordsAcknowledged:1,sqlChunksCommitted:1});
 expect(await prepareKnowledgeBatch(studentId)).toBe(0);expect(holder.runtime.embedder.embed).toHaveBeenCalledOnce();
});
it('retains a failed paid marker, exposes the embedding stage safely, and permits only an explicit bounded owner retry',async()=>{
 const {prepareKnowledgeBatch}=await import('../src/knowledge/preparation.js');vi.stubEnv('JOBS_SECRET',ownerSecret);
 holder.runtime.embedder.embed.mockRejectedValueOnce(Object.assign(new Error('sk-private-provider-body'),{status:403}));
 expect(await prepareKnowledgeBatch(studentId)).toBe(1);
 const failed=await db.discoveryRun.findFirstOrThrow();expect(JSON.parse(failed.usage).failures[0]).toMatchObject({component:'embedding',operation:'embed',code:'embedding_failed',httpStatus:403});
 expect(await prepareKnowledgeBatch(studentId)).toBe(0);expect(holder.runtime.embedder.embed).toHaveBeenCalledOnce();
 const app=await buildApp();app.log.level='silent';try{
  const payload={opportunityId:'program',allowPaid:true};
  expect((await app.inject({method:'POST',url:'/internal/knowledge/prepare',payload})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:'/internal/knowledge/prepare',headers:ownerHeaders(),payload:{opportunityId:'program'}})).statusCode).toBe(422);
  const result=await app.inject({method:'POST',url:'/internal/knowledge/prepare',headers:ownerHeaders(),payload});
  expect(result.statusCode).toBe(200);expect(result.json().program).toMatchObject({sqlReady:true,vectorConfirmation:'confirmed',vectorsFound:1});
  expect(result.body).not.toContain('sk-private-provider-body');expect(holder.runtime.embedder.embed).toHaveBeenCalledTimes(2);
  const records=(await holder.runtime.store.list()).ids;await holder.runtime.store.delete(records);
  expect((await app.inject({method:'POST',url:'/internal/knowledge/prepare',headers:ownerHeaders(),payload})).statusCode).toBe(429);
  expect(holder.runtime.embedder.embed).toHaveBeenCalledTimes(2);
 }finally{await app.close();}
});
it('distinguishes failed Pinecone writes from successful embeddings and does not create SQL chunks after a failed upsert',async()=>{
 const {prepareKnowledgeBatch}=await import('../src/knowledge/preparation.js');
 vi.spyOn(holder.runtime.store,'upsert').mockRejectedValueOnce(Object.assign(new Error('private-vector-request'),{status:400}));
 await prepareKnowledgeBatch(studentId);
 const run=await db.discoveryRun.findFirstOrThrow(),usage=JSON.parse(run.usage);
 expect(run.status).toBe('failed');expect(usage.failures[0]).toMatchObject({code:'vector_write_failed',component:'vector',operation:'upsert',httpStatus:400});
 expect(usage.indexing).toMatchObject({embeddingCallsSucceeded:1,vectorRecordsAttempted:1,vectorRecordsAcknowledged:0,sqlChunksCommitted:0});
 expect(await db.knowledgeChunk.count()).toBe(0);expect(run.usage).not.toContain('private-vector-request');
});
it('distinguishes SQL commit failures from vector acknowledgements and keeps useful source pages',async()=>{
 const {prepareKnowledgeBatch}=await import('../src/knowledge/preparation.js');
 await db.$executeRawUnsafe("CREATE TRIGGER reject_test_chunk BEFORE INSERT ON KnowledgeChunk BEGIN SELECT RAISE(ABORT, 'private-sql-detail'); END");
 try{
  await prepareKnowledgeBatch(studentId);
  const usage=JSON.parse((await db.discoveryRun.findFirstOrThrow()).usage);
  expect(usage.failures[0]).toMatchObject({component:'database',operation:'chunk_commit',code:'knowledge_storage_failed'});
  expect(usage.indexing).toMatchObject({vectorRecordsAcknowledged:1,sqlChunksCommitted:0});
  expect(await db.knowledgeChunk.count()).toBe(0);expect(await db.sourcePage.count()).toBe(1);expect(JSON.stringify(usage)).not.toContain('private-sql-detail');
 }finally{await db.$executeRawUnsafe('DROP TRIGGER reject_test_chunk');}
});
it('detects embedding dimension failures before vector writes',async()=>{
 const {prepareKnowledgeBatch}=await import('../src/knowledge/preparation.js');
 holder.runtime.embedder.embed.mockResolvedValueOnce([[1,0,0]]);await prepareKnowledgeBatch(studentId);
 const usage=JSON.parse((await db.discoveryRun.findFirstOrThrow()).usage);
 expect(usage.failures[0]).toMatchObject({code:'embedding_dimension_mismatch',expectedDimension:2,actualDimension:3});
 expect(usage.indexing.vectorRecordsAttempted).toBe(0);expect((await holder.runtime.store.list()).ids).toEqual([]);
});
it('checks namespace records without paid calls, and explicitly repairs a lost vector generation without deleting replacement IDs',async()=>{
 vi.stubEnv('JOBS_SECRET',ownerSecret);await ingestKnowledge('program',new RunBudget());
 const count=holder.runtime.embedder.embed.mock.calls.length,ids=(await holder.runtime.store.list()).ids;
 await holder.runtime.store.delete(ids);
 const app=await buildApp();app.log.level='silent';try{
  const status=await app.inject({url:'/internal/knowledge/status?opportunityId=program',headers:ownerHeaders()});
  expect(status.json().program).toMatchObject({sqlReady:true,vectorConfirmation:'pending_or_missing',vectorsFound:0});expect(holder.runtime.embedder.embed).toHaveBeenCalledTimes(count);
  const repaired=await app.inject({method:'POST',url:'/internal/knowledge/prepare',headers:ownerHeaders(),payload:{opportunityId:'program',allowPaid:true}});
  expect(repaired.json().program).toMatchObject({sqlReady:true,vectorConfirmation:'confirmed',vectorsFound:1});
  expect((await holder.runtime.store.list()).ids).toEqual(ids);expect(await db.knowledgeChunk.count()).toBe(1);
 }finally{await app.close();}
});
it('contains knowledge schema drift to the question feature and reports P2022 before embeddings',async()=>{
 vi.stubEnv('JOBS_SECRET',ownerSecret);
 await db.$executeRawUnsafe('ALTER TABLE KnowledgeChunk RENAME COLUMN vectorStoreKey TO renamed_for_schema_test');
 const app=await buildApp();app.log.level='silent';try{
  const readiness=await app.inject({url:'/internal/knowledge/status?opportunityId=program',headers:ownerHeaders()});
  expect(readiness.json()).toMatchObject({configurationReady:false,failure:{code:'knowledge_storage_unready',databaseCode:'P2022',component:'database'}});
  expect((await app.inject({url:'/api/opportunities',headers:headers()})).statusCode).toBe(200);expect(holder.runtime.embedder.embed).not.toHaveBeenCalled();
 }finally{await app.close();await db.$executeRawUnsafe('ALTER TABLE KnowledgeChunk RENAME COLUMN renamed_for_schema_test TO vectorStoreKey');}
});
it('keeps old source facts visibly stale while preparing their existing public text',async()=>{
 const old=new Date(Date.now()-40*86400000);await db.opportunity.update({where:{id:'program'},data:{isSample:false,source:'discovery',verificationStatus:'verified',sourceCheckedAt:old,sourceReadAt:old}});
 await db.sourcePage.updateMany({data:{checkedAt:old}});
 const {prepareKnowledgeBatch}=await import('../src/knowledge/preparation.js');await prepareKnowledgeBatch(studentId);
 const app=await buildApp();app.log.level='silent';try{
  const list=(await app.inject({url:'/api/opportunities',headers:headers()})).json();const p=list.recommended.find((o:any)=>o.id==='program');
  expect(p).toMatchObject({verified:false,verificationStatus:'stale'});expect(p.checks.join()).toContain('out of date');
  expect((await db.sourcePage.findFirstOrThrow()).checkedAt).toEqual(old);expect((await db.opportunity.findUniqueOrThrow({where:{id:'program'}})).sourceCheckedAt).toEqual(old);
 }finally{await app.close();}
});

it('runs catalog reuse → preparation → real Pinecone SDK wire writes → scoped grounded answer, with no live provider',async()=>{
 const records=new Map<string,any>(),wire:{path:string;body:any}[]=[];
 vi.stubEnv('PINECONE_API_KEY','pcsk-test-wire-only');vi.stubEnv('PINECONE_INDEX','pathway-wire');vi.stubEnv('VECTOR_STORE','pinecone');vi.stubEnv('JOBS_SECRET',ownerSecret);
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const request=new Request(input,init),url=new URL(request.url),raw=await request.text(),body=raw?JSON.parse(raw):{};wire.push({path:url.pathname,body});
  const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
  if(url.pathname==='/indexes/pathway-wire')return json({name:'pathway-wire',host:'wire.svc.pinecone.io',deployment:{deployment_type:'managed',cloud:'aws',region:'us-east-1'},schema:{fields:{_values:{type:'dense_vector',dimension:2,metric:'cosine'}}},deletion_protection:'disabled',status:{ready:true,state:'Ready'}});
  if(url.pathname==='/vectors/upsert'){
   expect(body.namespace).toBe('opportunities');expect(body.vectors.length).toBeGreaterThan(0);
   for(const r of body.vectors){expect(r.values).toHaveLength(2);records.set(r.id,r);}
   return json({upsertedCount:body.vectors.length});
  }
  if(url.pathname==='/vectors/fetch'){
   expect(url.searchParams.get('namespace')).toBe('opportunities');
   return json({namespace:'opportunities',vectors:Object.fromEntries(url.searchParams.getAll('ids').filter(id=>records.has(id)).map(id=>[id,records.get(id)]))});
  }
  if(url.pathname==='/describe_index_stats')return json({dimension:2,totalVectorCount:records.size,namespaces:{opportunities:{vectorCount:records.size}}});
  if(url.pathname==='/query'){
   expect(body.namespace).toBe('opportunities');expect(body.filter).toEqual({opportunityId:{$in:['program']}});
   // Deliberately noisy vendor results: SQL must still enforce program scope.
   return json({namespace:'opportunities',matches:[...records.keys()].map(id=>({id,score:1}))});
  }
  if(url.pathname==='/vectors/delete'){for(const id of body.ids||[])records.delete(id);return json({});}
  throw new Error('Unexpected test transport request');
 });
 const {pineconeStore}=await import('../src/knowledge/adapters/pinecone.js');holder.runtime.store=pineconeStore();
 await db.savedOpportunity.deleteMany();await db.student.update({where:{id:studentId},data:{region:'US',interests:'["coding"]'}});
 const original=await db.opportunity.findUniqueOrThrow({where:{id:'program'}});
 await db.opportunity.update({where:{id:'program'},data:{isSample:false,source:'discovery',costType:'free',costVerifiedAt:new Date(),sourceReadAt:new Date(),tags:'["coding"]',skills:'["coding"]'}});
 for(let i=0;i<5;i++){
  const id='wire-'+i;
  await db.opportunity.create({data:{...original,id,name:'Example Coding '+i,isSample:false,source:'discovery',url:'https://example.edu/'+id,costType:i<2?'free':'paid',cost:i<2?'Free':'$50',costVerifiedAt:new Date(),sourceReadAt:new Date(),tags:'["coding"]',skills:'["coding"]'}});
  await db.sourcePage.create({data:{opportunityId:id,sourceUrl:'https://example.edu/'+id,pageTitle:'Coding rules',text:pageText,contentHash:id}});
 }
 const app=await buildApp();app.log.level='silent';try{
  const reused=await app.inject({method:'POST',url:'/api/opportunities/refresh',headers:headers()});expect(reused.json().usedSharedCatalog).toBe(true);
  for(let i=0;i<8;i++){
   const list=(await app.inject({url:'/api/opportunities',headers:headers()})).json();if(list.knowledgeStates.program==='ready'&&records.size===6)break;
   expect((await app.inject({method:'POST',url:'/api/discovery/run',headers:headers(),payload:{}})).statusCode).toBe(200);
  }
  const list=(await app.inject({url:'/api/opportunities',headers:headers()})).json();expect(list.knowledgeStates.program,JSON.stringify({details:list.knowledgeDetails,runs:await db.discoveryRun.findMany(),paths:wire.map(w=>w.path)})).toBe('ready');
  expect(records.size).toBe(6);expect(await db.knowledgeChunk.count()).toBe(6);
  expect(wire.filter(r=>r.path==='/vectors/upsert')).toHaveLength(6);
  const chunk=await db.knowledgeChunk.findFirstOrThrow({where:{opportunityId:'program'}});
  holder.llm.json.mockResolvedValue({claims:[{chunkId:chunk.id,quote:'Applications require a teacher recommendation.'}],nextQuery:null});
  const answer=await app.inject({method:'POST',url:'/api/buddy/messages',headers:headers(),payload:{opportunityId:'program',text:'What is required?'}});
  expect(answer.statusCode).toBe(200);expect(answer.json().reply).toContain('teacher recommendation');expect(answer.json().citations.every((c:any)=>c.opportunityId==='program')).toBe(true);
  const status=await app.inject({url:'/internal/knowledge/status?opportunityId=program',headers:ownerHeaders()});
  expect(status.json(),JSON.stringify({status:status.json(),paths:wire.map(w=>w.path)})).toMatchObject({configurationReady:true,store:'pinecone',namespace:'opportunities',namespaceRecords:6,indexDimension:2,program:{sqlReady:true,vectorConfirmation:'confirmed',vectorsFound:1}});
  expect(JSON.stringify([...records.values()])).not.toContain('Student');
 }finally{await app.close();}
});

it('restores a maps-only personal successful-search slot once while preserving paid usage and saved progress',async()=>{
 const now=new Date();await db.opportunity.update({where:{id:'program'},data:{url:'https://www.google.com/maps/search/Example+Program'}});
 await db.pickRefreshState.create({data:{studentId,cycleStartedAt:now,autoRefreshedAt:now,manualUsed:1,interestSignature:'coding'}});
 await db.opportunitySearchRequest.create({data:{studentId,kind:'initial',signature:'maps-only',status:'complete',groupBindings:'[]',resultIds:'["program"]',manualSlot:'base',cycleStartedAt:now,countedAt:now}});
 const month=now.toISOString().slice(0,7);await db.discoveryUsage.create({data:{month,runs:4,rechecks:30,embeddings:16,vectorUpserts:39}});
 const {refreshStatus}=await import('../src/discovery/refresh.js');
 expect((await refreshStatus(studentId,now)).remaining).toBe(1);expect((await refreshStatus(studentId,now)).remaining).toBe(1);
 expect((await db.discoveryUsage.findUniqueOrThrow({where:{month}}))).toMatchObject({runs:4,rechecks:30,embeddings:16,vectorUpserts:39});
 expect(await db.savedOpportunity.count()).toBe(1);expect(await db.opportunity.count()).toBe(1);
 expect(await db.auditEvent.count({where:{studentId,event:'Restored search allowance for empty results'}})).toBe(1);
});

it('does not spin or fund preparation for a saved listing without readable program text',async()=>{
 await db.sourcePage.deleteMany();await db.opportunity.update({where:{id:'program'},data:{url:'https://www.google.com/maps/search/Example'}});
 const {knowledgeDetails,prepareKnowledgeBatch}=await import('../src/knowledge/preparation.js');
 expect((await knowledgeDetails(['program'])).program).toMatchObject({state:'unavailable',reason:'source_unavailable'});
 expect(await prepareKnowledgeBatch(studentId)).toBe(0);expect(await db.discoveryRun.count()).toBe(0);expect(holder.runtime.embedder.embed).not.toHaveBeenCalled();
});

it('reports an active funded preparation as running even after its reservation fills the monthly cap',async()=>{
 const {knowledgeSnapshot,knowledgeDetails}=await import('../src/knowledge/preparation.js');
 const state=await knowledgeSnapshot('program',holder.runtime);
 await db.jobLease.create({data:{key:state.key,owner:'running',expiresAt:new Date(Date.now()+60000)}});
 vi.stubEnv('DISCOVERY_RECHECKS_PER_MONTH','1');await db.discoveryUsage.create({data:{month:new Date().toISOString().slice(0,7),rechecks:1}});
 expect((await knowledgeDetails(['program'])).program).toMatchObject({state:'preparing',reason:'running'});
});

it('includes empty-prompt knowledge failures in owner diagnostics without invoking embeddings or search',async()=>{
 vi.stubEnv('JOBS_SECRET',ownerSecret);
 const run=await db.discoveryRun.create({data:{groupKey:'knowledge:program',kind:'knowledge',status:'failed',promptVersion:'',usage:JSON.stringify({phase:'writing_vectors',indexing:{vectorRecordsAttempted:1,vectorRecordsAcknowledged:0},failures:[{stage:'index',code:'vector_write_failed',component:'vector',operation:'upsert'}]})}});
 const app=await buildApp();app.log.level='silent';try{
  const report=(await app.inject({url:'/internal/diagnostics',headers:ownerHeaders()})).json();
  expect(report.preparation.runs).toContainEqual(expect.objectContaining({id:run.id,kind:'knowledge',phase:'writing_vectors',indexing:{vectorRecordsAttempted:1,vectorRecordsAcknowledged:0}}));
  expect(holder.runtime.embedder.embed).not.toHaveBeenCalled();expect(await db.aIUsage.count()).toBe(0);
 }finally{await app.close();}
});

it.each([200,401,403])('uses the reported chunk_text schema through the actual Documents SDK (HTTP %s), without duplicate embedding or scope/privacy leaks',async(writeStatus)=>{
 const records=new Map<string,any>(),wire:{path:string;body:any}[]=[];
 vi.stubEnv('PINECONE_API_KEY','pcsk-document-test-only');vi.stubEnv('PINECONE_INDEX','pathway-vectors');vi.stubEnv('VECTOR_STORE','pinecone');vi.stubEnv('JOBS_SECRET',ownerSecret);
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const req=new Request(input,init),url=new URL(req.url),raw=await req.text(),body=raw?JSON.parse(raw):{};wire.push({path:url.pathname,body});
  const json=(v:unknown)=>new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json'}});
  if(url.pathname==='/indexes/pathway-vectors')return json(documentIndexResponse);
  if(url.pathname==='/describe_index_stats')return json({dimension:1536,totalVectorCount:records.size,namespaces:{opportunities:{vectorCount:records.size}}});
  expect(req.headers.get('X-Pinecone-Api-Version')).toBe('2026-07');
  if(url.pathname==='/namespaces/opportunities/documents/upsert'){
   if(writeStatus!==200)return new Response(JSON.stringify({message:'private-document-provider-sentinel'}),{status:writeStatus,headers:{'content-type':'application/json'}});
   for(const doc of body.documents){expect(doc.chunk_text).toContain('teacher recommendation');expect(doc.values).toBeUndefined();expect(doc.opportunityId).toBe('program');records.set(doc._id,doc);}
   return json({upserted_count:body.documents.length,usage:{embed_total_tokens:50}});
  }
  if(url.pathname==='/namespaces/opportunities/documents/fetch')return json({namespace:'opportunities',documents:Object.fromEntries(body.ids.filter((id:string)=>records.has(id)).map((id:string)=>[id,records.get(id)])),usage:{read_units:1,egress_bytes:10}});
  if(url.pathname==='/namespaces/opportunities/documents/search'){
   expect(body.filter).toEqual({opportunityId:{$in:['program']}});
   expect(body.score_by).toEqual([{type:'embed',field:'chunk_text',query:'application requirements recommendation documents submission'}]);
   expect(body.include_fields).toEqual([]);
   // A faulty vendor can return extra IDs. PostgreSQL still owns scope.
   return json({namespace:'opportunities',matches:[...records.keys(),'foreign-chunk'].map(_id=>({_id,_score:.95})),usage:{read_units:1,embed_total_tokens:10}});
  }
  if(url.pathname==='/namespaces/opportunities/documents/list')return json({namespace:'opportunities',documents:[...records.keys()].map(_id=>({_id})),usage:{read_units:1}});
  if(url.pathname==='/namespaces/opportunities/documents/delete'){for(const id of body.ids)records.delete(id);return json({matched_records:body.ids.length});}
  throw new Error('Unexpected transport request; live networking is forbidden in this test');
 });
 const {pineconeStore}=await import('../src/knowledge/adapters/pinecone.js');holder.runtime.store=pineconeStore();
 await holder.runtime.store.dimension();
 const externalEmbed=vi.fn().mockRejectedValue(new Error('Separate embedding must not run'));
 holder.runtime.embedder={provider:'pinecone-integrated',model:'text-embedding-3-small',dimension:1536,embed:externalEmbed};
 const app=await buildApp();app.log.level='silent';try{
  const initial=await app.inject({url:'/internal/knowledge/status?opportunityId=program',headers:ownerHeaders()});
  expect(initial.json()).toMatchObject({configurationReady:true,index:'pathway-vectors',indexDetails:{api:'documents',input:'text',field:'chunk_text'},embedding:{provider:'pinecone-integrated',model:'text-embedding-3-small',dimension:1536},namespaceRecords:0,program:{sqlReady:false}});
  expect(wire.every(w=>!w.path.endsWith('/upsert')&&!w.path.endsWith('/search'))).toBe(true);expect(await db.aIUsage.count()).toBe(0);
  const prepared=await app.inject({method:'POST',url:'/internal/knowledge/prepare',headers:ownerHeaders(),payload:{opportunityId:'program',allowPaid:true}});
  if(writeStatus!==200){
   expect(prepared.statusCode).toBe(200);expect(prepared.json().program.sqlReady).toBe(false);
   expect(await db.knowledgeChunk.count()).toBe(0);expect(records.size).toBe(0);
   expect(prepared.json().recentRuns[0].failures[0]).toMatchObject({code:'vector_write_failed',component:'vector',operation:'upsert',providerError:writeStatus===401?'authorization':'invalid_request'});
   expect(prepared.body).not.toContain('private-document-provider-sentinel');
   const before=wire.filter(w=>w.path.endsWith('/upsert')).length;
   const {prepareKnowledgeBatch}=await import('../src/knowledge/preparation.js');expect(await prepareKnowledgeBatch(studentId)).toBe(0);
   expect(wire.filter(w=>w.path.endsWith('/upsert'))).toHaveLength(before);expect(before).toBe(1);expect(externalEmbed).not.toHaveBeenCalled();return;
  }
  expect(prepared.statusCode).toBe(200);expect(prepared.json()).toMatchObject({processed:1,namespaceRecords:1,program:{sqlReady:true,matchingChunks:1,vectorConfirmation:'confirmed',vectorsFound:1}});
  const chunk=await db.knowledgeChunk.findFirstOrThrow();expect(chunk.embeddingModel).toBe('pinecone-integrated:text-embedding-3-small:1536');
  const run=await db.discoveryRun.findFirstOrThrow();expect(JSON.parse(run.usage).indexing).toMatchObject({embeddingMode:'pinecone-integrated',embeddingCallsAttempted:1,embeddingCallsSucceeded:1,vectorRecordsAttempted:1,vectorRecordsAcknowledged:1,sqlChunksCommitted:1});
  // A real SQL-backed chunk belonging to an unowned program must also be rejected.
  const original=await db.opportunity.findUniqueOrThrow({where:{id:'program'}});await db.opportunity.create({data:{...original,id:'other-program'}});
  await db.knowledgeChunk.create({data:{...chunk,id:'foreign-chunk',opportunityId:'other-program'}});
  holder.llm.json.mockResolvedValue({claims:[{chunkId:chunk.id,quote:'Applications require a teacher recommendation.'},{chunkId:'foreign-chunk',quote:'Applications require a teacher recommendation.'}],nextQuery:null});
  const privateQuestion='private-student-sentinel private@example.com What teacher recommendation is required?';
  const answer=await app.inject({method:'POST',url:'/api/buddy/messages',headers:headers(),payload:{opportunityId:'program',text:privateQuestion}});
  expect(answer.statusCode).toBe(200);expect(answer.json().reply).toContain('teacher recommendation');expect(answer.json().citations.every((c:any)=>c.opportunityId==='program')).toBe(true);expect(answer.json().citations.some((c:any)=>c.chunkId==='foreign-chunk')).toBe(false);
  expect(await holder.runtime.store.list()).toMatchObject({ids:[chunk.id]});
  await db.sourcePage.updateMany({data:{text:pageText+' The teacher recommendation remains required.',contentHash:'document-updated'}});
  await ingestKnowledge('program',new RunBudget());const replacement=await db.knowledgeChunk.findFirstOrThrow({where:{opportunityId:'program'}});
  expect(replacement.id).not.toBe(chunk.id);expect(records.has(chunk.id)).toBe(false);expect(records.has(replacement.id)).toBe(true);
  expect(wire.filter(w=>w.path.endsWith('/documents/delete'))).toHaveLength(1);
  expect(externalEmbed).not.toHaveBeenCalled();
  const payloads=JSON.stringify(wire);for(const privateValue of [studentId,'private-student-sentinel','private@example.com',privateQuestion])expect(payloads).not.toContain(privateValue);
 }finally{await app.close();}
});

it.each(['partial','provider_failure'])('keeps integrated %s writes unready, records actual acknowledgements and never replays them automatically',async(mode)=>{
 const {prepareKnowledgeBatch,knowledgeStates}=await import('../src/knowledge/preparation.js');
 const upsertText=mode==='partial'?vi.fn().mockResolvedValue({acknowledged:0}):vi.fn().mockRejectedValue(Object.assign(new Error('private-provider-body'),{status:400}));
 Object.assign(holder.runtime.store,{integratedEmbedding:{field:'chunk_text',model:'test',dimension:2},upsertText});
 expect(await prepareKnowledgeBatch(studentId)).toBe(1);expect(await db.knowledgeChunk.count()).toBe(0);
 const run=await db.discoveryRun.findFirstOrThrow(),usage=JSON.parse(run.usage);
 expect(run.status).toBe('failed');expect(usage.indexing).toMatchObject({embeddingMode:'pinecone-integrated',embeddingCallsAttempted:1,embeddingCallsSucceeded:0,vectorRecordsAttempted:1,vectorRecordsAcknowledged:0,sqlChunksCommitted:0});
 expect(usage.failures[0]).toMatchObject({code:'vector_write_failed',component:'vector',operation:'upsert'});expect(run.usage+run.error).not.toContain('private-provider-body');
 expect((await knowledgeStates(['program'])).program).toBe('unavailable');expect(await prepareKnowledgeBatch(studentId)).toBe(0);expect(upsertText).toHaveBeenCalledOnce();expect(holder.runtime.embedder.embed).not.toHaveBeenCalled();
});
