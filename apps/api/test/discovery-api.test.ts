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
 for(let i=0;i<10;i++)await db.opportunity.create({data:{id:`opp${i}`,name:`Program ${i}`,organizer:'Example',category:i%2?'Summer program':'Competition',url:'https://example.edu/program',gradeMin:9,gradeMax:12,format:'Virtual',cost:i<5?'Free':'$50',costType:i<5?'free':'paid',costVerifiedAt:new Date(),commitment:'Low',skills:'[]',tags:i===4?'["art"]':'["coding"]',checks:'[]'}});
});
afterAll(async()=>{env.accessCodes=originalCodes;vi.unstubAllEnvs();await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
it('persists personal buckets, refills only the removed bucket, records feedback and preserves Interested',async()=>{
 const app=await buildApp();app.log.level='silent';try{
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
