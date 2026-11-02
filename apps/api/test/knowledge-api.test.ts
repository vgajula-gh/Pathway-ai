import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const holder=vi.hoisted(()=>({runtime:null as any,llm:null as any}));
const dir=mkdtempSync(join(tmpdir(),'pathway-knowledge-')),url=`file:${dir}/test.db`,db=new PrismaClient({datasourceUrl:url+'?connection_limit=1'});
vi.mock('../src/lib/db.js',()=>({get prisma(){return db;},j:(v:string,f:unknown)=>{try{return v?JSON.parse(v):f;}catch{return f;}}}));
vi.mock('../src/knowledge/runtime.js',()=>({initializeKnowledge:async()=>holder.runtime,knowledgeUnavailable:()=>({code:'vector_unavailable',message:'The program library cannot connect right now. Catalog picks still work.',settings:[]}),pauseKnowledge:()=>{}}));
vi.mock('../src/agent/llm/index.js',async()=>({...await vi.importActual('../src/agent/llm/index.js'),getLLM:()=>holder.llm,requireLLM:()=>holder.llm}));
import {memoryStore} from '../src/knowledge/adapters/memory.js';import {ingestKnowledge,searchKnowledge,reconcileVectors} from '../src/knowledge/service.js';import {RunBudget} from '../src/discovery/config.js';import {buildApp} from '../src/app.js';import {env} from '../src/lib/env.js';
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
