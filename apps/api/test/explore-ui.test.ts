import {createElement} from 'react';import {act,create,ReactTestRenderer} from 'react-test-renderer';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({data:null as any,api:vi.fn(),reload:vi.fn()}));
vi.mock('../../web/src/lib/api',()=>({api:state.api}));
vi.mock('../../web/src/components/Applications',()=>({default:()=>createElement('aside',null,'Interested tracker')}));
vi.mock('../../web/src/components/ui',()=>({useLoad:()=>({data:state.data,reload:state.reload,setData:vi.fn()}),toast:vi.fn(),Typing:()=>null,Sheet:({children}:any)=>children}));
import Explore from '../../web/src/pages/Explore';
let renderer:ReactTestRenderer;
const opportunity=(id:string,bucket:string)=>({id,name:id,bucket,costLabel:bucket==='free'?'Free':'Cost not confirmed — check the official site',category:'Program',fit:{fit:'good',factors:[],eligibility:{checks:[]}},canAsk:false});
beforeEach(()=>{state.api.mockReset();state.reload.mockReset();state.api.mockResolvedValue({ok:true});state.data={picks:[opportunity('free-one','free'),opportunity('paid-one','paid')],recommended:[],excluded:[],discoveryEnabled:false,sampleData:false,interestedCount:0,refresh:{available:true,remaining:1,nextAvailableAt:'2030-01-01T00:00:00.000Z'},finding:false,search:{phase:'complete',found:2,detail:null,startedAt:'2026-11-02T12:00:00Z'}};});
afterEach(()=>{if(renderer)act(()=>renderer.unmount());});
it('keeps the Paid bucket computed but collapsed for a free-only student, with honest unknown-cost labels',async()=>{
 await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'free',interests:['Robotics']} as any,ask:vi.fn()}));});const buckets=renderer.root.findAllByType('details');expect(buckets[0].props.open).toBe(true);expect(buckets[1].props.open).toBe(false);expect(JSON.stringify(renderer.toJSON())).toContain('Show paid or cost-unconfirmed options');expect(JSON.stringify(renderer.toJSON())).toContain('Cost not confirmed');
 expect(renderer.root.findAllByType('button').find(b=>b.children.join('')==='Search for more')!.props.disabled).toBe(true);expect(renderer.root.findAllByType('button').some(b=>b.children.join('')==='Ask about this program')).toBe(false);
});
it('records a dismissal reason before asking the server for the replacement',async()=>{
 await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'any',interests:['Robotics']} as any,ask:vi.fn()}));});await act(async()=>{renderer.root.findAllByType('button').find(b=>b.children.join('')==='Not for me')!.props.onClick();});await act(async()=>{await renderer.root.findAllByType('button').find(b=>b.children.join('')==='cost')!.props.onClick();});expect(state.api).toHaveBeenCalledWith('/api/opportunities/free-one/status',{body:{status:'dismissed',reason:'cost'}});expect(state.reload).toHaveBeenCalledTimes(1);
});
it('opens Buddy with a server-enforced program scope when program questions are available',async()=>{
 state.data.discoveryEnabled=true;state.data.picks[0].canAsk=true;const ask=vi.fn();await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'any',interests:['Robotics']} as any,ask}));});act(()=>renderer.root.findAllByType('button').find(b=>b.children.join('')==='Ask about this program')!.props.onClick());expect(ask).toHaveBeenCalledWith('What should I know about free-one?','free-one');
});

it('keeps the search control visible and explains the readiness blocker beside the student interests',async()=>{
 state.data.unavailable={code:'ai_consent_required',message:'Turn on AI help in You → Privacy.'};
 await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'any',interests:['Robotics']} as any,ask:vi.fn()}));});
 const button=renderer.root.findAllByType('button').find(b=>b.children.join('')==='Search for more')!;
 expect(button.props.disabled).toBe(true);expect(button.props['aria-describedby']).toBe('opportunity-search-status');
 const rendered=JSON.stringify(renderer.toJSON());expect(rendered).toContain('Turn on AI help');expect(rendered).toContain('Robotics');expect(state.api).not.toHaveBeenCalled();
});

