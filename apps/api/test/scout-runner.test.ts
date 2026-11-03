import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const dir=mkdtempSync(join(tmpdir(),'pathway-scout-')),url=`file:${dir}/test.db`,db=new PrismaClient({datasourceUrl:url+'?connection_limit=1'});
vi.mock('../src/lib/db.js',()=>({get prisma(){return db;},j:(v:string,f:unknown)=>{try{return v?JSON.parse(v):f;}catch{return f;}}}));
import {advanceScout,newScoutState} from '../src/scout/runner.js';
import {reserveRun} from '../src/discovery/jobs.js';
import {scoutFixture} from './fixtures/scout.js';
import type {ScoutDependencies} from '../src/scout/runner.js';
import {PROMPT_VERSION} from '../src/scout/prompts.js';
import {research} from '../src/scout/research.js';

beforeAll(async()=>{writeFileSync(join(dir,'test.db'),'');await promisify(execFile)(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url}});},30000);
beforeEach(async()=>{
 vi.stubEnv('SCOUT_SOURCE_MODE','fetch_and_extract');await db.discoveryRun.deleteMany();await db.discoveryGroup.deleteMany();await db.opportunity.deleteMany();await db.discoveryUsage.deleteMany();await db.aIUsage.deleteMany();vi.unstubAllEnvs();vi.stubEnv('SCOUT_SOURCE_MODE','fetch_and_extract');});
