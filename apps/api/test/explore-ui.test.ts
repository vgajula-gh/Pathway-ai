import {createElement} from 'react';import {act,create,ReactTestRenderer} from 'react-test-renderer';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({data:null as any,api:vi.fn(),reload:vi.fn()}));
vi.mock('../../web/src/lib/api',()=>({api:state.api}));
vi.mock('../../web/src/components/Applications',()=>({default:()=>null}));
vi.mock('../../web/src/components/ui',()=>({useLoad:()=>({data:state.data,reload:state.reload}),toast:vi.fn(),Typing:()=>null,Sheet:({children}:any)=>children}));
import Explore from '../../web/src/pages/Explore';
let renderer:ReactTestRenderer;
const opportunity=(id:string,bucket:string)=>({id,name:id,bucket,costLabel:bucket==='free'?'Free':'Cost not confirmed — check the official site',category:'Program',fit:{fit:'good',factors:[],eligibility:{checks:[]}},canAsk:false});
beforeEach(()=>{state.api.mockReset();state.reload.mockReset();state.api.mockResolvedValue({ok:true});state.data={picks:[opportunity('free-one','free'),opportunity('paid-one','paid')],recommended:[],excluded:[],discoveryEnabled:false,sampleData:false,refresh:{available:true},finding:false};});
afterEach(()=>{if(renderer)act(()=>renderer.unmount());});
it('keeps the Paid bucket computed but collapsed for a free-only student, with honest unknown-cost labels',async()=>{
 await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'free'} as any,ask:vi.fn()}));});const buckets=renderer.root.findAllByType('details');expect(buckets[0].props.open).toBe(true);expect(buckets[1].props.open).toBe(false);expect(JSON.stringify(renderer.toJSON())).toContain('Show paid options');expect(JSON.stringify(renderer.toJSON())).toContain('Cost not confirmed');
 expect(renderer.root.findAllByType('button').some(b=>b.children.join('')==='Find new opportunities')).toBe(false);expect(renderer.root.findAllByType('button').some(b=>b.children.join('')==='Ask about this program')).toBe(false);
});
it('records a dismissal reason before asking the server for the replacement',async()=>{
 await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'any'} as any,ask:vi.fn()}));});await act(async()=>{renderer.root.findAllByType('button').find(b=>b.children.join('')==='Not for me')!.props.onClick();});await act(async()=>{await renderer.root.findAllByType('button').find(b=>b.children.join('')==='cost')!.props.onClick();});expect(state.api).toHaveBeenCalledWith('/api/opportunities/free-one/status',{body:{status:'dismissed',reason:'cost'}});expect(state.reload).toHaveBeenCalledTimes(1);
});
it('opens Buddy with a server-enforced program scope when program questions are available',async()=>{
 state.data.discoveryEnabled=true;state.data.picks[0].canAsk=true;const ask=vi.fn();await act(async()=>{renderer=create(createElement(Explore,{me:{budget:'any'} as any,ask}));});act(()=>renderer.root.findAllByType('button').find(b=>b.children.join('')==='Ask about this program')!.props.onClick());expect(ask).toHaveBeenCalledWith('What should I know about free-one?','free-one');
});
