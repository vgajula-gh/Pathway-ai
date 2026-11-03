import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {gzipSync} from 'node:zlib';
const remote=vi.hoisted(()=>({lookup:vi.fn(),get:vi.fn()}));
vi.mock('node:dns/promises',()=>({lookup:remote.lookup}));vi.mock('node:https',()=>({get:remote.get}));
import {fetchOfficialPage,readable} from '../src/discovery/pages.js';import {RunBudget} from '../src/discovery/config.js';
const text='An official program offers a detailed activity for students with published rules and eligibility. '.repeat(3);
function response(status:number,body:string|Buffer,headers:Record<string,string>={}) {return (url:any,options:any,cb:any)=>{const req=new EventEmitter() as any;req.destroy=(error:Error)=>{req.emit('error',error);req.emit('close');};queueMicrotask(()=>{const res=new EventEmitter() as any;res.statusCode=status;res.headers=headers;res.resume=()=>{};cb(res);res.emit('data',Buffer.isBuffer(body)?body:Buffer.from(body));res.emit('end');req.emit('close');});return req;};}
afterEach(()=>vi.unstubAllEnvs());
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
it('accepts a real HTML document served with a generic binary type and normalizes the header',async()=>{
 remote.get.mockImplementationOnce(response(404,'')).mockImplementationOnce(response(200,`<!doctype html><html><body><main>${text}</main></body></html>`,{'content-type':'Application/Octet-Stream; charset=UTF-8'}));
 expect((await fetchOfficialPage('https://example.edu/program',new RunBudget())).text).toBe(text.trim());
});
it.each(['application/pdf','application/json','application/octet-stream'])('rejects non-HTML %s with a safe source type',async type=>{
 const body=type==='application/pdf'?'%PDF-1.7 document':type==='application/json'?JSON.stringify({program:text}):'not an HTML document';
 remote.get.mockImplementationOnce(response(404,'')).mockImplementationOnce(response(200,body,{'content-type':type}));
 await expect(fetchOfficialPage('https://example.edu/program',new RunBudget())).rejects.toMatchObject({info:{stage:'fetch',code:'unsupported_content',mediaType:type}});
});
it('rejects binary signatures even when the server declares HTML',async()=>{
 remote.get.mockImplementationOnce(response(404,'')).mockImplementationOnce(response(200,'%PDF-1.7 '+text,{'content-type':'text/html'}));
 await expect(fetchOfficialPage('https://example.edu/program',new RunBudget())).rejects.toMatchObject({info:{code:'unsupported_content',mediaType:'application/pdf'}});
});
it('distinguishes a broken compressed response from an unsupported document format',async()=>{
 remote.get.mockImplementationOnce(response(404,'')).mockImplementationOnce(response(200,'not gzip',{'content-encoding':'gzip','content-type':'text/html'}));
 await expect(fetchOfficialPage('https://example.edu/program',new RunBudget())).rejects.toMatchObject({info:{code:'content_decoding_failed',contentEncoding:'gzip'}});
});
it('keeps the decompressed size bound and reports oversized output accurately',async()=>{
 remote.get.mockImplementationOnce(response(404,'')).mockImplementationOnce(response(200,gzipSync('a'.repeat(1024*1024+1)),{'content-encoding':'gzip','content-type':'text/html'}));
 await expect(fetchOfficialPage('https://example.edu/program',new RunBudget())).rejects.toMatchObject({info:{code:'page_too_large'}});
});
it('collects supporting HTML links before removing navigation and excludes downloads before the link cap',()=>{
 const page=readable(`<nav><a href="/rules.pdf">Download</a><a href="/fees.docx">Fees document</a><a href="/eligibility">Eligibility</a><a href="/faq">FAQ</a><a href="/apply">Apply</a></nav><main>${text}</main>`,'https://example.edu/program');
 expect(page.links).toEqual(['https://example.edu/eligibility','https://example.edu/faq','https://example.edu/apply']);expect(page.text).toBe(text.trim());
});

it('follows an owner-reviewed application redirect with destination DNS and robots checks',async()=>{
 vi.stubEnv('SCOUT_REDIRECT_DOMAINS','application.example.org');
 remote.get.mockImplementationOnce(response(404,'')).mockImplementationOnce(response(302,'',{location:'https://application.example.org/apply'})).mockImplementationOnce(response(404,'')).mockImplementationOnce(response(200,`<main>${text}</main>`));
 const page=await fetchOfficialPage('https://example.edu/program',new RunBudget());expect(page.sourceUrl).toBe('https://application.example.org/apply');expect(remote.lookup).toHaveBeenCalledWith('application.example.org',{all:true});expect(remote.get.mock.calls[0][1].headers['user-agent']).toContain('PathwayOpportunityBot/1.0');
});