it('keeps the control visible while finding programs and enables the existing refresh action after completion',async()=>{
 state.data.discoveryEnabled=true;state.data.finding=true;
 const props={me:{budget:'any',interests:['Robotics']} as any,ask:vi.fn()};
 await act(async()=>{renderer=create(createElement(Explore,props));});
 const findButton=()=>renderer.root.findAllByType('button').find(b=>b.children.join('')==='Search for more')!;
 expect(findButton().props.disabled).toBe(true);expect(JSON.stringify(renderer.toJSON())).toContain('Checking your program library');
 state.data={...state.data,finding:false};await act(async()=>renderer.update(createElement(Explore,props)));
 expect(findButton().props.disabled).toBe(false);await act(async()=>findButton().props.onClick());
 expect(state.api).toHaveBeenCalledWith('/api/opportunities/refresh',{method:'POST'});expect(state.reload).toHaveBeenCalled();
});

it('disables a spent manual refresh and displays its next date without hiding catalog picks',async()=>{
 state.data.discoveryEnabled=true;state.data.refresh.available=false;
 await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'any',interests:['Robotics']} as any,ask:vi.fn()}));});
 expect(renderer.root.findAllByType('button').find(b=>b.children.join('')==='Search for more')!.props.disabled).toBe(true);
 expect(JSON.stringify(renderer.toJSON())).toContain('Next search available on');expect(JSON.stringify(renderer.toJSON())).toContain('free-one');
});

it('shows Interested only after a student has saved a program',async()=>{
 const props={me:{budget:'any',interests:['Robotics']} as any,ask:vi.fn()};await act(async()=>{renderer=create(createElement(Explore,props));});expect(JSON.stringify(renderer.toJSON())).not.toContain('Interested tracker');state.data={...state.data,interestedCount:1};await act(async()=>renderer.update(createElement(Explore,props)));expect(JSON.stringify(renderer.toJSON())).toContain('Interested tracker');
});
it('shows honest empty, no-interest and partial bucket states without sample titles',async()=>{
 state.data={...state.data,picks:[],discoveryEnabled:true};const props={me:{budget:'free',interests:[]} as any,ask:vi.fn()};await act(async()=>{renderer=create(createElement(Explore,props));});expect(JSON.stringify(renderer.toJSON())).toContain('Add an interest');expect(renderer.root.findAllByType('button').find(b=>b.children.join('')==='Search for more')!.props.disabled).toBe(true);
 await act(async()=>renderer.update(createElement(Explore,{...props,me:{...props.me,interests:['Art']}})));expect(JSON.stringify(renderer.toJSON())).toContain('No active opportunities found');expect(JSON.stringify(renderer.toJSON())).toContain('Only ');expect(JSON.stringify(renderer.toJSON())).not.toContain('Sample data');
});
it('provides a real retry after failed search and an accessible progress state during search',async()=>{
 state.data={...state.data,discoveryEnabled:true,error:'Official pages could not be read.'};const props={me:{budget:'any',interests:['Art']} as any,ask:vi.fn()};await act(async()=>{renderer=create(createElement(Explore,props));});expect(renderer.root.findAllByType('button').some(b=>b.children.join('')==='Try again')).toBe(true);expect(JSON.stringify(renderer.toJSON())).toContain('does not use your search allowance');state.data={...state.data,finding:true,error:null,picks:[]};await act(async()=>renderer.update(createElement(Explore,props)));expect(renderer.root.findByProps({className:'search-status'}).props['aria-busy']).toBe(true);expect(JSON.stringify(renderer.toJSON())).not.toContain('free-one');
});

