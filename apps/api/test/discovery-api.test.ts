import { beforeAll,beforeEach,afterAll,it,expect,vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const dir=mkdtempSync(join(tmpdir(),'pathway-discovery-')), url=`file:${dir}/test.db`;
const db=new PrismaClient({datasourceUrl:url+'?connection_limit=1'});
vi.mock('../src/lib/db.js',()=>({get prisma(){return db;},j:(v:string,f:unknown)=>{try{return v?JSON.parse(v):f;}catch{return f;}}}));
import {buildApp} from '../src/app.js';
import {env} from '../src/lib/env.js';
const originalCodes=env.accessCodes;
let id=''; const headers=()=>({'x-student-id':id});
beforeAll(async()=>{writeFileSync(join(dir,'test.db'),'');await promisify(execFile)(process.execPath,['../../node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url}});},30000);
beforeEach(async()=>{
 vi.unstubAllEnvs();vi.stubEnv('DISCOVERY_ENABLED','false');env.accessCodes=[];await db.student.deleteMany();await db.opportunity.deleteMany();
 id=(await db.student.create({data:{name:'Private student',grade:10,interests:'["coding"]',region:'NC',budget:'free'}})).id;
 for(let i=0;i<10;i++)await db.opportunity.create({data:{id:`opp${i}`,name:`Program ${i}`,organizer:'Example',isSample:false,source:'discovery',verificationStatus:'verified',verifiedAt:new Date(),sourceCheckedAt:new Date(),deadline:'2030-12-01',evidence:JSON.stringify({deadline:{sourceUrl:'https://example.edu',quote:'Apply by 2030-12-01'}}),category:i%2?'Summer program':'Competition',url:'https://example.edu/program',gradeMin:9,gradeMax:12,format:'Virtual',cost:i<5?'Free':'$50',costType:i<5?'free':'paid',costVerifiedAt:new Date(),commitment:'Low',skills:'[]',tags:i===4?'["art"]':'["coding"]',checks:'[]'}});
});
afterAll(async()=>{env.accessCodes=originalCodes;vi.unstubAllEnvs();await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
it('persists personal buckets, refills only the removed bucket, records feedback and preserves Interested',async()=>{
 const app=await buildApp();app.log.level='silent';try{
 const first=await app.inject({url:'/api/opportunities',headers:headers()});expect(first.statusCode).toBe(200);expect(first.json().picks).toEqual([]);expect(await db.opportunitySearchRequest.count()).toBe(0);
 expect((await app.inject({method:'POST',url:'/api/opportunities/refresh',headers:headers()})).json()).toMatchObject({usedSharedCatalog:true,requested:false});
 let res=await app.inject({url:'/api/opportunities',headers:headers()});expect(res.statusCode).toBe(200);let picks=res.json().picks;
 expect(picks.filter((p:any)=>p.bucket==='free')).toHaveLength(3);expect(picks.filter((p:any)=>p.bucket==='paid')).toHaveLength(3);
 const paid=picks.filter((p:any)=>p.bucket==='paid').map((p:any)=>p.id).sort(), chosen=picks.find((p:any)=>p.bucket==='free').id;
 expect((await app.inject({method:'POST',url:`/api/opportunities/${chosen}/status`,headers:headers(),payload:{status:'saved'}})).statusCode).toBe(200);
 picks=(await app.inject({url:'/api/opportunities',headers:headers()})).json().picks;
 expect(picks.map((p:any)=>p.id)).not.toContain(chosen);expect(picks.filter((p:any)=>p.bucket==='paid').map((p:any)=>p.id).sort()).toEqual(paid);
 expect((await db.savedOpportunity.findUniqueOrThrow({where:{studentId_opportunityId:{studentId:id,opportunityId:chosen}}})).status).toBe('interested');
 const dismissed=picks[0].id;await app.inject({method:'POST',url:`/api/opportunities/${dismissed}/status`,headers:headers(),payload:{status:'dismissed',reason:'too much time'}});
 expect((await db.opportunityFeedback.findFirstOrThrow()).reason).toBe('too much time');
 expect((await app.inject({url:'/api/opportunities',headers:headers()})).json().picks.map((p:any)=>p.id)).not.toContain(dismissed);
 const exported=(await app.inject({url:'/api/me/export',headers:headers()})).json();expect(exported.opportunityFeedback).toHaveLength(1);
 await app.inject({method:'DELETE',url:'/api/me',headers:headers()});expect(await db.studentPick.count()).toBe(0);expect(await db.opportunityFeedback.count()).toBe(0);
 }finally{await app.close();}
});
it('accepts a broad region and rejects arbitrary addresses',async()=>{
 const app=await buildApp();app.log.level='silent';try{
 expect((await app.inject({method:'PATCH',url:'/api/me',headers:headers(),payload:{region:'virtual'}})).json().region).toBe('virtual');
 expect((await app.inject({method:'PATCH',url:'/api/me',headers:headers(),payload:{region:'123 Main Street'}})).statusCode).toBe(422);
 }finally{await app.close();}
});
it('shows announced openings among visible results without a provider call',async()=>{
 await db.opportunity.update({where:{id:'opp0'},data:{verificationStatus:'watchlist',promptVersion:'scout-v1',sourceReadAt:new Date(),scoutFacts:JSON.stringify({schoolLevel:'high_school',openingDate:'2030-06-01'})}});
 const app=await buildApp();app.log.level='silent';try{
  const response=await app.inject({url:'/api/opportunities',headers:headers()});expect(response.statusCode).toBe(200);
  expect(response.json().watchlist).toEqual([]);expect(response.json().recommended.map((o:any)=>o.id)).toContain('opp0');
  expect(await db.opportunitySearchRequest.count({where:{studentId:id}})).toBe(0);
 }finally{await app.close();}
});
it('persists and exports optional discovery preferences without changing private plans',async()=>{
 const app=await buildApp();app.log.level='silent';try{
  const res=await app.inject({method:'PATCH',url:'/api/me',headers:headers(),payload:{discoveryPreferences:{city:'Raleigh',state:'NC',format:'online',personalProject:'Build a small game',goals:'Learn coding',maxCost:0,hoursPerWeek:3}}});
  expect(res.statusCode).toBe(200);expect(res.json().discoveryPreferences).toMatchObject({city:'Raleigh',radiusMiles:50,maxCost:0,hoursPerWeek:3});
  const next=await app.inject({method:'PATCH',url:'/api/me',headers:headers(),payload:{discoveryPreferences:{hoursPerWeek:5}}});
  expect(next.json().discoveryPreferences).toMatchObject({city:'Raleigh',personalProject:'Build a small game',hoursPerWeek:5});
  expect((await app.inject({url:'/api/me/export',headers:headers()})).json().profile.discoveryPreferences.maxCost).toBe(0);
  expect(await db.goal.count()).toBe(0);expect(await db.event.count()).toBe(0);
  expect((await app.inject({method:'PATCH',url:'/api/me',headers:headers(),payload:{discoveryPreferences:{hoursPerWeek:200}}})).statusCode).toBe(422);
 }finally{await app.close();}
});
it('discovers for shared groups, targets short buckets and deduplicates official programs',async()=>{
 const {discover}=await import('../src/discovery/pipeline.js');const {RunBudget}=await import('../src/discovery/config.js');const {Extraction}=await import('../src/discovery/extraction.js');
 const sourceUrl='https://example.edu/robotics',text='Example Robotics is organized by Example. Grades 9–12. Participation is free. Virtual. Apply by 2030-12-01.';
 const data=Extraction.parse({...Object.fromEntries(Object.keys(Extraction.shape).map(k=>[k,null])),name:'Example Robotics',organizer:'Example',gradeMin:9,gradeMax:12,costType:'free',format:'Virtual',deadline:'2030-12-01',evidence:Object.fromEntries(['name','organizer','gradeMin','gradeMax','costType','format','deadline'].map(k=>[k,{sourceUrl,quote:k==='costType'?'Participation is free. Virtual. Apply by 2030-12-01.':text}]))});
 const search=vi.fn().mockResolvedValue({urls:[sourceUrl,sourceUrl],tokens:20}),fetch=vi.fn().mockResolvedValue({sourceUrl,text,pageTitle:'Program',contentHash:'h',checkedAt:new Date(),links:[]}),extract=vi.fn().mockResolvedValue(data);
 const group={key:'robotics|9-10|NC',topic:'robotics',gradeBand:'9-10',region:'NC'};
 const ids=await discover(group,['free'],new RunBudget(),{search:{search},fetch,extract});await discover(group,['free'],new RunBudget(),{search:{search},fetch,extract});
 expect(ids).toHaveLength(1);expect(await db.opportunity.count({where:{name:'Example Robotics'}})).toBe(1);expect(await db.sourcePage.count()).toBe(1);expect(search.mock.calls[0][0]).toContain('free no participation fee');expect(search.mock.calls[0][0]).not.toContain('Private student');
});
it('stores source-backed grade variants and returns three Free and three Paid picks for two students',async()=>{
 await db.opportunity.deleteMany();
 const {discover}=await import('../src/discovery/pipeline.js');
 const {RunBudget}=await import('../src/discovery/config.js');
 const {Extraction}=await import('../src/discovery/extraction.js');
 const {readable}=await import('../src/discovery/pages.js');
 // Source/provider boundaries use synthetic fixtures; SQL, verification, selection and API are real.
 const fixtures=Array.from({length:6},(_,i)=>{
  const name=`Example Coding Robotics ${i}`,sourceUrl=`https://example.edu/robotics-${i}`;
  const grades=i<3?'Open to 9th–12th graders.':'Open to grades 9, 10, 11, and 12.';
  const cost=i<3?'Participation is free.':'The program fee is $50.';
  const page={...readable(`<main>${name} is organized by Example. ${grades} ${cost} Virtual. Apply by December 1, 2030. Coding and Robotics.</main>`,sourceUrl),checkedAt:new Date()};
  const facts=Extraction.parse({
   ...Object.fromEntries(Object.keys(Extraction.shape).map(k=>[k,null])),name,organizer:'Example',gradeMin:9,gradeMax:12,costType:i<3?'free':'paid',costAmount:i<3?null:'$50',format:'Virtual',deadline:'2030-12-01',tags:['Coding','Robotics'],
   evidence:Object.fromEntries(['name','organizer','gradeMin','gradeMax','costType','costAmount','format','deadline','tags'].map(field=>[field,{sourceUrl,quote:['gradeMin','gradeMax'].includes(field)?grades:['costType','costAmount'].includes(field)?cost:page.text}])),
  });
  return {page,facts};
 });
 const search=vi.fn(async(query:string)=>({urls:fixtures.slice(query.includes('free no participation fee')?0:3,query.includes('free no participation fee')?3:6).map(f=>f.page.sourceUrl),tokens:0}));
 const fetch=vi.fn(async(url:string)=>fixtures.find(f=>f.page.sourceUrl===url)!.page);
 const extract=vi.fn(async(pages:typeof fixtures[number]['page'][])=>fixtures.find(f=>f.page.sourceUrl===pages[0].sourceUrl)!.facts);
 const ingest=vi.fn(async()=>{}),group={key:'coding|9-10|NC',topic:'coding',gradeBand:'9-10',region:'NC'};
 const deps={search:{search},fetch,extract,ingest};
 expect(await discover(group,['free'],new RunBudget(),deps)).toHaveLength(3);
 expect(await discover(group,['paid'],new RunBudget(),deps)).toHaveLength(3);
 expect(await db.opportunity.count({where:{verificationStatus:'verified'}})).toBe(6);
 expect(await db.sourcePage.count()).toBe(6);expect(ingest).toHaveBeenCalledTimes(6);
 const app=await buildApp();app.log.level='silent';try{
  const studentB=await db.student.create({data:{name:'Second student',grade:10,interests:'["coding"]',region:'NC',budget:'free'}});
  for(const studentId of [id,studentB.id]) {
   const h={'x-student-id':studentId};
   const refresh=await app.inject({method:'POST',url:'/api/opportunities/refresh',headers:h});
   expect(refresh.statusCode).toBe(202);expect(refresh.json()).toMatchObject({usedSharedCatalog:true,requested:false});
   const list=await app.inject({url:'/api/opportunities',headers:h});expect(list.statusCode).toBe(200);
   const picks=list.json().picks;
   expect(picks.filter((p:any)=>p.bucket==='free')).toHaveLength(3);expect(picks.filter((p:any)=>p.bucket==='paid')).toHaveLength(3);
   expect(picks.every((p:any)=>p.verificationStatus==='verified'&&!p.isSample)).toBe(true);
  }
  expect(search).toHaveBeenCalledTimes(2);expect(extract).toHaveBeenCalledTimes(6);
 }finally{await app.close();}
});
