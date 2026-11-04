import {beforeAll,beforeEach,afterEach,afterAll,it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PrismaClient,Prisma} from '@prisma/client';
const dir=mkdtempSync(join(tmpdir(),'pathway-insights-')),url=`file:${dir}/test.db`,db=new PrismaClient({datasourceUrl:url+'?connection_limit=1'});
vi.mock('../src/lib/db.js',()=>({get prisma(){return db;},j:(s:string,f:unknown)=>{try{return JSON.parse(s);}catch{return f;}}}));
const model=vi.hoisted(()=>({json:vi.fn()}));
vi.mock('../src/agent/llm/growth-insights.js',()=>({growthInsightLLM:()=>model}));
import {buildApp} from '../src/app.js';
import {env} from '../src/lib/env.js';
import {growthReadiness} from '../src/growth-map/readiness.js';
let app:Awaited<ReturnType<typeof buildApp>>,sid='';const original={disabled:env.aiDisabled,codes:env.accessCodes};
const call=(method:string,path:string,body?:unknown,studentId=sid)=>app.inject({method:method as any,url:path,headers:{'x-student-id':studentId},...(body!==undefined?{payload:body as any}:{})});
const insights=async()=>{const r=await call('GET','/api/growth-map/insights');expect(r.statusCode).toBe(200);return r.json();};
const refresh=(mode='manual')=>call('POST','/api/growth-map/insights/refresh',{mode});
function validOutput(_system:string,prompt:string){const {options}=JSON.parse(prompt),types=new Set();return {insights:options.filter((o:any)=>{if(types.has(o.type))return false;types.add(o.type);return true;}).slice(0,3).map((o:any)=>({candidateId:o.candidateId,text:o.allowedTexts[0],evidenceIds:o.evidenceIds,action:o.action}))};}
beforeAll(async()=>{writeFileSync(join(dir,'test.db'),'');await promisify(execFile)(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url}});app=await buildApp();app.log.level='silent';},30000);
beforeEach(async()=>{env.accessCodes=[];env.aiDisabled=false;await db.student.deleteMany();await db.aIUsage.deleteMany();vi.stubEnv('AI_DAILY_LIMIT','20');vi.stubEnv('AI_MONTHLY_LIMIT','100');sid=(await db.student.create({data:{name:'Do not send my name',location:'Private school',grade:10,timezone:'America/New_York',aiConsent:true}})).id;vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2030-01-15T20:00:00Z'));model.json.mockReset().mockImplementation(validOutput);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
afterAll(async()=>{env.accessCodes=original.codes;env.aiDisabled=original.disabled;await app.close();await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
async function activities(){for(const day of ['07','08','09']){const p=await db.portfolioEntry.create({data:{studentId:sid,title:'Secret project '+day,type:'project',date:'2030-01-'+day,reflection:'I used Python and teamwork. PRIVATE FULL REFLECTION',skills:'[]'}});expect((await call('POST','/api/growth-map/activities/portfolio/'+p.id,{tags:[{skillId:'coding',stage:'Build'},{skillId:'teamwork',stage:'Build'}]})).statusCode).toBe(200);}}
it('keeps GET read-only, gates new profiles and generates at most three supported, private cards',async()=>{
 expect((await insights()).cards).toEqual([]);await refresh();expect(model.json).not.toHaveBeenCalled();await activities();
 expect((await insights()).automaticDue).toBe(true);expect(await db.growthInsightState.count()).toBe(0);expect(model.json).not.toHaveBeenCalled();
 const result=(await refresh('automatic')).json();expect(result.cards.length).toBeGreaterThan(0);expect(result.cards.length).toBeLessThanOrEqual(3);expect(result.cards.every((c:any)=>c.basedOn.length>0)).toBe(true);expect(result.status).toBe('ready');
 const prompt=model.json.mock.calls[0][1];for(const secret of ['Do not send my name','Private school','Secret project','PRIVATE FULL REFLECTION',sid])expect(prompt).not.toContain(secret);
 const used=await db.aIUsage.findUnique({where:{key:'day:2030-01-15:'+sid}});expect(used?.count).toBe(1);
});
it('persists weekly caching and one manual call per local day, including across automatic requests',async()=>{
 await activities();await refresh('automatic');await refresh('automatic');expect(model.json).toHaveBeenCalledTimes(1);
 await refresh('manual');await refresh('manual');expect(model.json).toHaveBeenCalledTimes(2);expect((await insights()).canRefresh).toBe(false);
 vi.setSystemTime(new Date('2030-01-16T04:59Z'));await refresh('manual');expect(model.json).toHaveBeenCalledTimes(2);
 vi.setSystemTime(new Date('2030-01-16T05:01Z'));await refresh('manual');expect(model.json).toHaveBeenCalledTimes(3);
 vi.setSystemTime(new Date('2030-01-22T20:01Z'));await refresh('automatic');expect(model.json).toHaveBeenCalledTimes(4);
});
it('claims concurrent refreshes atomically and does not double-spend AI allowance',async()=>{
 await activities();let release!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve);model.json.mockImplementation(async(s,p)=>{await waiting;return validOutput(s,p);});
 const running=refresh('manual');for(let i=0;i<100&&model.json.mock.calls.length===0;i++)await new Promise(r=>setTimeout(r,5));
 const second=await refresh('automatic');expect(second.statusCode).toBe(200);expect(second.json().status).toBe('refreshing');release();expect((await running).statusCode).toBe(200);expect(model.json).toHaveBeenCalledOnce();expect((await db.aIUsage.findUnique({where:{key:'day:2030-01-15:'+sid}}))?.count).toBe(1);
});
it('keeps valid cached cards on cap or provider failure, with a friendly message and no automatic retry loop',async()=>{
 await activities();const old=(await refresh('automatic')).json().cards;vi.stubEnv('AI_DAILY_LIMIT','1');const limited=(await refresh('manual')).json();expect(limited.status).toBe('limited');expect(limited.cards).toEqual(old);expect(model.json).toHaveBeenCalledOnce();
 vi.stubEnv('AI_DAILY_LIMIT','20');vi.setSystemTime(new Date('2030-01-16T20:00Z'));model.json.mockRejectedValue(new Error('Provider error containing PRIVATE PROMPT'));const failed=(await refresh('manual')).json();expect(failed.status).toBe('failed');expect(failed.cards).toEqual(old);expect(JSON.stringify(failed)).not.toContain('PRIVATE PROMPT');await refresh('manual');expect(model.json).toHaveBeenCalledTimes(2);
});
it('does not call AI or display AI cards without consent, and next steps work with AI disabled',async()=>{
 await activities();await refresh('automatic');await db.student.update({where:{id:sid},data:{aiConsent:false}});expect((await insights()).cards).toEqual([]);await refresh();expect(model.json).toHaveBeenCalledOnce();
 env.aiDisabled=true;expect((await call('GET','/api/growth-map')).statusCode).toBe(200);expect((await call('GET','/api/growth-map/skills/coding/next')).json().stage).toBe('Apply');
});
it('rejects hallucinated, unsupported or foreign evidence output and retains the last valid set',async()=>{
 await activities();const old=(await refresh('automatic')).json().cards;model.json.mockImplementation((s,p)=>{const o=validOutput(s,p);o.insights[0].text='You are the best student, guaranteed admission with 100 percent ability.';o.insights[1].evidenceIds=['another-students-evidence'];return {insights:o.insights.slice(0,2)};});
 const invalid=(await refresh('manual')).json();expect(invalid.status).toBe('invalid');expect(invalid.cards).toEqual(old);
});
it('never resurfaces a dismissed signature, excludes it from future prompts and isolates other students',async()=>{
 await activities();const first=(await refresh('automatic')).json().cards[0],other=await db.student.create({data:{name:'Other',grade:10,aiConsent:true}});
 expect((await call('POST',`/api/growth-map/insights/${first.id}/dismiss`,undefined,other.id)).statusCode).toBe(404);
 expect((await call('POST',`/api/growth-map/insights/${first.id}/dismiss`)).statusCode).toBe(200);expect((await insights()).cards.some((c:any)=>c.id===first.id)).toBe(false);
 await refresh('manual');expect(model.json.mock.calls[1][1]).not.toContain(first.id);expect((await insights()).cards.some((c:any)=>c.id===first.id)).toBe(false);expect((await call('GET','/api/growth-map/insights',undefined,other.id)).json().cards).toEqual([]);
});
it('invalidates cached evidence after source changes or hiding and removes hidden skills from prompts',async()=>{
 await activities();await refresh('automatic');await call('PATCH','/api/growth-map/skills/coding',{hidden:true});await refresh('manual');expect(model.json.mock.calls[1][1]).not.toContain('Coding');
 await db.portfolioEntry.deleteMany({where:{studentId:sid}});expect((await insights()).cards).toEqual([]);expect((await insights()).automaticDue).toBe(false);
});
it('does not store a response after consent is revoked during generation',async()=>{
 await activities();model.json.mockImplementation(async(s,p)=>{await db.student.update({where:{id:sid},data:{aiConsent:false}});return validOutput(s,p);});await refresh('manual');expect((await db.growthInsightState.findUnique({where:{studentId:sid}}))?.cards).toBe('[]');
});
it('matches at most two skill-and-stage programs without searching, excluding expired, sample and dismissed records',async()=>{
 await activities();for(const [id,category,deadline,sample]of [['good','Internship',null,false],['also-good','Internship',null,false],['third','Internship',null,false],['expired','Internship','2030-01-01',false],['wrong-stage','Course',null,false],['sample','Internship',null,true]] as const){await db.opportunity.create({data:{id,name:'Python '+id,organizer:'Example',category,deadline,isSample:sample,source:'discovery',url:'https://example.org/'+id,skills:'["Coding"]',tags:'[]',checks:'[]',cost:'Unknown',format:'Virtual',commitment:'Unknown'}});}
 await db.savedOpportunity.create({data:{studentId:sid,opportunityId:'also-good',status:'dismissed'}});
 const next=(await call('GET','/api/growth-map/skills/coding/next')).json();expect(next.stage).toBe('Apply');expect(next.opportunities.map((o:any)=>o.id)).toEqual(['good','third']);expect(next.opportunities[0].verified).toBe(false);expect(model.json).not.toHaveBeenCalled();
 expect((await call('GET','/api/growth-map/skills/fake/next')).statusCode).toBe(404);
});
it('creates a proposal, never a goal before approval, and reuses the approval verification flow',async()=>{
 await activities();const other=await db.student.create({data:{name:'Other',grade:10}});expect((await call('POST','/api/growth-map/skills/coding/goal',{},other.id)).statusCode).toBe(404);
 const proposal=(await call('POST','/api/growth-map/skills/coding/goal')).json();expect(proposal.status).toBe('AWAITING_APPROVAL');expect(await db.goal.count({where:{studentId:sid}})).toBe(0);expect(proposal.actions.map((a:any)=>a.type)).toEqual(['add_goal','add_milestone']);
 expect((await call('POST',`/api/proposals/${proposal.id}/approve`)).json().status).toBe('VERIFIED');expect(await db.goal.count({where:{studentId:sid}})).toBe(1);expect(await db.milestone.count()).toBe(1);expect(model.json).not.toHaveBeenCalled();
});
it('revalidates insight-based goal requests after dismissal',async()=>{
 await activities();const card=(await refresh('automatic')).json().cards.find((c:any)=>c.action==='goal');expect(card).toBeTruthy();await call('POST',`/api/growth-map/insights/${card.id}/dismiss`);expect((await call('POST',`/api/growth-map/skills/${card.skillIds[0]}/goal`,{insightId:card.id})).statusCode).toBe(409);expect(await db.goal.count()).toBe(0);
});
it('exports and cascade-deletes cache/dismissals while preserving public catalog data',async()=>{
 await activities();const c=(await refresh('automatic')).json().cards[0];await call('POST',`/api/growth-map/insights/${c.id}/dismiss`);const exported=(await call('GET','/api/me/export')).json();expect(exported.growthInsights.state.studentId).toBe(sid);expect(exported.growthInsights.dismissals).toHaveLength(1);
 await call('DELETE','/api/me');expect(await db.growthInsightState.count()).toBe(0);expect(await db.growthInsightDismissal.count()).toBe(0);expect(await db.skill.count()).toBe(70);
});
it('contains missing Drop 2 setup without breaking Drop 1, session, Today or its export',async()=>{
 const spy=vi.spyOn(db.growthInsightState,'findUnique').mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Missing table',{code:'P2021',clientVersion:'test'}));
 try{expect((await call('GET','/api/growth-map/insights')).statusCode).toBe(503);expect((await call('GET','/api/growth-map')).statusCode).toBe(200);expect((await call('GET','/api/today')).statusCode).toBe(200);expect((await app.inject({url:'/api/auth/session'})).statusCode).toBe(200);const data=(await call('GET','/api/me/export')).json();expect(data.growthMap.skills).toEqual([]);expect(data.growthInsights.available).toBe(false);}finally{spy.mockRestore();}
});
it('checks required columns without loading records and protects owner readiness',async()=>{
 expect((await growthReadiness()).ready).toBe(true);expect((await call('GET','/internal/growth-map/readiness')).statusCode).toBe(503);vi.stubEnv('JOBS_SECRET','owner-secret-for-growth-readiness-only');expect((await app.inject({url:'/internal/growth-map/readiness',headers:{authorization:'Bearer owner-secret-for-growth-readiness-only'}})).json().ready).toBe(true);
 const spy=vi.spyOn(db,'$queryRawUnsafe').mockRejectedValue(new Error('missing'));try{const status=await growthReadiness();expect(status.ready).toBe(false);expect(status.checks).toHaveLength(9);}finally{spy.mockRestore();}
});

it('recovers a raised cap after cooldown and treats an abandoned lease as failed rather than spinning forever',async()=>{
 await activities();vi.stubEnv('AI_DAILY_LIMIT','0');expect((await refresh('automatic')).json().status).toBe('limited');expect(model.json).not.toHaveBeenCalled();vi.stubEnv('AI_DAILY_LIMIT','20');vi.setSystemTime(new Date('2030-01-15T20:02Z'));expect((await insights()).automaticDue).toBe(true);expect((await refresh('automatic')).json().status).toBe('ready');expect(model.json).toHaveBeenCalledOnce();
 await db.growthInsightState.update({where:{studentId:sid},data:{status:'refreshing',leaseToken:'abandoned',leaseUntil:new Date('2030-01-15T19:00Z')}});const state=await insights();expect(state.status).toBe('failed');expect(state.canRefresh).toBe(true);expect(state.cards.length).toBeGreaterThan(0);
});
