import {describe,expect,it} from 'vitest';
import {todayMetrics} from '../src/domain/metrics.js';
import {parseLocal,wallNow} from '../src/domain/time.js';
import type {AvailabilityRules,CalEvent} from '../src/domain/types.js';

const rules:AvailabilityRules={studyStart:'16:00',studyEnd:'21:00',maxStudyMin:120,downtimeStart:'21:00',downtimeEnd:'23:00'};
const now=(time:string)=>parseLocal(`2030-01-07T${time}`)!;
const event=(start:string,end:string,extra:Partial<CalEvent>={}):CalEvent=>({id:start+end,title:'Calendar event',type:'class',start:`2030-01-07T${start}`,end:`2030-01-07T${end}`,recurDays:[],...extra});
const metrics=(time:string,events:CalEvent[]=[],settings=rules)=>todayMetrics(events,settings,[],now(time));

describe('Today calendar estimates',()=>{
  it('shows only future study-window minutes and keeps rest separate',()=>{
    const m=metrics('20:00');
    expect(m.focus).toMatchObject({label:'Study planned',minutes:0,status:'Not scheduled'});
    expect(m.freeTime).toMatchObject({label:'Free time left',minutes:60,inWindow:60,windowRemaining:60,pct:1,downtime:120,downtimeRemaining:120,downtimeBusy:0});
    // The planner continues to use full-day capacity.
    expect(m.capacity.freeMin).toBe(300);
  });
  it('shows the full future window before it starts, without adding rest',()=>{
    expect(metrics('09:00').freeTime).toMatchObject({minutes:300,windowRemaining:300,downtime:120,pct:1});
  });
  it('clips ongoing events to now and subtracts overlapping bookings only once',()=>{
    const m=metrics('18:00',[event('17:00','19:00'),event('18:30','20:00'),event('16:00','17:00')]);
    expect(m.freeTime).toMatchObject({minutes:60,windowRemaining:180,pct:1/3});
  });
  it('returns finite zero free time after the study window while rest remains',()=>{
    expect(metrics('21:30').freeTime).toMatchObject({minutes:0,windowRemaining:0,pct:0,status:'Study window ended',downtime:90});
    expect(metrics('23:30').freeTime).toMatchObject({minutes:0,pct:0,downtime:0,downtimeRemaining:0,downtimeBusy:0});
  });
  it('subtracts the union of actual events overlapping remaining downtime',()=>{
    const events=[event('20:00','21:30'),event('21:00','22:00'),event('21:30','22:30')];
    expect(metrics('20:00',events).freeTime).toMatchObject({minutes:0,downtime:30,downtimeRemaining:120,downtimeBusy:90});
    expect(metrics('22:00',events).freeTime).toMatchObject({downtime:30,downtimeRemaining:60,downtimeBusy:30});
    expect(metrics('22:00',[event('20:00','23:30')]).freeTime).toMatchObject({downtime:0,downtimeBusy:60});
  });
  it('removes protected rest from an overlapping study window',()=>{
    expect(metrics('20:00',[],{...rules,studyEnd:'23:00'}).freeTime).toMatchObject({minutes:60,windowRemaining:180,pct:1/3,downtime:120});
  });
  it('counts recurring calendar bookings but not zero-duration deadline markers',()=>{
    const recurring=event('19:00','20:00',{start:'2029-12-31T19:00',end:'2029-12-31T20:00',recurDays:[1],recurUntil:'2030-02-01'});
    expect(metrics('18:00',[recurring,event('20:00','20:00',{type:'deadline'})]).freeTime.minutes).toBe(120);
  });
  it('includes a preceding recurring event continuing past midnight',()=>{
    const recurring=event('23:00','01:00',{start:'2030-01-06T23:00',end:'2030-01-07T01:00',recurDays:[0]});
    const m=metrics('00:30',[recurring],{...rules,studyStart:'00:00',studyEnd:'03:00'});
    expect(m.freeTime).toMatchObject({minutes:120,windowRemaining:150});
  });
  it('clips overnight availability to the remaining portions of this calendar day',()=>{
    const settings={...rules,studyStart:'22:00',studyEnd:'02:00',downtimeStart:'23:00',downtimeEnd:'01:00'};
    expect(metrics('00:30',[],settings).freeTime).toMatchObject({minutes:120,windowRemaining:210,downtime:90,downtimeRemaining:90});
    expect(metrics('23:30',[],settings).freeTime).toMatchObject({minutes:0,windowRemaining:30,downtime:30});
  });
  it('handles equal endpoints and zero study limits without NaN or infinity',()=>{
    const m=metrics('18:00',[event('16:00','17:00',{type:'study'})],{...rules,maxStudyMin:0,studyStart:'16:00',studyEnd:'16:00',downtimeEnd:'21:00'});
    expect(m.focus).toMatchObject({minutes:60,pct:0,status:'Over limit'});
    expect(m.freeTime).toMatchObject({minutes:0,pct:0,downtime:0});
  });
  it('measures scheduled Study blocks rather than completion or other event types',()=>{
    const m=metrics('20:00',[event('17:00','18:00',{type:'study',done:true}),event('18:00','19:00',{done:true})]);
    expect(m.focus).toMatchObject({minutes:60,limit:120,pct:.5,status:'Within limit'});
    expect(metrics('20:00',[event('16:00','19:00',{type:'study'})]).focus.status).toBe('Over limit');
  });
  it('preserves weekly goal-step progress and uses the supplied student wall clock',()=>{
    const local=wallNow('America/New_York',new Date('2030-01-08T01:00:00Z'));
    const m=todayMetrics([],rules,[{id:'a',title:'Step',status:'done',targetDate:'2030-01-07'},{id:'b',title:'Next',status:'todo',targetDate:'2030-01-09'},{id:'c',title:'Later',status:'todo',targetDate:'2030-01-21'}],local);
    expect(m.freeTime.minutes).toBe(60);
    expect(m.progress).toMatchObject({done:1,planned:2,pct:.5});
  });
});
