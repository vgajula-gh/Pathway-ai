import {beforeEach,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {gzipSync} from 'node:zlib';
const remote=vi.hoisted(()=>({lookup:vi.fn(),get:vi.fn()}));
vi.mock('node:dns/promises',()=>({lookup:remote.lookup}));vi.mock('node:https',()=>({get:remote.get}));
import {fetchOfficialPage} from '../src/discovery/pages.js';import {RunBudget} from '../src/discovery/config.js';
const text='An official program offers a detailed activity for students with published rules and eligibility. '.repeat(3);
function response(status:number,body:string|Buffer,headers:Record<string,string>={}) {return (url:any,options:any,cb:any)=>{const req=new EventEmitter() as any;req.destroy=(error:Error)=>{req.emit('error',error);req.emit('close');};queueMicrotask(()=>{const res=new EventEmitter() as any;res.statusCode=status;res.headers=headers;res.resume=()=>{};cb(res);res.emit('data',Buffer.isBuffer(body)?body:Buffer.from(body));res.emit('end');req.emit('close');});return req;};}
beforeEach(()=>{remote.lookup.mockReset().mockResolvedValue([{address:'93.184.216.34',family:4}]);remote.get.mockReset();});
it('decompresses official HTML, shares robots lookups and pins the connection',async()=>{
 remote.get.mockImplementationOnce(response(404,'')).mockImplementation(response(200,gzipSync(`<main>${text}</main>`),{'content-encoding':'gzip','content-type':'text/html'}));const budget=new RunBudget();expect((await fetchOfficialPage('https://example.edu/program',budget)).text).toBe(text.trim());await fetchOfficialPage('https://example.edu/faq',budget);expect(remote.get).toHaveBeenCalledTimes(3);expect(remote.get.mock.calls.every(c=>typeof c[1].lookup==='function')).toBe(true);
});
it('respects robots disallow without fetching the page',async()=>{
 remote.get.mockImplementation(response(200,'User-agent: *\nDisallow: /private'));await expect(fetchOfficialPage('https://example.edu/private',new RunBudget())).rejects.toMatchObject({info:{stage:'robots',code:'robots_blocked'}});expect(remote.get).toHaveBeenCalledTimes(1);
});
it('fails closed on robots outages and on a mixed public/private DNS answer',async()=>{
 remote.get.mockImplementation(response(503,'down'));await expect(fetchOfficialPage('https://example.edu/program',new RunBudget())).rejects.toMatchObject({info:{code:'robots_unavailable',httpStatus:503}});
 remote.lookup.mockResolvedValue([{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}]);await expect(fetchOfficialPage('https://example.edu/program',new RunBudget())).rejects.toMatchObject({info:{code:'private_address'}});expect(remote.get).toHaveBeenCalledTimes(1);
});
it('accepts only canonical www redirects and repeats destination DNS and robots checks',async()=>{
 remote.get.mockImplementationOnce(response(404,'')).mockImplementationOnce(response(301,'',{location:'https://www.example.edu/program'})).mockImplementationOnce(response(404,'')).mockImplementationOnce(response(200,`<main>${text}</main>`));const page=await fetchOfficialPage('https://example.edu/program',new RunBudget());expect(page.sourceUrl).toBe('https://www.example.edu/program');expect(remote.lookup).toHaveBeenCalledWith('www.example.edu',{all:true});
 remote.get.mockReset().mockImplementationOnce(response(404,'')).mockImplementationOnce(response(302,'',{location:'https://different.edu/'}));await expect(fetchOfficialPage('https://example.edu/program',new RunBudget())).rejects.toMatchObject({info:{code:'redirect_requires_review'}});
});
it('reports HTTP bot blocks safely without retrying another address',async()=>{
 remote.lookup.mockResolvedValue([{address:'93.184.216.34',family:4},{address:'2606:4700:4700::1111',family:6}]);remote.get.mockImplementationOnce(response(404,'')).mockImplementationOnce(response(403,'private provider error'));await expect(fetchOfficialPage('https://example.edu/program',new RunBudget())).rejects.toMatchObject({info:{stage:'fetch',code:'http_error',httpStatus:403,sourceHost:'example.edu'}});expect(remote.get).toHaveBeenCalledTimes(2);
});
