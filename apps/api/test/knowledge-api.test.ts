import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const holder=vi.hoisted(()=>({runtime:null as any,llm:null as any}));
const dir=mkdtempSync(join(tmpdir(),'pathway-knowledge-')),url=`file:${dir}/test.db`,db=new PrismaClient({datasourceUrl:url+'?connection_limit=1'});
vi.mock('../src/lib/db.js',()=>({get prisma(){return db;},j:(v:string,f:unknown)=>{try{return v?JSON.parse(v):f;}catch{return f;}}}));
vi.mock('../src/knowledge/runtime.js',()=>({initializeKnowledge:async()=>holder.runtime,pauseKnowledge:()=>{}}));
vi.mock('../src/agent/llm/index.js',async()=>({...await vi.importActual('../src/agent/llm/index.js'),getLLM:()=>holder.llm,requireLLM:()=>holder.llm}));
import {memoryStore} from '../src/knowledge/adapters/memory.js';import {ingestKnowledge,searchKnowledge,reconcileVectors} from '../src/knowledge/service.js';import {RunBudget} from '../src/discovery/config.js';import {buildApp} from '../src/app.js';import {env} from '../src/lib/env.js';
let studentId='';const originalCodes=env.accessCodes,headers=()=>({'x-student-id':studentId});
const pageText='Applications require a teacher recommendation. Submit a project outline. The deadline is January 10, 2030.';
beforeAll(async()=>{writeFileSync(join(dir,'test.db'),'');await promisify(execFile)(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url}});},30000);
beforeEach(async()=>{
 env.accessCodes=[];await db.student.deleteMany();await db.opportunity.deleteMany();await db.aIUsage.deleteMany();
 studentId=(await db.student.create({data:{name:'Student',grade:10}})).id;
 await db.opportunity.create({data:{id:'program',name:'Program',organizer:'Example',category:'Program',url:'https://example.edu/rules',gradeMin:9,gradeMax:12,format:'Virtual',cost:'Free',commitment:'Low',skills:'[]',tags:'[]',deadline:'2030-01-10',requirements:'["Submit a project outline."]',evidence:JSON.stringify({requirements:{sourceUrl:'https://example.edu/rules',quote:pageText},deadline:{sourceUrl:'https://example.edu/rules',quote:pageText}})}});
 await db.sourcePage.create({data:{opportunityId:'program',sourceUrl:'https://example.edu/rules',pageTitle:'Rules',text:pageText,contentHash:'initial'}});
 holder.runtime={store:memoryStore(2),embedder:{dimension:2,model:'test',embed:vi.fn(async(texts:string[])=>texts.map(()=>[1,0]))}};
 holder.llm={runTools:vi.fn(async()=>({})),text:vi.fn(),json:vi.fn()};
});
afterAll(async()=>{env.accessCodes=originalCodes;await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
it('ingests shared chunks, skips unchanged content, replaces changed vectors and removes orphans',async()=>{
 await ingestKnowledge('program',new RunBudget());const first=await db.knowledgeChunk.findFirstOrThrow();await ingestKnowledge('program',new RunBudget());expect(holder.runtime.embedder.embed).toHaveBeenCalledTimes(1);
 await db.sourcePage.updateMany({data:{text:pageText+' New requirement.',contentHash:'changed'}});await ingestKnowledge('program',new RunBudget());const second=await db.knowledgeChunk.findFirstOrThrow();expect(second.id).not.toBe(first.id);expect((await holder.runtime.store.list()).ids).toEqual([second.id]);
 await holder.runtime.store.upsert([{id:'orphan',values:[1,0],metadata:{chunkId:'orphan',opportunityId:'program',sourceUrl:'https://example.edu',pageTitle:'Old',checkedAt:new Date().toISOString()}}]);expect(await reconcileVectors()).toBe(1);
 expect((await searchKnowledge('different-program','requirements'))).toEqual([]);expect((await searchKnowledge('program','requirements'))[0].id).toBe(second.id);
});
it('rejects wrong-opportunity records returned by a faulty vector service',async()=>{
 await ingestKnowledge('program',new RunBudget());const c=await db.knowledgeChunk.findFirstOrThrow();holder.runtime.store.query=async()=>[{id:c.id,score:1}];expect(await searchKnowledge('someone-else','requirements')).toEqual([]);
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
 const app=await buildApp();app.log.level='silent';try{await app.inject({method:'POST',url:'/api/opportunities/program/status',headers:headers(),payload:{status:'saved'}});await db.opportunity.update({where:{id:'program'},data:{deadline:'2031-01-10'}});expect((await app.inject({url:'/api/applications',headers:headers()})).json()[0].deadline).toBe('2030-01-10');}finally{await app.close();}
});

it('does not answer from an outdated snapshot while changed pages await embedding, and retires removed-page vectors',async()=>{
 await ingestKnowledge('program',new RunBudget());expect(await searchKnowledge('program','requirements')).toHaveLength(1);
 await db.sourcePage.updateMany({data:{contentHash:'pending',text:'A changed official page with different requirements.'}});expect(await searchKnowledge('program','requirements')).toEqual([]);
 await db.sourcePage.deleteMany();await ingestKnowledge('program',new RunBudget());expect(await db.knowledgeChunk.count()).toBe(0);expect((await holder.runtime.store.list()).ids).toEqual([]);
});

it('keeps the friendly service-unavailable response when a LangGraph retrieval node fails',async()=>{
 holder.runtime.embedder.embed.mockRejectedValue(new Error('private provider error'));
 const app=await buildApp();app.log.level='silent';try{const r=await app.inject({method:'POST',url:'/api/buddy/messages',headers:headers(),payload:{text:'What is required?',opportunityId:'program'}});expect(r.statusCode).toBe(503);expect(r.json().error).toContain('questions are taking a break');expect(r.json().error).not.toContain('private provider error');expect(await db.agentAction.count()).toBe(0);}finally{await app.close();}
});