afterAll(async()=>{vi.unstubAllEnvs();await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
async function start() {
 const group=await db.discoveryGroup.upsert({where:{key:'robotics|9-10|NC'},create:{key:'robotics|9-10|NC',topic:'robotics',gradeBand:'9-10',region:'NC',status:'running'},update:{status:'running'}});
 const run=(await reserveRun(group.key,'discovery'))!;
 const state=newScoutState({today:'2026-11-02',gradeBand:'9-10',interests:['robotics','coding'],focusInterests:['robotics'],region:'NC',buckets:['free','paid']},[group.key]);
 await db.discoveryRun.update({where:{id:run.id},data:{state:JSON.stringify(state),promptVersion:PROMPT_VERSION}});return run.id;
}
function dependencies(fixtures=[scoutFixture()]):Partial<ScoutDependencies> {
 return {provider:{search:async()=>({urls:[],tokens:0}),research:async()=>({text:'',citations:[],usage:{provider:'openai',model:'test',inputTokens:1,outputTokens:1,responseId:'test'}})},
  research:vi.fn(async()=>({output:{candidates:fixtures.map(f=>({name:f.facts.name!,officialUrl:f.page.sourceUrl,interests:['robotics'],costHint:'free' as const})),searchThemesUsed:['robotics']},repaired:false,query:'public query'})),
  fetch:vi.fn(async(url)=>fixtures.find(f=>f.page.sourceUrl===url)!.page),
  extract:vi.fn(async(pages)=>({facts:fixtures.find(f=>f.page.sourceUrl===pages[0].sourceUrl)!.facts,usage:null})),
 };
}
async function finish(id:string,deps:Partial<ScoutDependencies>) {
 for(let i=0;i<50;i++){const run=await db.discoveryRun.findUniqueOrThrow({where:{id}});if(run.status!=='running')return run;await advanceScout(run,deps);}
 throw new Error('Scout did not finish within bounded stages');
}
it('persists a bounded graph stage per invocation and finishes real catalog storage exactly once',async()=>{
 const id=await start(),deps=dependencies();
 await advanceScout(await db.discoveryRun.findUniqueOrThrow({where:{id}}),deps);
 expect(await db.researchCandidate.count()).toBe(1);expect(await db.opportunity.count()).toBe(1);expect((await db.opportunity.findFirstOrThrow()).sourceCheckedAt).toBeNull();expect(await db.sourcePage.count()).toBe(0);expect(deps.extract).not.toHaveBeenCalled();
 const run=await finish(id,deps);expect(run.status).toBe('complete');expect(await db.opportunity.count()).toBe(1);expect(await db.sourcePage.count()).toBe(1);
 expect(deps.research).toHaveBeenCalledOnce();expect(deps.extract).toHaveBeenCalledOnce();
 const old=await db.discoveryUsage.findFirstOrThrow();await advanceScout(run,deps);expect(await db.discoveryUsage.findFirstOrThrow()).toEqual(old);
});
it('carries minimally formatted real research parsing through page qualification and SQL storage',async()=>{
 const f=scoutFixture(),id=await start(),deps=dependencies([f]);
 const web=vi.fn(async()=>({text:JSON.stringify([{name:f.facts.name,officialUrl:f.page.sourceUrl}]),citations:[],usage:{provider:'openai' as const,model:'test',inputTokens:20,outputTokens:10,responseId:'response'}}));
 deps.research=research;deps.provider={search:async()=>({urls:[],tokens:0}),research:web};
 const run=await finish(id,deps);expect(run.status).toBe('complete');expect(await db.opportunity.count()).toBe(1);expect(await db.sourcePage.count()).toBe(1);expect(web).toHaveBeenCalledOnce();expect(deps.extract).toHaveBeenCalledOnce();
});
it('retains research leads before processing and resumes a saved response without another web request',async()=>{
 const id=await start(),deps=dependencies();const run=await db.discoveryRun.findUniqueOrThrow({where:{id}}),state=JSON.parse(run.state);
 state.inFlight='research';state.researchOutput=(await deps.research!({research:deps.provider!.research!},state.context,1,false)).output;
 await db.discoveryRun.update({where:{id},data:{state:JSON.stringify(state)}});vi.mocked(deps.research!).mockClear();
 await finish(id,deps);expect(deps.research).not.toHaveBeenCalled();expect(deps.extract).toHaveBeenCalledOnce();expect(await db.opportunity.count()).toBe(1);
});
it('keeps the bounded total lead pool without excluding results by a cost hint',async()=>{
 vi.stubEnv('SCOUT_FREE_CANDIDATES','2');vi.stubEnv('SCOUT_PAID_CANDIDATES','2');
 const fixtures=Array.from({length:16},(_,i)=>scoutFixture('Pool '+i,i<8?'free':'paid')),id=await start(),deps=dependencies(fixtures);
 vi.mocked(deps.research!).mockResolvedValue({output:{candidates:fixtures.map((f,i)=>({name:f.facts.name!,officialUrl:f.page.sourceUrl,interests:['coding'],costHint:'paid'})),searchThemesUsed:['coding']},query:'pool fixture',repaired:false});
 const run=await finish(id,deps);expect(JSON.parse(run.state).queuedCostHints).toEqual({free:0,paid:4});
 expect(await db.researchCandidate.count()).toBe(16);expect(await db.researchCandidate.count({where:{status:'excluded'}})).toBe(0);expect(deps.extract).toHaveBeenCalledTimes(4);expect(await db.opportunity.count()).toBe(16);
});
it('keeps researched pages after an extraction timeout and continues with another candidate',async()=>{
 const id=await start(),deps=dependencies([scoutFixture('One'),scoutFixture('Two')]);
 vi.mocked(deps.extract!).mockRejectedValueOnce(new DOMException('private provider text','AbortError'));
 const run=await finish(id,deps);expect(run.status).toBe('complete');expect(JSON.parse(run.usage).phase).toBe('partial');
 expect(await db.researchCandidate.count({where:{status:'error'}})).toBe(1);expect(await db.opportunity.count()).toBe(2);
 const failed=await db.researchCandidate.findFirstOrThrow({where:{status:'error'}});expect(JSON.parse(failed.pages)).toHaveLength(1);expect(failed.reasons).not.toContain('private');
});
it('never repeats an extraction that was claimed before a worker interruption',async()=>{
 const id=await start(),deps=dependencies();
 for(let i=0;i<2;i++)await advanceScout(await db.discoveryRun.findUniqueOrThrow({where:{id}}),deps);
 const run=await db.discoveryRun.findUniqueOrThrow({where:{id}}),state=JSON.parse(run.state);expect(state.stage).toBe('extract');state.inFlight='extract';
 await db.discoveryRun.update({where:{id},data:{state:JSON.stringify(state)}});
 expect((await finish(id,deps)).status).toBe('complete');expect(deps.extract).not.toHaveBeenCalled();expect(deps.research).toHaveBeenCalledOnce();
 expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);expect(await db.researchCandidate.count()).toBe(1);
});
it('reuses fresh public source facts while retaining a new research record',async()=>{
 const deps=dependencies();await finish(await start(),deps);
 await finish(await start(),deps);
 expect(deps.research).toHaveBeenCalledTimes(2);expect(deps.fetch).toHaveBeenCalledOnce();expect(deps.extract).toHaveBeenCalledOnce();
 expect(await db.researchCandidate.count()).toBe(2);expect(await db.opportunity.count()).toBe(1);
});
it('updates the original search link when a redirect and extracted title differ',async()=>{
 const f=scoutFixture('Actual Coding Name'),id=await start(),deps=dependencies([f]);
 vi.mocked(deps.research!).mockResolvedValue({output:{candidates:[{name:'Search headline',officialUrl:'https://example.edu/redirect',interests:['coding'],costHint:'unknown'}],searchThemesUsed:[]},query:'test',repaired:false});
 vi.mocked(deps.fetch!).mockResolvedValue(f.page);
 await finish(id,deps);
 expect(await db.opportunity.count()).toBe(1);expect(await db.opportunity.findFirstOrThrow()).toMatchObject({name:'Actual Coding Name',url:f.page.sourceUrl,verificationStatus:'verified'});
});
it('preserves a known past deadline when later extraction cannot confirm a replacement',async()=>{
 const f=scoutFixture('Expired Coding'),id=await start(),deps=dependencies([f]);
 await advanceScout(await db.discoveryRun.findUniqueOrThrow({where:{id}}),deps);
 const o=await db.opportunity.findFirstOrThrow();
 await db.opportunity.update({where:{id:o.id},data:{deadline:'2000-01-01',evidence:JSON.stringify({deadline:{quote:'Application deadline January 1, 2000.',sourceUrl:f.page.sourceUrl}})}});
 f.facts.deadline=null;f.facts.evidence.deadline=null;
 const run=await finish(id,deps);expect(JSON.parse(run.usage).savedIds).not.toContain(o.id);
 const stored=await db.opportunity.findUniqueOrThrow({where:{id:o.id}});expect(stored.deadline).toBe('2000-01-01');expect(JSON.parse(stored.evidence).deadline.quote).toContain('2000');
});

it('settles actual observed search estimates once and releases unused reserved spending',async()=>{
 vi.stubEnv('SCOUT_SOURCE_MODE','research_evidence');vi.stubEnv('SCOUT_WEB_SEARCH_PRICE_USD','0.1');vi.stubEnv('SCOUT_INPUT_PRICE_PER_MILLION','0');vi.stubEnv('SCOUT_OUTPUT_PRICE_PER_MILLION','0');
 const id=await start(),deps=dependencies();deps.research=async(_provider,_context,_count,_repair,onCall)=>{
  await onCall({provider:'openai',model:'test',inputTokens:100,outputTokens:50,responseId:'cost',webSearches:2},'research');return {output:{candidates:[],searchThemesUsed:[]},repaired:false,query:'test'};
 };
 const run=await finish(id,deps);expect(JSON.parse(run.usage)).toMatchObject({estimatedCost:0.2,calls:[{estimatedCost:0.2,usage:{webSearches:2}}]});
 const ledger=await db.aIUsage.findUniqueOrThrow({where:{key:'discovery-spend:'+run.startedAt.toISOString().slice(0,7)}});expect(ledger.count).toBe(2000);
 await advanceScout(run,deps);expect((await db.aIUsage.findUniqueOrThrow({where:{key:ledger.key}})).count).toBe(2000);
 vi.stubEnv('SCOUT_WEB_SEARCH_PRICE_USD','0.9');const {scoutUsage,restoreScoutBudget}=await import('../src/scout/runner.js');expect(JSON.parse(scoutUsage(restoreScoutBudget(run),JSON.parse(run.state))).estimatedCost).toBe(0.2);
});
