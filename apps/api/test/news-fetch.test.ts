import {EventEmitter} from 'node:events';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({dns:vi.fn(),get:vi.fn(),responses:[] as any[]}));
vi.mock('node:dns/promises',()=>({lookup:state.dns}));
vi.mock('node:https',()=>({get:state.get}));
import {fetchNewsFeed} from '../src/lib/news-fetch.js';
import {NEWS_FEEDS} from '../src/data/news-feeds.js';
const feed=NEWS_FEEDS[0];
beforeEach(()=>{
  state.dns.mockReset().mockResolvedValue([{address:'8.8.8.8',family:4}]);state.responses=[];
  state.get.mockReset().mockImplementation((_url:any,options:any,callback:any)=>{
    const req=Object.assign(new EventEmitter(),{destroy:(error:Error)=>req.emit('error',error)});
    options.signal.addEventListener('abort',()=>req.emit('error',new Error('Aborted')),{once:true});
    queueMicrotask(()=>{const spec=state.responses.shift()??{};const res=Object.assign(new EventEmitter(),{statusCode:spec.status??200,headers:spec.headers??{},resume:vi.fn()});callback(res);res.emit('data',spec.body??Buffer.from('<rss/>'));res.emit('end');});
    return req;
  });
});
afterEach(()=>vi.useRealTimers());
it('pins public DNS and requests only the fixed publisher URL with public headers',async()=>{
  expect(await fetchNewsFeed(feed)).toBe('<rss/>');expect(state.get.mock.calls[0][0].href).toBe(feed.url);
  const options=state.get.mock.calls[0][1];const cb=vi.fn();options.lookup('www.nasa.gov',{all:false},cb);expect(cb).toHaveBeenCalledWith(null,'8.8.8.8',4);
  expect(options.headers).not.toHaveProperty('authorization');
});
it('blocks private DNS and cross-publisher or insecure redirects',async()=>{
  state.dns.mockResolvedValueOnce([{address:'127.0.0.1',family:4}]);await expect(fetchNewsFeed(feed)).rejects.toThrow('Private');expect(state.get).not.toHaveBeenCalled();
  for(const location of ['https://evil.test/feed','http://www.nasa.gov/feed','https://user:pass@www.nasa.gov/feed']){
    state.responses=[{status:302,headers:{location}}];await expect(fetchNewsFeed(feed)).rejects.toThrow('Unsupported feed redirect');
  }
});
it('bounds publisher redirects, HTTP failures and response sizes',async()=>{
  state.responses=Array.from({length:3},()=>({status:302,headers:{location:'/feed/'}}));await expect(fetchNewsFeed(feed)).rejects.toThrow('Too many');
  state.responses=[{status:503}];await expect(fetchNewsFeed(feed)).rejects.toThrow('unavailable');
  state.responses=[{body:Buffer.alloc(1024*1024+1)}];await expect(fetchNewsFeed(feed)).rejects.toThrow('too large');
});
it('enforces a total deadline even if DNS never returns',async()=>{
  vi.useFakeTimers();state.dns.mockImplementation(()=>new Promise(()=>{}));
  const pending=expect(fetchNewsFeed(feed)).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(10000);await pending;
});
