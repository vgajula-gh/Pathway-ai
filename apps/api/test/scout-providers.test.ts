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
 expect(request.model).toBe('research-model');expect(JSON.stringify(request)).toContain('business');expect(sdk.options[0]).toMatchObject({maxRetries:0,timeout:60000});
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
it('extracts source passage references with strict schema and no generated quotations',async()=>{
 const f=scoutFixture();sdk.chat.mockResolvedValue({id:'chat',choices:[{finish_reason:'stop',message:{content:JSON.stringify(f.facts)}}],usage:{prompt_tokens:20,completion_tokens:10}});
 const result=await extractScout([f.page]);expect(result.facts.name).toBe('Example Robotics');expect(result.usage?.inputTokens).toBe(20);
 const request=sdk.chat.mock.calls[0][0];expect(request.response_format.json_schema.strict).toBe(true);expect(JSON.stringify(request.messages)).toContain('p0-s0');
});
