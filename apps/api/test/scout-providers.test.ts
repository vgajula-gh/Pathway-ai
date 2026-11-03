import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const sdk=vi.hoisted(()=>({responses:vi.fn(),chat:vi.fn(),messages:vi.fn(),options:[] as any[]}));
vi.mock('openai',()=>({default:class {static APIError=class extends Error {};responses={create:sdk.responses};chat={completions:{create:sdk.chat}};constructor(options:any){sdk.options.push(options);}}}));
vi.mock('@anthropic-ai/sdk',()=>({default:class {messages={create:sdk.messages};constructor(options:any){sdk.options.push(options);}}}));
import {openaiSearch} from '../src/agent/llm/search-openai.js';
import {anthropicSearch} from '../src/agent/llm/search-anthropic.js';
import {research} from '../src/scout/research.js';
import {extractScout} from '../src/scout/extract.js';
import {env} from '../src/lib/env.js';
import {scoutFixture} from './fixtures/scout.js';
import {researchOutput} from '../src/scout/providers.js';
import {searchDiagnostics} from '../src/discovery/diagnostics.js';
import {ResearchJSON,FactsJSON} from '../src/scout/schema.js';
const previous={...env};
const context={today:'2026-11-02',gradeBand:'9-10',interests:['AI','coding','business'],focusInterests:['AI','coding'],region:'NC',buckets:['free','paid'] as ('free'|'paid')[]};
const leads={candidates:[{name:'Example Robotics',officialUrl:'https://example.edu/robotics',interests:['coding'],costHint:'free'}],searchThemesUsed:['coding']};
beforeEach(()=>{
 Object.assign(env,{provider:'openai',openaiKey:'fake-key',openaiModel:'reader',aiDisabled:false});vi.stubEnv('AI_MODEL_SCOUT','research-model');vi.stubEnv('AI_MODEL_EXTRACTION','reader');
 sdk.responses.mockReset();sdk.messages.mockReset();sdk.chat.mockReset();sdk.options.length=0;
 sdk.responses.mockResolvedValue({id:'resp-test',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(leads),annotations:[]}]}],usage:{input_tokens:100,output_tokens:30}});
 sdk.messages.mockResolvedValue({id:'msg-test',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(leads)}],usage:{input_tokens:90,output_tokens:25}});
 sdk.chat.mockResolvedValue({id:'chat-test',choices:[{finish_reason:'stop',message:{content:JSON.stringify(leads)}}],usage:{prompt_tokens:50,completion_tokens:20}});
});
afterEach(()=>{Object.assign(env,previous);vi.unstubAllEnvs();});
it.each(['openai','anthropic'])('requests bounded %s web research and captures model usage',async provider=>{
 const search=provider==='openai'?openaiSearch():anthropicSearch();
 const result=await search.research!(context,6);
 expect(result.text).toContain('Example Robotics');expect(result.usage.provider).toBe(provider);expect(result.usage.inputTokens).toBeGreaterThan(0);
 const request=(provider==='openai'?sdk.responses:sdk.messages).mock.calls[0][0];
 expect(request.model).toBe('research-model');expect(JSON.stringify(request)).toContain('business');expect(sdk.options[0]).toMatchObject({maxRetries:0,timeout:150000});
});
it('repairs invalid JSON once without another web search and records both calls',async()=>{
 const provider={research:vi.fn(async()=>({text:'invalid JSON text',citations:[],usage:{provider:'openai' as const,model:'research-model',inputTokens:10,outputTokens:5,responseId:'resp'}}))},calls=vi.fn(async()=>{});
 expect((await research(provider,context,6,true,calls)).output.candidates).toHaveLength(1);
 expect(provider.research).toHaveBeenCalledOnce();expect(sdk.chat).toHaveBeenCalledOnce();expect(calls).toHaveBeenCalledTimes(2);
 expect(sdk.chat.mock.calls[0][0]).not.toHaveProperty('tools');
 await expect(research(provider,context,6,false,calls)).rejects.toMatchObject({info:{code:'invalid_json'}});expect(sdk.chat).toHaveBeenCalledOnce();
});
it('does not repair or repeat a provider timeout',async()=>{
 const provider={research:vi.fn().mockRejectedValue(new DOMException('private error','AbortError'))};
 await expect(research(provider,context,6,true,async()=>{})).rejects.toThrow();expect(provider.research).toHaveBeenCalledOnce();expect(sdk.chat).not.toHaveBeenCalled();
});
it('fits a format repair into the remaining worker deadline and skips repair once that deadline has passed',async()=>{
 const provider={research:vi.fn(async()=>({text:'invalid JSON',citations:[],usage:{provider:'openai' as const,model:'test',inputTokens:1,outputTokens:1,responseId:null}}))};
 await research(provider,context,6,true,async()=>{},undefined,Date.now()+5000);expect(sdk.options.at(-1).timeout).toBeLessThanOrEqual(5000);
 const calls=sdk.chat.mock.calls.length;await expect(research(provider,context,6,true,async()=>{},undefined,Date.now()-1)).rejects.toMatchObject({info:{code:'run_limit'}});expect(sdk.chat).toHaveBeenCalledTimes(calls);
});
it('extracts source passage references with strict schema and no generated quotations',async()=>{
 const f=scoutFixture();sdk.chat.mockResolvedValue({id:'chat',choices:[{finish_reason:'stop',message:{content:JSON.stringify(f.facts)}}],usage:{prompt_tokens:20,completion_tokens:10}});
 const result=await extractScout([f.page]);expect(result.facts.name).toBe('Example Robotics');expect(result.usage?.inputTokens).toBe(20);
 const request=sdk.chat.mock.calls[0][0];expect(request.response_format.json_schema.strict).toBe(true);expect(JSON.stringify(request.messages)).toContain('p0-s0');
});
it('keeps named HTTPS leads with absent metadata or harmless additional fields without a paid repair',async()=>{
 const provider={research:vi.fn(async()=>({text:JSON.stringify({candidates:[{name:'Example Robotics',officialUrl:'https://example.edu/robotics',description:'Ignored public prose'}]}),citations:[],usage:{provider:'openai' as const,model:'test',inputTokens:10,outputTokens:5,responseId:'resp'}}))};
 const result=await research(provider,context,6,true,async()=>{});expect(result.output).toEqual({candidates:[{name:'Example Robotics',officialUrl:'https://example.edu/robotics',interests:[],costHint:'unknown'}],searchThemesUsed:[]});expect(sdk.chat).not.toHaveBeenCalled();expect(provider.research).toHaveBeenCalledOnce();
});
it('uses provider-supported string formats in the actual repair request while enforcing full URL checks locally',async()=>{
 const formats=new Set(['date-time','time','date','duration','email','hostname','ipv4','ipv6','uuid']);
 const check=(value:any):void=>{if(!value||typeof value!=='object')return;if(typeof value.format==='string')expect(formats.has(value.format)).toBe(true);for(const v of Object.values(value))check(v);};
 check(ResearchJSON.schema);check(FactsJSON.schema);
 sdk.chat.mockImplementation(async(request)=>{check(request.response_format.json_schema.schema);const url=request.response_format.json_schema.schema.properties.candidates.items.properties.officialUrl;expect(url.type).toBe('string');expect(url).not.toHaveProperty('format');expect(new RegExp(url.pattern).test('https://example.edu')).toBe(true);expect(new RegExp(url.pattern).test('http://example.edu')).toBe(false);return {id:'repair',choices:[{finish_reason:'stop',message:{content:JSON.stringify(leads)}}]};});
 const provider={research:vi.fn(async()=>({text:'malformed JSON',citations:[],usage:{provider:'openai' as const,model:'test',inputTokens:1,outputTokens:1,responseId:null}}))};
 expect((await research(provider,context,6,true,async()=>{})).repaired).toBe(true);expect(sdk.chat).toHaveBeenCalledOnce();
 for(const url of ['https://user:password@example.edu','https://example.edu:8443/program','http://example.edu','https://'])expect(()=>researchOutput(JSON.stringify({candidates:[{name:'Unsafe',officialUrl:url}]}))).toThrow();
});
it('accepts an array envelope and keeps valid siblings while excluding unsafe or nameless leads',()=>{
 const output=researchOutput(JSON.stringify([{name:'Valid',officialUrl:'https://example.edu/program'},{name:'Unsafe',officialUrl:'http://example.edu'},{officialUrl:'https://example.edu/nameless'}]));
 expect(output.candidates).toHaveLength(1);expect(output.candidates[0].name).toBe('Valid');
 expect(()=>researchOutput('{"unexpected":true}')).toThrow();expect(researchOutput('{"candidates":[]}').candidates).toEqual([]);
});
it('reports the actual controlled schema field/code without copying rejected values or arbitrary keys',()=>{
 try{researchOutput(JSON.stringify({candidates:[{name:'Secret-valued name',officialUrl:'http://invalid.example',private_key:'sk-private-sentinel'}]}));throw new Error('Expected failure');}catch(e:any){
  expect(e.info.issues).toContainEqual({field:'candidates.item.officialUrl',code:'custom'});expect(JSON.stringify(e.info)).not.toMatch(/Secret-valued|private_key|sk-private/);
 }
});
it('distinguishes rejected web research from rejected format repair, preserving safe parameter metadata without retrying',async()=>{
 const error=Object.assign(new Error('private request body and credentials'),{status:400,code:'unsupported_parameter',param:'max_tool_calls'});
 const provider={research:vi.fn().mockRejectedValue(error)};
 let info:any;try{await research(provider,context,6,true,async()=>{});}catch(e:any){info=e.info;}
 expect(info).toMatchObject({operation:'research',httpStatus:400,providerCode:'unsupported_parameter',providerParam:'max_tool_calls'});expect(provider.research).toHaveBeenCalledOnce();expect(sdk.chat).not.toHaveBeenCalled();
 provider.research.mockResolvedValue({text:'bad JSON',citations:[],usage:{provider:'openai',model:'test',inputTokens:1,outputTokens:1,responseId:null}});sdk.chat.mockRejectedValue(Object.assign(new Error('private message'),{status:400,error:{code:'invalid_json_schema',param:'response_format'}}));
 try{await research(provider,context,6,true,async()=>{});}catch(e:any){info=e.info;}
 const {diagnostics}=searchDiagnostics([{id:'error',usage:JSON.stringify({failures:[info]})}]);
 expect(diagnostics.failures[0]).toMatchObject({operation:'repair',providerCode:'invalid_json_schema',providerParam:'response_format',httpStatus:400});expect(JSON.stringify(diagnostics)).not.toContain('private');expect(sdk.chat).toHaveBeenCalledOnce();
});
it('recovers literal search links from unreadable prose without another model request',async()=>{
 const provider={research:vi.fn(async()=>({text:'Found [Coding Studio](https://example.edu/studio), but this response is not JSON.',citations:[],usage:{provider:'openai' as const,model:'test',inputTokens:1,outputTokens:1,responseId:null}}))};
 const result=await research(provider,context,6,false,async()=>{});expect(result.output.candidates[0]).toMatchObject({name:'Coding Studio',officialUrl:'https://example.edu/studio',costHint:'unknown'});expect(sdk.chat).not.toHaveBeenCalled();
});
it('keeps actual provider citations even when the final response was truncated',async()=>{
 sdk.responses.mockResolvedValue({id:'partial',status:'incomplete',output:[{type:'message',content:[{type:'output_text',text:'Here are the program links, unfinished',annotations:[{type:'url_citation',url:'https://example.edu/program',title:'Example Program'}]}]}],usage:{input_tokens:10,output_tokens:5}});
 const result=await research({research:openaiSearch().research!},context,6,false,async()=>{});
 expect(result.output.candidates[0]).toMatchObject({name:'Example Program',officialUrl:'https://example.edu/program'});expect(sdk.responses).toHaveBeenCalledOnce();expect(sdk.chat).not.toHaveBeenCalled();
});

