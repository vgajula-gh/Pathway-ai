import { createElement } from 'react';
import { act,create,ReactTestRenderer } from 'react-test-renderer';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
const state=vi.hoisted(()=>({day:null as any,weeks:{} as Record<number,any[]>,api:vi.fn()}));
vi.mock('../../web/src/lib/api',()=>({api:state.api,ApiError:class extends Error{constructor(public status:number,message:string){super(message);}}}));
vi.mock('../../web/src/components/ui',async()=>({...await vi.importActual('../../web/src/components/ui'),toast:vi.fn(),Sheet:({children}:any)=>createElement('div',{role:'dialog'},children)}));
vi.mock('../../web/src/components/Calendars',()=>({default:()=>null}));
vi.mock('../../web/src/components/ProposalReview',()=>({default:()=>null}));
vi.mock('../../web/src/pages/ScanSheet',()=>({default:()=>null}));
vi.mock('../../web/src/components/NewsSheet',()=>({default:()=>null,explainAsk:()=>'',storyWhen:()=>''}));
import Today from '../../web/src/pages/Today';
let renderer:ReactTestRenderer;
const me={name:'Sam Rivera',aiConsent:false,settings:{showWord:true,showNews:true,newsTopics:null}} as any;
const props=()=>({me,go:vi.fn(),ask:vi.fn(),setMe:vi.fn()});
const text=()=>JSON.stringify(renderer.toJSON());
const mount=async(p=props())=>act(async()=>{renderer=create(createElement(Today,p));});
const click=async(label:string)=>act(async()=>{renderer.root.findAllByType('button').find(b=>b.props['aria-label']===label||b.children.join('')===label)!.props.onClick();});
const study=(extra={})=>({id:'study',title:'Math study',type:'study',start:'2030-01-01T17:00',end:'2030-01-01T18:00',source:'manual',done:false,recurring:false,readOnly:false,clash:false,...extra});
const week=(start:string)=>Array.from({length:7},(_,i)=>{
  const date=new Date(start+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+i);
  return {date:date.toISOString().slice(0,10),load:'light',minutes:0,clash:false,events:[] as any[]};
});
beforeEach(()=>{
  const ring={label:'Study planned',pct:0,status:'Not scheduled',minutes:0,limit:120,done:0,planned:0};
  state.day={date:'2030-01-01',greetingPart:'morning',metrics:{focus:ring,freeTime:{label:'Free time left',pct:.5,status:'Tight',minutes:30,inWindow:30,windowRemaining:60,downtime:60,downtimeRemaining:120,downtimeBusy:60},progress:{...ring,label:'Progress'}},nextAction:null,brief:null,timeline:[],comingUp:[],dueSoon:[],dueSoonEvents:[],pending:[],word:{word:'Curiosity',pos:'noun',meaning:'A desire to learn.',example:'Curiosity starts a question.'}};
  state.weeks={0:week('2029-12-31'),1:week('2030-01-07'),[-1]:week('2029-12-24')};
  state.api.mockReset().mockImplementation(async(path:string)=>path==='/api/today'?state.day:path==='/api/news'?{top:null,stories:[]}:path.startsWith('/api/week?')?state.weeks[Number(path.split('=')[1])]:{});me.settings.showWord=true;me.settings.showNews=true;
});
afterEach(()=>{if(renderer)act(()=>renderer.unmount());vi.useRealTimers();vi.unstubAllGlobals();});
it('orders glance, next step and spark, with a slim first-name greeting and real empty actions',async()=>{
  const p=props();await mount(p);
  expect(renderer.root.findAllByType('h2').map(h=>h.children.join(''))).toEqual(['Your day at a glance','Next best step',"Today's spark"]);
  expect(text()).toContain('Good morning');expect(text()).toContain('Sam');expect(text()).not.toContain('Rivera');expect(text()).not.toContain('className":"sky');
  expect(text()).toContain('Your day is open. Add a class or deadline, or link your calendar.');
  expect(text()).toContain('Explore opportunities that fit you');
  act(()=>renderer.root.findAllByType('button').find(b=>b.children.join('')==='Explore opportunities')!.props.onClick());expect(p.go).toHaveBeenCalledWith('explore');
  expect(renderer.root.findByProps({'aria-label':'Talk to Buddy'})).toBeDefined();
});
it('hides the entire spark section when both preferences are off',async()=>{
  me.settings.showWord=false;me.settings.showNews=false;await mount();expect(text()).not.toContain("Today's spark");expect(text()).not.toContain('Curiosity');
});
it('lets a pending approval take the next-step slot and retains ring contributor sheets',async()=>{
  state.day.pending=[{id:'proposal',summary:'Review this real plan',count:2}];state.day.nextAction={title:'Another step',why:'Reason',dataUsed:[],source:'Code'};
  await mount();expect(text()).toContain('Review this real plan');expect(text()).not.toContain('Another step');
  act(()=>renderer.root.findAllByType('button').find(b=>String(b.props['aria-label']||'').startsWith('Study planned:'))!.props.onClick());expect(text()).toContain('CONTRIBUTORS');expect(text()).toContain('Study planned today');
  expect(text()).toContain('Marking an event done does not change planned time.');
});
it('shows free time and protected rest separately with calendar-overlap explanations',async()=>{
  await mount();expect(text()).toContain('Protected downtime left');expect(text()).toContain('of your remaining downtime overlaps calendar events.');
  expect(renderer.root.findAllByProps({className:'ringbtn'})).toHaveLength(3);
  act(()=>renderer.root.findAllByType('button').find(b=>String(b.props['aria-label']||'').startsWith('Free time left:'))!.props.onClick());
  expect(text()).toContain('Unbooked minutes still ahead in your study window');
  expect(text()).toContain('Protected downtime left — separate');
  expect(text()).toContain('Free time left in your study window');
});
it('updates remaining minutes once a minute through read-only Today requests',async()=>{
  vi.useFakeTimers();await mount();
  const reads=()=>state.api.mock.calls.filter(([path])=>path==='/api/today').length;
  const initial=reads();
  state.day={...state.day,metrics:{...state.day.metrics,freeTime:{...state.day.metrics.freeTime,minutes:29,inWindow:29}}};
  await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
  expect(reads()).toBe(initial+1);expect(text()).toContain('29m');
  expect(state.api.mock.calls.every(([,options])=>!options)).toBe(true);
});
it('pauses minute refreshes while hidden and refreshes on return or focus',async()=>{
  vi.useFakeTimers();
  const page=Object.assign(new EventTarget(),{visibilityState:'hidden'}),browser=new EventTarget();
  vi.stubGlobal('document',page);vi.stubGlobal('window',browser);await mount();
  const reads=()=>state.api.mock.calls.filter(([path])=>path==='/api/today').length;
  const initial=reads();
  await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});expect(reads()).toBe(initial);
  await act(async()=>{page.visibilityState='visible';page.dispatchEvent(new Event('visibilitychange'));});expect(reads()).toBe(initial+1);
  await act(async()=>{browser.dispatchEvent(new Event('focus'));});expect(reads()).toBe(initial+2);
});
it('shows calendar and application due-soon items inside the glance section',async()=>{
  state.day.dueSoonEvents=[{id:'exam',title:'Biology exam',date:'2030-01-03',countdown:{days:2,label:'2 days left'}}];
  state.day.dueSoon=[{opportunityId:'program',name:'My application',deadlineSource:'Official page citation',countdown:{days:5,label:'5 days left'}}];
  await mount();const glance=renderer.root.findByProps({'aria-labelledby':'day-glance-title'});expect(glance.findAllByType('b').map(p=>p.children.join(''))).toContain('Biology exam');expect(text()).toContain('My application');
});
it('adds an event through explicit manual input without an AI call',async()=>{
  await mount();act(()=>renderer.root.findAllByType('button').find(b=>b.children.join('')==='Add event')!.props.onClick());
  act(()=>renderer.root.findByProps({id:'event-title'}).props.onChange({target:{value:'My class'}}));
  await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
  expect(state.api).toHaveBeenCalledWith('/api/events',{body:{title:'My class',type:'class',start:'2030-01-01T16:00',end:'2030-01-01T16:30',force:false}});
  expect(state.api.mock.calls.some(([path])=>path==='/api/extract'||path==='/api/today/insight')).toBe(false);
});
it('defaults to Today and shows all seven agenda days inline with today highlighted',async()=>{
  await mount();expect(state.api.mock.calls.some(([p])=>p.startsWith('/api/week'))).toBe(false);
  await click('Week');
  expect(renderer.root.findByProps({'aria-label':'Timeline view'}).findAllByType('button').map(b=>b.props['aria-pressed'])).toEqual([false,true]);
  expect(renderer.root.findAllByProps({className:'muted small agenda-empty'})).toHaveLength(7);
  const current=renderer.root.findByProps({className:'agenda-day is-today'});
  expect(current.findByType('time').props.dateTime).toBe('2030-01-01');
  expect(renderer.root.findByProps({'aria-label':'Select 2030-01-01 for a new event'}).props['aria-pressed']).toBe(true);
  expect(text()).toContain('Your rings above still show today.');expect(text()).not.toContain('View week');
  await click('Today');expect(text()).not.toContain('Nothing scheduled.');expect(text()).toContain('Your day is open.');
  expect(state.api.mock.calls.every(([,options])=>!options)).toBe(true);
});
it('navigates weeks across year boundaries and returns to the current week',async()=>{
  await mount();await click('Week');await click('Previous week');
  expect(state.api).toHaveBeenCalledWith('/api/week?weekOffset=-1');
  expect(renderer.root.findByProps({'aria-label':'Select 2029-12-24 for a new event'}).props['aria-pressed']).toBe(true);
  await click('This week');expect(renderer.root.findByProps({'aria-label':'Select 2030-01-01 for a new event'}).props['aria-pressed']).toBe(true);
  await click('Next week');expect(state.api).toHaveBeenCalledWith('/api/week?weekOffset=1');
  expect(renderer.root.findByProps({'aria-label':'Select 2030-01-07 for a new event'}).props['aria-pressed']).toBe(true);
});
it('defaults Add event to the selected agenda date and keeps the selection after saving',async()=>{
  await mount();await click('Week');await click('Select 2030-01-04 for a new event');await click('Add event');
  expect(renderer.root.findByProps({id:'event-start'}).props.value).toBe('2030-01-04T16:00');
  act(()=>renderer.root.findByProps({id:'event-title'}).props.onChange({target:{value:'Friday club'}}));
  state.day={...state.day};
  await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
  expect(state.api).toHaveBeenCalledWith('/api/events',{body:{title:'Friday club',type:'class',start:'2030-01-04T16:00',end:'2030-01-04T16:30',force:false}});
  expect(renderer.root.findByProps({'aria-label':'Select 2030-01-04 for a new event'}).props['aria-pressed']).toBe(true);
});
it('shares completion state between Week and Today and supports undo without changing rings',async()=>{
  state.day.timeline=[study()];state.weeks[0][1].events=[study()];
  const original=state.api.getMockImplementation()!;
  state.api.mockImplementation(async(path:string,options:any)=>{
    if(path==='/api/events/study'){
      state.day={...state.day,timeline:[study({done:options.body.done})]};
      state.weeks[0]=state.weeks[0].map(d=>d.date==='2030-01-01'?{...d,events:[study({done:options.body.done})]}:d);
      return {};
    }
    return original(path,options);
  });
  await mount();await click('Week');await click('Mark done: Math study');
  expect(state.api).toHaveBeenCalledWith('/api/events/study',{method:'PATCH',body:{done:true}});
  expect(renderer.root.findByProps({className:'tl-i done'})).toBeDefined();
  await click('Today');expect(renderer.root.findByProps({'aria-label':'Mark not done: Math study'}).props['aria-pressed']).toBe(true);
  await click('Mark not done: Math study');expect(renderer.root.findAllByProps({className:'tl-i done'})).toHaveLength(0);
  expect(state.day.metrics.focus.minutes).toBe(0);
});
it('preserves recurrence and linked-calendar restrictions, sources and overlap warnings',async()=>{
  state.weeks[0][1].events=[study({recurring:true}),study({id:'linked',readOnly:true,source:'From School',clash:true}),study({id:'class',type:'class',source:'upload'})];
  await mount();await click('Week');
  expect(renderer.root.findAllByType('button').filter(b=>String(b.props['aria-label']).startsWith('Mark '))).toHaveLength(0);
  expect(text()).toContain('From School');expect(text()).toContain('read-only');expect(text()).toContain('Imported');expect(text()).toContain('Overlaps another event');
});
it('shows a completion error without crossing out the event',async()=>{
  state.day.timeline=[study()];const original=state.api.getMockImplementation()!;
  state.api.mockImplementation(async(path:string,options:any)=>{if(path==='/api/events/study')throw new Error('Could not save completion');return original(path,options);});
  await mount();await click('Mark done: Math study');
  expect(text()).toContain('Could not save completion');expect(renderer.root.findAllByProps({className:'tl-i done'})).toHaveLength(0);
});
it('ignores late responses from a previous week and disables adding while dates are unknown',async()=>{
  let resolve!:(days:any[])=>void;const original=state.api.getMockImplementation()!;
  state.api.mockImplementation((path:string,options:any)=>path==='/api/week?weekOffset=0'?new Promise(r=>{resolve=r;}):original(path,options));
  await mount();await click('Week');
  expect(renderer.root.findAllByType('button').find(b=>b.children.join('')==='Add event')!.props.disabled).toBe(true);
  await click('Next week');
  await act(async()=>resolve(state.weeks[0]));
  expect(text()).not.toContain('Select 2029-12-31');expect(text()).toContain('Select 2030-01-07');
});
it('keeps Today usable when a weekly request fails and supports an explicit retry',async()=>{
  const original=state.api.getMockImplementation()!;let fail=true;
  state.api.mockImplementation(async(path:string,options:any)=>{if(path.startsWith('/api/week')&&fail)throw new Error('Week unavailable');return original(path,options);});
  await mount();await click('Week');expect(text()).toContain('Week unavailable');
  fail=false;await click('Try again');expect(text()).toContain('Nothing scheduled.');
  await click('Today');expect(text()).toContain('Your day is open.');
});
