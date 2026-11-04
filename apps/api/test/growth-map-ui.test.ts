import {createElement} from 'react';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
const state=vi.hoisted(()=>({api:vi.fn(),map:null as any,catalog:null as any,source:null as any,detail:null as any}));
vi.mock('../../web/src/lib/api',()=>({api:state.api}));
vi.mock('../../web/src/components/ui',async()=>({...await vi.importActual('../../web/src/components/ui'),Sheet:({children}:any)=>createElement('div',{role:'dialog'},children)}));
import GrowthMap from '../../web/src/pages/GrowthMap';
import SkillTagReview from '../../web/src/components/growth-map/SkillTagReview';
import GrowthMapEntry from '../../web/src/components/growth-map/GrowthMapEntry';
let renderer:ReactTestRenderer;
const text=()=>JSON.stringify(renderer.toJSON());
const click=async(label:string)=>act(async()=>{renderer.root.findAllByType('button').find(b=>b.children.join('')===label||b.props['aria-label']===label)!.props.onClick();});
const props=()=>({onClose:vi.fn(),onCapture:vi.fn()});
const coding=()=>({...state.catalog.skills[0],hidden:false,focus:false,count:3,recent:2,lastActivity:'2030-01-07',reached:['Build'],highest:'Build',next:'Apply',thisMonth:3,previousAverage:1,growing:true});
beforeEach(()=>{
 state.catalog={version:1,areas:['STEM','Creative'],skills:[{id:'coding',name:'Coding',area:'STEM',synonyms:['python']},{id:'music',name:'Music',area:'Creative',synonyms:[]}]};
 state.map={date:'2030-01-15',month:'2030-01',skills:[],hidden:[],connections:[],activityCount:0,reviewCount:1,suggestedCount:1,focusSkillId:null,interests:['Coding','Music']};
 state.source={key:'portfolio:p',type:'portfolio',id:'p',title:'My Python project',date:'2030-01-07',kind:'project',defaultStage:'Build',allowedStages:['Learn','Build','Apply','Present','Compete'],eligible:true,note:'Confirm only skills you used.',tags:[],suggestions:['coding'],reviewed:false,reflection:'I built a working tool.'};
 state.detail={skill:coding(),evidence:[{id:'e',title:'My Python project',stage:'Build',date:'2030-01-07',sources:[{type:'portfolio',id:'p',title:'My Python project',date:'2030-01-07'}]}],ladder:['Learn','Build','Apply','Present','Compete'].map(stage=>({stage,description:'Experience stage',reached:stage==='Build',next:stage==='Apply'})),connections:[]};
 state.api.mockReset().mockImplementation(async(path:string,options?:any)=>{
  if(path==='/api/growth-map/catalog')return state.catalog;
  if(path==='/api/growth-map')return state.map;
  if(path.startsWith('/api/growth-map/activities?'))return {items:[state.source],total:1,offset:Number(new URLSearchParams(path.split('?')[1]).get('offset')),limit:10,all:path.includes('all=true')};
  if(path.includes('/activities/portfolio/p')&&!options)return state.source;
  if(path==='/api/growth-map/skills/coding'&&!options)return state.detail;
  return {ok:true};
 });
});
afterEach(()=>{if(renderer)act(()=>renderer.unmount());});
it('starts privately with interests, real empty state and a working capture action',async()=>{
 const p=props();await act(async()=>{renderer=create(createElement(GrowthMap,p));});
 expect(text()).toContain('Your map grows as you do');expect(text()).toContain('PRIVATE TO YOU');expect(text()).toContain('Interest stars are starting points');
 expect(renderer.root.findAllByType('button').filter(b=>String(b.props.className).includes('growth-star'))).toHaveLength(0);
 await click('Capture something you’ve already done');expect(p.onCapture).toHaveBeenCalledOnce();expect(state.api.mock.calls.every(([,o])=>!o)).toBe(true);
});
it('caps map stars at twelve while exposing all skills and connections in List view',async()=>{
 state.map={...state.map,activityCount:4,skills:Array.from({length:15},(_,i)=>({...coding(),id:'skill'+i,name:'Skill '+i,focus:i===0})),connections:[{a:'skill0',b:'skill1',count:1}]};
 await act(async()=>{renderer=create(createElement(GrowthMap,props()));});expect(renderer.root.findAllByType('button').filter(b=>String(b.props.className).startsWith('growth-star'))).toHaveLength(12);expect(text()).toContain('More skills (');
 await click('List');expect(renderer.root.findAllByProps({className:'growth-skill-row'})).toHaveLength(15);expect(text()).toContain('Used with: Skill 1');expect(text()).toContain('Recent evidence:');expect(text()).toContain('Monthly focus') ;
});
it('keeps suggestions unselected until the student confirms and supports manual catalog search',async()=>{
 const saved=vi.fn();await act(async()=>{renderer=create(createElement(SkillTagReview,{type:'portfolio',id:'p',onSaved:saved}));});
 expect(renderer.root.findAllByType('button').find(b=>b.children.join('')==='Coding')!.props['aria-pressed']).toBe(false);
 await click('Coding');act(()=>renderer.root.findByProps({id:'growth-skill-search'}).props.onChange({target:{value:'Music'}}));await click('Music');
 await click('Confirm selected skills');expect(state.api).toHaveBeenCalledWith('/api/growth-map/activities/portfolio/p',{body:{tags:[{skillId:'coding',stage:'Build'},{skillId:'music',stage:'Build'}],linkedMilestoneId:null}});expect(saved).toHaveBeenCalledOnce();
});
it('retains a review on save failure and recovers safely from unavailable or malformed metadata',async()=>{
 const saved=vi.fn(),original=state.api.getMockImplementation()!;
 state.api.mockImplementation(async(p:string,o:any)=>{if(o)throw new Error('Could not save tags');return original(p,o);});
 await act(async()=>{renderer=create(createElement(SkillTagReview,{type:'portfolio',id:'p',onSaved:saved}));});await click('Coding');await click('Confirm selected skills');expect(text()).toContain('Could not save tags');expect(saved).not.toHaveBeenCalled();
 act(()=>renderer.unmount());state.api.mockResolvedValue({});await act(async()=>{renderer=create(createElement(SkillTagReview,{type:'portfolio',id:'bad',onSaved:saved}));});expect(text()).toContain('Your saved activity is safe.');
});
it('keeps both confirmed stages on grouped evidence and opens each stage’s actual source',async()=>{
 state.detail.evidence[0].sources=[{type:'milestone',id:'m',title:'Build the prototype',date:'2030-01-07',stage:'Build'},{type:'portfolio',id:'p',title:'Present the prototype',date:'2030-01-07',stage:'Present'}];state.detail.evidence[0].stage='Present';state.detail.ladder.forEach((r:any)=>{r.reached=['Build','Present'].includes(r.stage);});
 state.map={...state.map,skills:[coding()],activityCount:3};await act(async()=>{renderer=create(createElement(GrowthMap,props()));});
 await click('Coding: 3 evidence, Build, 2 recent, last activity 2030-01-07, Growing');
 const reached=renderer.root.findAllByType('div').filter(n=>n.props.className==='growth-rung reached');expect(reached).toHaveLength(2);expect(text()).toContain('They do not have to happen in order.');
 await click('Present the prototype');expect(state.api).toHaveBeenCalledWith('/api/growth-map/activities/portfolio/p');expect(text()).toContain('I built a working tool.');
});
it('allows one focus, skill hiding/restoration and personal skill correction',async()=>{
 state.map={...state.map,skills:[coding()],activityCount:3};await act(async()=>{renderer=create(createElement(GrowthMap,props()));});
 await click('Change focus');await click('Coding');expect(state.api).toHaveBeenCalledWith('/api/growth-map/focus',{method:'POST',body:{skillId:'coding'}});
 await click('Coding: 3 evidence, Build, 2 recent, last activity 2030-01-07, Growing');await click('Edit skill');act(()=>renderer.root.findByProps({id:'growth-replacement'}).props.onChange({target:{value:'music'}}));await click('Save skill correction');expect(state.api).toHaveBeenCalledWith('/api/growth-map/skills/coding',{method:'PATCH',body:{replacementSkillId:'music',area:'STEM'}});
 await click('Coding: 3 evidence, Build, 2 recent, last activity 2030-01-07, Growing');await click('Hide from map');expect(state.api).toHaveBeenCalledWith('/api/growth-map/skills/coding',{method:'PATCH',body:{hidden:true}});
});
it('shows hidden skills without pretending the student is new and restores them explicitly',async()=>{
 state.map={...state.map,hidden:[{...coding(),hidden:true}],activityCount:0};await act(async()=>{renderer=create(createElement(GrowthMap,props()));});expect(text()).toContain('Your map is hidden');expect(text()).not.toContain('Your map grows as you do');
 await click('Show hidden skills');await click('Restore Coding');expect(state.api).toHaveBeenCalledWith('/api/growth-map/skills/coding',{method:'PATCH',body:{hidden:false}});
});
it('opens historical review batches and sends missing skills for review without adding catalog entries',async()=>{
 await act(async()=>{renderer=create(createElement(GrowthMap,props()));});await click('Review suggested skills');expect(text()).toContain('My Python project');expect(text()).toContain('Nothing is added until you confirm.');
 act(()=>renderer.unmount());await act(async()=>{renderer=create(createElement(GrowthMap,props()));});await click('Suggest a skill');act(()=>renderer.root.findByProps({id:'growth-request'}).props.onChange({target:{value:'Urban gardening'}}));await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(state.api).toHaveBeenCalledWith('/api/growth-map/skill-requests',{body:{name:'Urban gardening'}});expect(text()).toContain('Saved for owner review');
});
it('summarizes the top three evidence skills in You without altering the rest of the profile',async()=>{
 state.map={...state.map,skills:[coding(),{...coding(),id:'music',name:'Music',count:4},{...coding(),id:'debate',name:'Debate',count:2},{...coding(),id:'art',name:'Art',count:1}]};const open=vi.fn();await act(async()=>{renderer=create(createElement(GrowthMapEntry,{onOpen:open}));});expect(text()).toContain('Music · 4 evidence');expect(text()).not.toContain('Art · 1');await click('Open Growth Map');expect(open).toHaveBeenCalledOnce();
});