it('allows bounded multi-search research and records observed web tool calls',async()=>{
 vi.stubEnv('SCOUT_MAX_TOOL_CALLS','4');sdk.responses.mockResolvedValue({id:'research',output:[{type:'web_search_call'},{type:'web_search_call'},{type:'message',content:[{type:'output_text',text:JSON.stringify(leads),annotations:[]}]}],usage:{input_tokens:200,output_tokens:100}});
 const result=await openaiSearch().research!(context,6);expect(sdk.responses.mock.calls[0][0]).toMatchObject({max_tool_calls:4,tools:[{search_context_size:'medium'}]});expect(result.usage.webSearches).toBe(2);
 await anthropicSearch().research!(context,6);expect(sdk.messages.mock.calls[0][0].tools[0].max_uses).toBe(4);
});
it('preserves valid links and research quotes when other optional details are malformed',()=>{
 const result=researchOutput(JSON.stringify({candidates:[{...leads.candidates[0],details:{organizer:'Example',deadline:42,costType:'free',evidence:[{field:'costType',quote:'Participation is free.',sourceUrl:'https://example.edu/robotics'},{field:'deadline',quote:'unsafe',sourceUrl:'http://example.edu'}]}}]}));
 expect(result.candidates[0].details).toMatchObject({organizer:'Example',deadline:null,costType:'free',applicationStatus:'unknown'});expect(result.candidates[0].details!.evidence).toHaveLength(1);
});
