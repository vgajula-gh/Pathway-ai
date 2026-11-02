import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const sdk=vi.hoisted(()=>({create:vi.fn(),options:[] as any[]}));
vi.mock('openai',()=>{
  class APIError extends Error {}
  return {default:class {
    static APIError=APIError;
    chat={completions:{create:sdk.create}};
    constructor(options:any){sdk.options.push(options);}
  }};
});

import {env} from '../src/lib/env.js';
const originalEnv={...env};
import {createDiscoveryGraph} from '../src/discovery/graph.js';
import {RunBudget} from '../src/discovery/config.js';
import {verifyOpportunity} from '../src/domain/opportunity-verification.js';
import {failureInfo,failureMessage} from '../src/discovery/failures.js';
import type {Page} from '../src/discovery/pages.js';

// Synthetic official-page fixture: no network, provider charges or student data.
const text='Example Robotics is organized by Example. Open to grades 9–12. Participation is free. Virtual. The application deadline is December 1, 2030.';
const page:Page={sourceUrl:'https://example.edu/robotics',pageTitle:'Example Robotics',text,contentHash:'fixture',checkedAt:new Date(),links:[]};
const response=(content:string,finish_reason='stop')=>({choices:[{finish_reason,message:{content}}]});
const facts=()=>({
  name:'Example Robotics',organizer:'Example',officialUrl:null,category:null,
  gradeMin:9,gradeMax:12,minAge:null,format:'Virtual',region:null,
  costType:'free',costAmount:null,financialAidNote:null,commitment:null,
  skills:null,tags:['Robotics'],deadline:'2030-12-01',applicationStatus:'unknown',activityDate:null,
  eligibilityNotes:null,requirements:null,
  evidence:Object.fromEntries(['name','organizer','gradeMin','gradeMax','format','costType','tags','deadline'].map(field=>[field,{sourceUrl:page.sourceUrl,quote:field==='costType'?'Participation is free.':text}])),
});
beforeEach(()=>{
  Object.assign(env,{provider:'openai',openaiKey:'fake-test-key',openaiModel:'gpt-5-nano',aiDisabled:false});sdk.create.mockReset();sdk.options.length=0;
  vi.stubEnv('LLM_PROVIDER','openai');vi.stubEnv('OPENAI_API_KEY','fake-test-key');
  vi.stubEnv('OPENAI_MODEL','gpt-5-nano');vi.stubEnv('AI_MODEL_EXTRACTION',undefined);
  sdk.create.mockResolvedValue(response(JSON.stringify(facts())));
});
afterEach(()=>{Object.assign(env,originalEnv);vi.unstubAllEnvs();vi.restoreAllMocks();});

it.each([undefined,''])('uses the configured nano model when AI_MODEL_EXTRACTION is %s',async value=>{
  vi.stubEnv('AI_MODEL_EXTRACTION',value);
  const {extract}=await import('../src/discovery/extraction.js');
  expect(await extract([page])).toMatchObject({name:'Example Robotics',gradeMin:9});
  expect(sdk.create.mock.calls[0][0]).toMatchObject({model:'gpt-5-nano',reasoning_effort:'low',max_completion_tokens:8192,response_format:{type:'json_schema',json_schema:{name:'opportunity_facts',strict:true}}});
  expect(sdk.options[0]).toMatchObject({maxRetries:0,timeout:30000});
});
it('uses the extraction override while leaving Buddy’s configured model as nano',async()=>{
  vi.stubEnv('AI_MODEL_EXTRACTION','gpt-4.1-mini');
  const {extract}=await import('../src/discovery/extraction.js');
  await extract([page]);
  expect(sdk.create.mock.calls[0][0]).toMatchObject({model:'gpt-4.1-mini',max_completion_tokens:4096});
  expect(sdk.create.mock.calls[0][0]).not.toHaveProperty('reasoning_effort');
  expect((await import('../src/lib/env.js')).env.openaiModel).toBe('gpt-5-nano');
});
it('fails before a provider call when both model settings are absent',async()=>{
  vi.stubEnv('OPENAI_MODEL',undefined);env.openaiModel='';
  const {extract}=await import('../src/discovery/extraction.js');
  await expect(extract([page])).rejects.toMatchObject({code:'missing_model',status:503});
  expect(sdk.create).not.toHaveBeenCalled();
});
it('identifies malformed JSON specifically without retrying',async()=>{
  sdk.create.mockResolvedValue(response('{"name":'));
  const {extract}=await import('../src/discovery/extraction.js');
  const error=await extract([page]).catch(e=>e);
  expect(failureInfo(error,'extract')).toMatchObject({stage:'extract',code:'invalid_json'});
  expect(failureMessage(failureInfo(error,'extract'))).toBe('The AI returned unreadable program details. Please try again.');
  expect(sdk.create).toHaveBeenCalledOnce();
});
it('identifies invalid field types with controlled field names instead of raw values',async()=>{
  sdk.create.mockResolvedValue(response(JSON.stringify({...facts(),gradeMin:'9'})));
  const {extract}=await import('../src/discovery/extraction.js');
  const error=await extract([page]).catch(e=>e);
  expect(failureInfo(error,'extract')).toMatchObject({code:'invalid_schema',issues:[{field:'gradeMin',code:'invalid_type'}]});
  expect(sdk.create).toHaveBeenCalledOnce();
});
it('rejects a truncated nano completion even when its content looks like valid JSON',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  sdk.create.mockResolvedValue(response(JSON.stringify(facts()),'length'));
  const {extract}=await import('../src/discovery/extraction.js');
  const error=await extract([page]).catch(e=>e);
  expect(error.status).toBe(502);expect(failureInfo(error,'extract')).toMatchObject({code:'incomplete_response',finishReason:'length'});
  expect(warn).toHaveBeenCalledWith('OpenAI incomplete response',expect.objectContaining({model:'gpt-5-nano',finishReason:'length'}));
  expect(sdk.create).toHaveBeenCalledOnce();
});