it('shows the shared monthly blocker and reset while preserving picks and the unused personal allowance, then enables search when status recovers',async()=>{
 state.data={...state.data,discoveryEnabled:true,limited:true,monthlyAllowance:{limited:true,reasons:['discovery_monthly_limit'],resetsAt:'2030-02-01T00:00:00Z'}};
 const props={me:{budget:'any',interests:['Robotics']} as any,ask:vi.fn()};
 await act(async()=>{renderer=create(createElement(Explore,props));});
 expect(JSON.stringify(renderer.toJSON())).toContain('shared monthly search allowance');expect(JSON.stringify(renderer.toJSON())).toContain('Monthly usage resets');expect(JSON.stringify(renderer.toJSON())).toContain('free-one');
 const button=()=>renderer.root.findAllByType('button').find(b=>b.children.join('')==='Search for more')!;
 expect(button().props.disabled).toBe(true);
 state.data={...state.data,limited:false,monthlyAllowance:{...state.data.monthlyAllowance,limited:false,reasons:[]}};
 await act(async()=>renderer.update(createElement(Explore,props)));expect(button().props.disabled).toBe(false);
});
it('keeps progress visible for already queued work when that reservation uses the final shared slot',async()=>{
 state.data={...state.data,discoveryEnabled:true,finding:true,limited:false,monthlyAllowance:{limited:true,reasons:['ai_monthly_limit'],resetsAt:'2030-02-01T00:00:00Z'}};
 await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'any',interests:['Art']} as any,ask:vi.fn()}));});
 expect(JSON.stringify(renderer.toJSON())).toContain('Checking your program library');expect(JSON.stringify(renderer.toJSON())).not.toContain('allowance has been reached');
});
it('reloads current allowance after a rejected refresh instead of leaving an apparently enabled stale control',async()=>{
 state.data={...state.data,discoveryEnabled:true};state.api.mockRejectedValueOnce(new Error('The shared monthly AI allowance has been reached.'));
 await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'any',interests:['Art']} as any,ask:vi.fn()}));});
 await act(async()=>renderer.root.findAllByType('button').find(b=>b.children.join('')==='Search for more')!.props.onClick());
 expect(state.reload).toHaveBeenCalledTimes(1);expect(JSON.stringify(renderer.toJSON())).toContain('monthly AI allowance');
});
it('offers an explicit first search without making a request or claiming an empty search result on entry',async()=>{
 state.data={...state.data,discoveryEnabled:true,picks:[],search:{phase:'idle',found:0,detail:null,startedAt:null}};
 await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'any',interests:['Art']} as any,ask:vi.fn()}));});
 expect(state.api).not.toHaveBeenCalled();expect(JSON.stringify(renderer.toJSON())).not.toContain('No active opportunities found');expect(renderer.root.findAllByType('details')).toHaveLength(0);
 const button=renderer.root.findAllByType('button').find(b=>b.children.join('')==='Search for opportunities')!;expect(button.props.disabled).toBe(false);
 await act(async()=>button.props.onClick());expect(state.api).toHaveBeenCalledWith('/api/opportunities/refresh',{method:'POST'});
});
it('enables catalog reuse even with AI unavailable and both shared and personal limits reached',async()=>{
 state.data={...state.data,catalog:{complete:true,free:3,paid:3,missingInterests:[]},limited:true,refresh:{...state.data.refresh,available:false,remaining:0},monthlyAllowance:{limited:true,reasons:['ai_monthly_limit'],resetsAt:'2030-02-01T00:00:00Z'}};
 await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'any',interests:['Art']} as any,ask:vi.fn()}));});
 const button=renderer.root.findAllByType('button').find(b=>b.children.join('')==='Refresh library picks')!;expect(button.props.disabled).toBe(false);
 expect(JSON.stringify(renderer.toJSON())).toContain('without a new web search');expect(JSON.stringify(renderer.toJSON())).not.toContain('Monthly usage resets');
});
