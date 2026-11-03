import {describe,it,expect} from 'vitest';
import {scoreOpportunity,eligibility,type Opp} from '../src/domain/scoring.js';
import {scoutWeights} from '../src/domain/scout-scoring.js';
import {discoveryPreferences} from '../src/domain/discovery-preferences.js';
import {cityDistanceMiles} from '../src/domain/discovery-location.js';
import {selectPicks,type PickOpportunity} from '../src/domain/picks.js';
const student={grade:10,interests:['AI','coding'],goals:[],skills:[],budget:'any',format:'any',region:'US',discovery:discoveryPreferences({personalProject:'Build a robotics prototype',hoursPerWeek:4})};
const opp=(id:string,changes:Partial<PickOpportunity>={}):PickOpportunity=>({id,name:id,category:'Program',gradeMin:null,gradeMax:null,format:'Online',cost:'Free',costType:'free',costVerifiedAt:new Date(),commitment:'Weekly',skills:['programming'],tags:['artificial intelligence','robotics'],checks:[],feeFlag:false,verificationStatus:'verified',sourceCheckedAt:new Date(),promptVersion:'scout-v1',scoutFacts:JSON.stringify({schoolLevel:'high_school',projectBased:true,hoursMin:2,hoursMax:3}),...changes});
describe('personal Scout ranking',()=>{
 it('recognizes cited high-school eligibility and interest aliases, with a complete 100-point breakdown',()=>{
  const fit=scoreOpportunity(opp('a'),student,600);expect(fit.excluded).toBe(false);if(fit.excluded)return;
  expect(fit.eligibility.status).toBe('eligible');expect(fit.matched).toEqual(['AI','coding']);expect(fit.goalHit).toBe(true);
  expect(fit.factors.find(f=>f.key==='Project')?.text).toContain('personal project');expect(fit.score).toBeGreaterThan(0.7);
  expect('breakdown' in fit?Object.values(fit.breakdown!).reduce((sum,n)=>sum+n,0):0).toBeCloseTo(fit.score*100);
  expect(scoutWeights().weights).toEqual({interest:30,urgency:20,build:15,location:15,time:10,confidence:10});
 });
 it('rejects invalid weight settings safely and keeps the default ranking available',()=>{
  expect(scoutWeights('{"interest":100}').valid).toBe(false);expect(scoutWeights('oops').weights.interest).toBe(30);
  expect(scoutWeights(JSON.stringify({interest:100,urgency:0,build:0,location:0,time:0,confidence:0})).valid).toBe(true);
 });
 it('does not infer eligibility from grade or allow unconfirmed online participation in online-only results',()=>{
  const unknown=opp('x',{scoutFacts:'{}',format:'Format not confirmed'});
  expect(eligibility(unknown,student).checks).toContain('Grade eligibility is not confirmed');
  expect(eligibility(unknown,{...student,discovery:discoveryPreferences({format:'online'})}).status).toBe('not_eligible');
 });
 it('recognizes literal US/state names without excluding a matching student',()=>{
  expect(eligibility(opp('national',{region:['United States']}),{...student,region:'NC'}).status).toBe('eligible');
  expect(eligibility(opp('local',{region:['North Carolina']}),{...student,region:'NC'}).status).toBe('eligible');
  expect(eligibility(opp('wrong-state',{region:['California']}),{...student,region:'NC'}).status).toBe('not_eligible');
 });
 it('filters confirmed cost above the maximum, while unknown total costs remain explicit checks',()=>{
  const s={...student,discovery:discoveryPreferences({maxCost:50})};
  expect(eligibility(opp('x',{costType:'paid',scoutFacts:JSON.stringify({currency:'USD',costMin:100,costMax:200})}),s).status).toBe('not_eligible');
  expect(eligibility(opp('x',{costType:'unknown'}),s).checks).toContain('Check total cost against your maximum');
 });
 it('uses public city centroids for approximate radius warnings and never guesses unknown cities',()=>{
  const boston={city:'Boston',state:'MA'},nyc={city:'New York',state:'NY'};
  expect(cityDistanceMiles(boston,nyc)).toBeGreaterThan(170);expect(cityDistanceMiles(boston,boston)).toBe(0);
  expect(cityDistanceMiles(boston,{city:'No Such City',state:'MA'})).toBeNull();
  const s={...student,discovery:discoveryPreferences({...boston,radiusMiles:50})};
  const fit=scoreOpportunity(opp('far',{format:'In person',scoutFacts:JSON.stringify(nyc)}),s,600);expect(fit.excluded).toBe(false);expect(fit.eligibility.checks.join()).toContain('outside your');
 });
 it('puts verified programs first, limits category repetition when alternatives exist, and excludes unsafe stretches',()=>{
  const candidates=[opp('partial',{verificationStatus:'needs_verification',sourceCheckedAt:null}),...['a','b','c'].map(id=>opp(id,{category:'Competition'})),opp('club',{category:'Club'}),opp('stretch',{tags:['music'],skills:[],feeFlag:true})];
  const selected=selectPicks(candidates,student,600,new Set(),{free:3,paid:0});
  expect(selected.map(p=>p.opportunityId)).not.toContain('partial');expect(selected.map(p=>p.opportunityId)).not.toContain('stretch');expect(selected.map(p=>p.opportunityId)).toContain('club');
 });
 it('feedback penalties and dismissals change only the current student’s selection',()=>{
  const candidates=[opp('a',{costType:'paid'}),opp('b',{costType:'paid',format:'In person',commitment:'High',scoutFacts:JSON.stringify({schoolLevel:'high_school'})})];
  const picks=selectPicks(candidates,student,600,new Set(),{free:0,paid:1},[],['too much time','too far']);expect(picks[0].opportunityId).toBe('a');
  expect(selectPicks(candidates,student,600,new Set(['a']),{free:0,paid:1})[0].opportunityId).toBe('b');
 });
 it('allows outside-interest results and marks only one optional stretch badge',()=>{
  const s={...student,goals:['Explore music'],discovery:discoveryPreferences({})};
  const catalog=Array.from({length:6},(_,i)=>opp('music-'+i,{tags:['music'],skills:[],costType:i<3?'free':'paid'}));
  const picks=selectPicks(catalog,s,600,new Set());expect(picks).toHaveLength(6);expect(picks.filter(p=>p.isStretch)).toHaveLength(1);
 });
});
