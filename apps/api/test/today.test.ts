import { expect,it } from 'vitest';
import { dueEvents,greetingPart } from '../src/domain/today.js';
import type { CalEvent } from '../src/domain/types.js';
const event=(id:string,type:string,start:string,end=start,done=false):CalEvent=>({id,title:id,type:type as CalEvent['type'],start,end,done,recurDays:[]});
it('selects upcoming exams and deadlines through day seven, excluding past times, other events and completed items',()=>{
  const events=[
    event('today','deadline','2030-01-01T23:59'),
    event('day-seven','exam','2030-01-08T09:00','2030-01-08T10:00'),
    event('past-time','exam','2030-01-01T09:00','2030-01-01T10:00'),
    event('too-late','deadline','2030-01-09T23:59'),
    event('class','class','2030-01-02T09:00','2030-01-02T10:00'),
    event('done','deadline','2030-01-02T23:59',undefined,true),
  ];
  expect(dueEvents(events,new Date('2030-01-01T15:00')).map(e=>[e.id,e.countdown.days])).toEqual([['today',0],['day-seven',7]]);
  expect(dueEvents([],new Date())).toEqual([]);
});
it('chooses greeting accents from the student-local wall clock',()=>{
  expect([2,8,14,19,23].map(hour=>greetingPart(new Date(2030,0,1,hour)))).toEqual(['night','morning','afternoon','evening','night']);
});
