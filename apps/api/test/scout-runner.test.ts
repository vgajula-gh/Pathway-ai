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

beforeAll(async()=>{writeFileSync(join(dir,'test.db'),'');await promisify(execFile)(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url}});},30000);
beforeEach(async()=>{await db.discoveryRun.deleteMany();await db.discoveryGroup.deleteMany();await db.opportunity.deleteMany();await db.discoveryUsage.deleteMany();await db.aIUsage.deleteMany();vi.unstubAllEnvs();});
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
 expect(await db.researchCandidate.count()).toBe(1);expect(await db.sourcePage.count()).toBe(0);expect(deps.extract).not.toHaveBeenCalled();
 const run=await finish(id,deps);expect(run.status).toBe('complete');expect(await db.opportunity.count()).toBe(1);expect(await db.sourcePage.count()).toBe(1);
 expect(deps.research).toHaveBeenCalledOnce();expect(deps.extract).toHaveBeenCalledOnce();
 const old=await db.discoveryUsage.findFirstOrThrow();await advanceScout(run,deps);expect(await db.discoveryUsage.findFirstOrThrow()).toEqual(old);
});
it('keeps researched pages after an extraction timeout and continues with another candidate',async()=>{
 const id=await start(),deps=dependencies([scoutFixture('One'),scoutFixture('Two')]);
 vi.mocked(deps.extract!).mockRejectedValueOnce(new DOMException('private provider text','AbortError'));
 const run=await finish(id,deps);expect(run.status).toBe('complete');expect(JSON.parse(run.usage).phase).toBe('partial');
 expect(await db.researchCandidate.count({where:{status:'error'}})).toBe(1);expect(await db.opportunity.count()).toBe(1);
 const failed=await db.researchCandidate.findFirstOrThrow({where:{status:'error'}});expect(JSON.parse(failed.pages)).toHaveLength(1);expect(failed.reasons).not.toContain('private');
});
it('never repeats an extraction that was claimed before a worker interruption',async()=>{
 const id=await start(),deps=dependencies();
 for(let i=0;i<2;i++)await advanceScout(await db.discoveryRun.findUniqueOrThrow({where:{id}}),deps);
 const run=await db.discoveryRun.findUniqueOrThrow({where:{id}}),state=JSON.parse(run.state);expect(state.stage).toBe('extract');state.inFlight='extract';
 await db.discoveryRun.update({where:{id},data:{state:JSON.stringify(state)}});
 expect((await finish(id,deps)).status).toBe('failed');expect(deps.extract).not.toHaveBeenCalled();expect(deps.research).toHaveBeenCalledOnce();
 expect((await db.discoveryUsage.findFirstOrThrow()).runs).toBe(1);expect(await db.researchCandidate.count()).toBe(1);
});
it('reuses fresh public source facts while retaining a new research record',async()=>{
 const deps=dependencies();await finish(await start(),deps);
 await finish(await start(),deps);
 expect(deps.research).toHaveBeenCalledTimes(2);expect(deps.fetch).toHaveBeenCalledOnce();expect(deps.extract).toHaveBeenCalledOnce();
 expect(await db.researchCandidate.count()).toBe(2);expect(await db.opportunity.count()).toBe(1);
});
