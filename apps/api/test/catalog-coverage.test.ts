import {it,expect} from 'vitest';
import {planCatalogSearch} from '../src/domain/catalog-coverage.js';
import {selectPicks,type PickOpportunity} from '../src/domain/picks.js';
import type {StudentContext} from '../src/domain/types.js';

const student:StudentContext={grade:10,region:'NC',interests:['Art','Robotics'],skills:[],goals:[],budget:'any',format:'any'};
const opportunity=(id:string,topic:string,bucket:'free'|'paid'):PickOpportunity=>({id,name:id,category:'Program',gradeMin:9,gradeMax:12,region:['virtual'],format:'Virtual',cost:bucket==='free'?'Free':'$30',costType:bucket,costVerifiedAt:new Date(),sourceCheckedAt:new Date(),verificationStatus:'verified',commitment:'Low',skills:[],tags:[topic],checks:[],feeFlag:false});
const art=[0,1,2].flatMap(i=>[opportunity('free'+i,'art','free'),opportunity('paid'+i,'art','paid')]);
const plan=(opps:PickOpportunity[],s=student,excluded=new Set<string>())=>planCatalogSearch(opps,s,1800,excluded);

it('searches only the missing interest even when the overall six catalog slots are full',()=>{
 const coverage=plan(art);
 expect(coverage).toMatchObject({complete:false,free:3,paid:3,missingInterests:['robotics'],shortBuckets:[]});
 expect(coverage.groups.map(g=>[g.group.topic,g.buckets])).toEqual([['robotics',['free','paid']]]);
});
it('needs no web work when shared active matches cover every interest and both buckets',()=>{
 const coverage=plan([...art,opportunity('robot','robotics','free')]);
 expect(coverage.complete).toBe(true);expect(coverage.groups).toEqual([]);
 const picks=selectPicks([...art,opportunity('robot','robotics','free')],student,1800,new Set());
 expect(picks.filter(p=>p.bucket==='free')).toHaveLength(3);expect(picks.filter(p=>p.bucket==='paid')).toHaveLength(3);expect(picks.some(p=>p.opportunityId==='robot')).toBe(true);
});
it('combines a missing interest with only the globally short bucket',()=>{
 const coverage=plan(art.filter(o=>o.costType==='free'));
 expect(coverage.groups.map(g=>[g.group.topic,g.buckets])).toEqual([['robotics',['paid']]]);
});
it('fills a bucket shortfall using the least-covered interest instead of querying every topic',()=>{
 const coverage=plan([...art.filter(o=>o.costType==='free'),opportunity('robot','robotics','free'),opportunity('paid','art','paid')]);
 expect(coverage.missingInterests).toEqual([]);expect(coverage.groups.map(g=>[g.group.topic,g.buckets])).toEqual([['robotics',['paid']]]);
});
it('does not count dismissed, saved, wrong-grade or wrong-region matches as coverage',()=>{
 const bad=[opportunity('saved','robotics','free'),{...opportunity('grade','robotics','paid'),gradeMin:11},{...opportunity('region','robotics','paid'),region:['CA'],format:'In person'}];
 expect(plan([...art,...bad],student,new Set(['saved'])).missingInterests).toEqual(['robotics']);
});
it('normalizes topic matching and honors disabled result buckets without paid work',()=>{
 expect(plan(art.map(o=>({...o,tags:['  ART!  ']})),{...student,interests:[' Art ']}).complete).toBe(true);
 const coverage=planCatalogSearch([],student,1800,new Set(),{free:0,paid:0});
 expect(coverage.complete).toBe(true);expect(coverage.groups).toEqual([]);
});
it('checks interests beyond the fifth without exceeding five queued topic groups per request',()=>{
 const many={...student,interests:['art','robotics','biology','coding','music','writing','physics']};
 const coverage=plan(art,many);
 expect(coverage.complete).toBe(false);expect(coverage.missingInterests).toContain('writing');expect(coverage.groups).toHaveLength(5);
 const covered=many.interests.filter(i=>i!=='writing').map((topic,i)=>opportunity('covered'+i,topic,'free'));
 expect(plan([...art,...covered],many).groups.map(g=>g.group.topic)).toEqual(['writing']);
});
