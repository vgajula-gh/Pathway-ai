import {createElement} from 'react';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
const state=vi.hoisted(()=>({api:vi.fn(),news:null as any}));
vi.mock('../../web/src/lib/api',()=>({api:state.api}));
vi.mock('../../web/src/components/ui',async()=>({...await vi.importActual('../../web/src/components/ui'),toast:vi.fn(),Sheet:({children}:any)=>createElement('div',{role:'dialog'},children)}));
import WordSpark from '../../web/src/components/WordSpark';
import NewsSpark from '../../web/src/components/NewsSpark';
let renderer:ReactTestRenderer;
const daily={word:'lucid',pos:'adjective',meaning:'clear',example:'A lucid explanation.'};
const me={aiConsent:false,settings:{newsTopics:['Space']}} as any;
const text=()=>JSON.stringify(renderer.toJSON());
const click=async(name:string)=>act(async()=>{renderer.root.findAllByType('button').find(b=>b.children.join('')===name)!.props.onClick();});
const story=(id:string)=>({id,topic:'Space',headline:'Publisher story '+id,summary:'A sourced summary',source:'NASA',url:'https://www.nasa.gov/article/'+id,publishedAt:'2030-01-07'});
beforeEach(()=>{
  state.news={topics:['Space'],allTopics:['Space','Science'],custom:true,personal:true,stories:[story('one'),story('two')],top:story('one'),emptyTopics:[],updatedAt:'2030-01-07T12:00:00Z'};
  state.api.mockReset().mockImplementation(async(path:string)=>path==='/api/news'?state.news:path.startsWith('/api/words')?{date:'2030-01-07',word:{word:'tenacious',pos:'adjective',meaning:'persistent',example:'A tenacious team.'},position:2,total:500}:{...state.news,refresh:{status:'refreshed'}});
});
afterEach(()=>{if(renderer)act(()=>renderer.unmount());vi.unstubAllGlobals();});
it('lets students practice extra words, retain them during background updates and return to the daily word',async()=>{
  await act(async()=>{renderer=create(createElement(WordSpark,{key:'2030-01-07',dailyWord:daily}));});
  await click('Next word');expect(state.api).toHaveBeenCalledWith('/api/words?offset=1');expect(text()).toContain('tenacious');expect(text()).toContain('WORD PRACTICE');
  act(()=>renderer.update(createElement(WordSpark,{key:'2030-01-07',dailyWord:{...daily}})));expect(text()).toContain('tenacious');
  await click('Today’s word');expect(text()).toContain('lucid');expect(text()).not.toContain('tenacious');
  expect(state.api.mock.calls.every(([,options])=>!options)).toBe(true);
});
it('preserves the current word after a read error and resets practice on a new local day',async()=>{
  await act(async()=>{renderer=create(createElement(WordSpark,{key:'day-one',dailyWord:daily}));});
  state.api.mockRejectedValueOnce(new Error('Words unavailable'));await click('Next word');expect(text()).toContain('Words unavailable');expect(text()).toContain('lucid');
  await click('Next word');expect(text()).toContain('tenacious');
  act(()=>renderer.update(createElement(WordSpark,{key:'day-two',dailyWord:daily})));expect(text()).toContain('WORD OF THE DAY');expect(text()).not.toContain('tenacious');
});
it('speaks the currently displayed practice word',async()=>{
  const speech={cancel:vi.fn(),speak:vi.fn()};vi.stubGlobal('window',{speechSynthesis:speech});vi.stubGlobal('speechSynthesis',speech);vi.stubGlobal('SpeechSynthesisUtterance',class {constructor(public text:string){}});
  await act(async()=>{renderer=create(createElement(WordSpark,{dailyWord:daily}));});await click('Next word');await click('Hear it');
  expect(speech.speak.mock.calls[0][0].text).toBe('tenacious');
});
it('browses sourced stories without a provider call and explicitly refreshes live feeds',async()=>{
  const ask=vi.fn();await act(async()=>{renderer=create(createElement(NewsSpark,{me,setMe:vi.fn(),ask}));});
  expect(text()).toContain('Publisher story one');await click('Next story');expect(text()).toContain('Publisher story two');
  expect(state.api.mock.calls.every(([,options])=>!options)).toBe(true);
  state.news={...state.news,top:story('new'),stories:[story('new')]};await click('Refresh news');
  expect(state.api).toHaveBeenCalledWith('/api/news/refresh',{method:'POST'});expect(text()).toContain('Publisher story new');expect(text()).toContain('publisher feeds');expect(ask).not.toHaveBeenCalled();
});
it('retains articles on a refresh error and explains a cached result honestly',async()=>{
  await act(async()=>{renderer=create(createElement(NewsSpark,{me,setMe:vi.fn(),ask:vi.fn()}));});
  state.api.mockRejectedValueOnce(new Error('Network unavailable'));await click('Refresh news');expect(text()).toContain('Publisher story one');expect(text()).toContain('Your existing stories are kept');
  state.api.mockResolvedValueOnce({...state.news,refresh:{status:'cached'}});await click('Refresh news');expect(text()).toContain('checked recently');expect(text()).not.toContain('Latest available stories loaded');
});
it('can refresh an empty news library and exposes the same refresh in the news sheet',async()=>{
  state.news={...state.news,top:null,stories:[]};await act(async()=>{renderer=create(createElement(NewsSpark,{me,setMe:vi.fn(),ask:vi.fn()}));});
  expect(text()).toContain('Refresh news to check publisher feeds');await click('Refresh news');expect(state.api).toHaveBeenCalledWith('/api/news/refresh',{method:'POST'});
  await click('Choose news topics');expect(renderer.root.findByProps({role:'dialog'}).findAllByType('button').some(b=>b.children.join('')==='Refresh news')).toBe(true);
});