async function runGraph() {
  const {extract}=await import('../src/discovery/extraction.js');
  const save=vi.fn(async()=> 'fixture-opportunity'),ingest=vi.fn(async()=>{}),budget=new RunBudget();
  const graph=createDiscoveryGraph({
    search:{search:async()=>({urls:[page.sourceUrl],tokens:10})},fetch:async()=>page,extract,
    verify:(data,pages)=>verifyOpportunity(data,pages,new Set(['example.edu'])),save,ingest,
  },budget);
  const result=await graph.invoke({group:{key:'robotics|9-10|NC',topic:'robotics',gradeBand:'9-10',region:'NC'},buckets:['free']});
  return {result,save,ingest,budget};
}
it('passes mini output through extraction and official-evidence verification to catalog storage and indexing',async()=>{
  vi.stubEnv('AI_MODEL_EXTRACTION','gpt-4.1-mini');
  const {result,save,ingest,budget}=await runGraph();
  expect(result.saved).toEqual(['fixture-opportunity']);expect(budget.failures).toEqual([]);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({verificationStatus:'verified',costType:'free',deadline:'2030-12-01'}),[page],expect.objectContaining({topic:'robotics'}));
  expect(ingest).toHaveBeenCalledOnce();
});
it('skips invalid model output in the discovery graph without saving or indexing a program',async()=>{
  sdk.create.mockResolvedValue(response(JSON.stringify({...facts(),gradeMin:'9'})));
  const {result,save,ingest,budget}=await runGraph();
  expect(result.saved).toEqual([]);expect(save).not.toHaveBeenCalled();expect(ingest).not.toHaveBeenCalled();
  expect(budget.failures).toEqual([{stage:'extract',code:'invalid_schema',issues:[{field:'gradeMin',code:'invalid_type'}]}]);
});
it('does not label a valid JSON response as verified when its evidence was invented',async()=>{
  sdk.create.mockResolvedValue(response(JSON.stringify({...facts(),evidence:{}})));
  const {result,save,ingest,budget}=await runGraph();
  expect(result.saved).toEqual([]);expect(save).not.toHaveBeenCalled();expect(ingest).not.toHaveBeenCalled();
  expect(budget.failures).toContainEqual({stage:'verify',code:'missing_evidence'});
});
it('accepts structured nullable evidence without treating unsupported facts as verified',async()=>{
  const {extract,ExtractionJSON}=await import('../src/discovery/extraction.js');
  const keys=Object.keys((ExtractionJSON.schema.properties as any).evidence.properties);
  sdk.create.mockResolvedValue(response(JSON.stringify({...facts(),evidence:{...Object.fromEntries(keys.map(k=>[k,null])),...facts().evidence}})));
  const value=await extract([page]);expect(value.evidence).toEqual(facts().evidence);
  expect(verifyOpportunity(value,[page],new Set(['example.edu'])).verificationStatus).toBe('verified');
  sdk.create.mockResolvedValue(response(JSON.stringify({...facts(),evidence:{...facts().evidence,gradeMin:null}})));
  expect(verifyOpportunity(await extract([page]),[page],new Set(['example.edu']))).toMatchObject({gradeMin:null,verificationStatus:'new_find'});
});
it('keeps the remote schema closed and all fields required while allowing unknown facts',async()=>{
  const {Extraction,ExtractionJSON}=await import('../src/discovery/extraction.js');
  const schema=ExtractionJSON.schema as any;
  expect(schema.required.sort()).toEqual(Object.keys(Extraction.shape).sort());
  expect(schema.additionalProperties).toBe(false);
  expect(schema.properties.evidence.additionalProperties).toBe(false);
  expect(schema.properties.evidence.required.sort()).toEqual(Object.keys(Extraction.shape).filter(k=>k!=='evidence').sort());
  expect(schema.properties.gradeMin.type).toEqual(['integer','null']);
});
it('reports safe schema paths without including rejected values or unknown field names',async()=>{
  const {extract}=await import('../src/discovery/extraction.js');
  sdk.create.mockResolvedValue(response(JSON.stringify({...facts(),name:123,evidence:{...facts().evidence,'private-test-sentinel':{quote:123,sourceUrl:'bad'}}})));
  const error=await extract([page]).catch(e=>e),failure=failureInfo(error,'extract');
  expect(failure).toMatchObject({code:'invalid_schema'});expect(JSON.stringify(failure)).not.toContain('private-test-sentinel');
  expect(JSON.stringify(failure)).not.toContain('bad');expect(failure.issues!.length).toBeLessThanOrEqual(8);
});
it('separates ordinary extraction exceptions from malformed model output without exposing error text',()=>{
  const failure=failureInfo(new TypeError('private-key in a provider payload'),'extract');
  expect(failure).toMatchObject({stage:'extract',code:'extraction_error',errorType:'TypeError'});
  expect(JSON.stringify(failure)).not.toContain('private-key');
});
