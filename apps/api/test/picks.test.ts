import { expect,it } from 'vitest';
import { bucketFor, selectPicks, seedCostType, PickOpportunity } from '../src/domain/picks.js';
const student={grade:10,interests:['coding'],goals:[],skills:[],budget:'any',format:'any',region:'NC'};
const opp=(id:string,changes:Partial<PickOpportunity>={}):PickOpportunity=>({id,name:id,category:'competition',gradeMin:9,gradeMax:12,format:'Virtual',cost:'Free',costType:'free',costVerifiedAt:new Date(),commitment:'Low',skills:[],tags:['coding'],checks:[],feeFlag:false,...changes});
it('only puts explicitly checked free costs in Free; unknown and unconfirmed seed costs use Paid',()=>{
 expect(seedCostType('Free')).toBe('free');expect(seedCostType('Team fees vary')).toBe('paid');expect(seedCostType('Confirm on source')).toBe('unknown');
 expect(bucketFor(opp('1'))).toBe('free');expect(bucketFor(opp('1',{costVerifiedAt:null}))).toBe('paid');expect(bucketFor(opp('1',{costType:'unknown'}))).toBe('paid');
});
it('keeps primary buckets balanced and excludes saved and truly expired dates only',()=>{
 const catalog=[opp('a'),opp('b'),opp('c',{category:'Club'}),opp('stretch',{tags:['art'],category:'Summer program'}),opp('paid',{costType:'paid'}),opp('unknown',{costType:'unknown'}),opp('saved'),opp('expired',{deadline:'2000-01-01'}),opp('region',{region:['CA']})];
 const picks=selectPicks(catalog,student,600,new Set(['saved']));
 expect(picks.filter(p=>p.bucket==='free')).toHaveLength(3);expect(picks.filter(p=>p.bucket==='paid')).toHaveLength(2);
 for(const id of ['saved','expired'])expect(picks.map(p=>p.opportunityId)).not.toContain(id);
 expect(selectPicks([opp('region',{region:['CA']})],student,600,new Set())).toHaveLength(1);
});
it('keeps unknown eligibility and fee concerns visible instead of suppressing a bucket',()=>{
 const picks=selectPicks([opp('a'),opp('b',{costType:'paid'}),opp('c',{tags:['art'],feeFlag:true})],student,600,new Set(['a']),{free:1,paid:1});
 expect(picks.find(p=>p.bucket==='free')?.opportunityId).toBe('c');expect(picks.find(p=>p.bucket==='paid')?.opportunityId).toBe('b');
 expect(selectPicks([opp('x',{gradeMin:null,gradeMax:null,tags:['art']})],student,600,new Set())).toHaveLength(1);
});
it('uses the student local day so an opportunity does not expire early at UTC midnight',async()=>{
 const {vi}=await import('vitest');const {eligibility}=await import('../src/domain/scoring.js');vi.useFakeTimers();vi.setSystemTime(new Date('2029-11-02T00:30:00Z'));try{const o=opp('today',{deadline:'2029-11-01'});expect(eligibility(o,{...student,timezone:'America/New_York'}).reasons).not.toContain('The deadline has passed');expect(eligibility(o,{...student,timezone:'UTC'}).reasons).toContain('The deadline has passed');}finally{vi.useRealTimers();}
});

it('does not suppress outside-interest results to enforce a stretch quota',()=>{const picks=selectPicks([opp('art',{tags:['art']}),opp('music',{tags:['music']}),opp('paid-art',{tags:['art'],costType:'paid'})],student,600,new Set());expect(picks).toHaveLength(3);expect(picks.filter(p=>p.isStretch)).toHaveLength(1);});
