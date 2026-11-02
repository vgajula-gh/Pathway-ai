import {expect,it} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';

// Exercise the real SDK and diagnostic command with HTTP intercepted, never OpenAI.
const text='Example Robotics is organized by Example. Open to grades 9–12. Participation is free. Virtual. The application deadline is December 1, 2030.';
const facts={name:'Example Robotics',organizer:'Example',officialUrl:null,category:null,gradeMin:9,gradeMax:12,minAge:null,format:'Virtual',region:null,costType:'free',costAmount:null,financialAidNote:null,commitment:null,skills:null,tags:['Robotics'],deadline:'2030-12-01',applicationStatus:'unknown',activityDate:null,eligibilityNotes:null,requirements:null,
  evidence:Object.fromEntries(['name','organizer','gradeMin','gradeMax','format','costType','tags','deadline'].map(field=>[field,{sourceUrl:'https://example.edu/robotics',quote:field==='costType'?'Participation is free.':text}]))};
const structuredFacts={...facts,evidence:{...Object.fromEntries(Object.keys(facts).filter(k=>k!=='evidence').map(k=>[k,null])),...facts.evidence}};
async function probe({live=true,content=JSON.stringify(structuredFacts),finish='stop',refusal=null,status=200,transport='',settings={}}:{live?:boolean;content?:string;finish?:string;refusal?:string|null;status?:number;transport?:string;settings?:Record<string,string>}={}) {
  const payload=status===200?{id:'chatcmpl-test',object:'chat.completion',created:1,model:'gpt-4.1-mini',choices:[{index:0,finish_reason:finish,message:{role:'assistant',content,refusal}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}
    :{error:{message:'private-provider-sentinel',type:'invalid_request_error',code:'unsupported_parameter'}};
  const script=`let calls=0;
    globalThis.fetch=async(url,init)=>{
      calls++;
      ${transport==='timeout'?"throw new DOMException('private-network-sentinel','AbortError');":transport==='connection'?"throw new Error('private-network-sentinel');":''}
      const body=JSON.parse(init.body);
      if(body.model!=='gpt-4.1-mini'||body.response_format?.type!=='json_schema'||body.response_format.json_schema.strict!==true||body.response_format.json_schema.schema.additionalProperties!==false)throw new Error('Unexpected extraction request');
      return new Response(${JSON.stringify(JSON.stringify(payload))},{status:${status},headers:{'content-type':'application/json'}});
    };
    ${live?"process.argv.push('--live');":''}
    await import('./scripts/check-extraction.mjs');
    console.log('PROBE_CALLS='+calls);`;
  const result=await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',script],{
    cwd:resolve('../..'),timeout:15000,env:{...process.env,LLM_PROVIDER:'openai',OPENAI_API_KEY:'fake-test-key',OPENAI_MODEL:'gpt-5-nano',AI_MODEL_EXTRACTION:'gpt-4.1-mini',AI_DISABLED:'false',DATABASE_URL:'postgresql://unused:unused@localhost:1/never_connect',...settings},
  }).then(r=>({...r,code:0}),e=>({stdout:e.stdout as string,stderr:e.stderr as string,code:e.code as number}));
  const at=result.stdout.lastIndexOf('PROBE_CALLS=');
  expect(at).toBeGreaterThan(-1);
  return {...result,report:JSON.parse(result.stdout.slice(0,at)),calls:Number(result.stdout.slice(at+'PROBE_CALLS='.length).trim())};
}
it('checks effective model configuration without making a provider request',async()=>{
  const {report,calls,code}=await probe({live:false});expect(code).toBe(0);expect(calls).toBe(0);
  expect(report).toMatchObject({ok:true,mode:'configuration',models:{extraction:{provider:'openai',model:'gpt-4.1-mini'}}});
});
it('detects absent model settings without a provider call',async()=>{
  const {report,calls,code}=await probe({settings:{AI_MODEL_EXTRACTION:'',OPENAI_MODEL:''}});
  expect(code).toBe(1);expect(calls).toBe(0);expect(report.missing).toContain('AI_MODEL_EXTRACTION or provider model');
});
it('sends a strict schema through the real SDK and validates its response in one request',async()=>{
  const {report,calls,code}=await probe();expect(code).toBe(0);expect(calls).toBe(1);expect(report).toMatchObject({ok:true,verified:true,costType:'free'});
});
it('reports field-level validation failures without raw provider output',async()=>{
  const {report,calls,code}=await probe({content:JSON.stringify({...facts,gradeMin:'private-value-sentinel'})});
  expect(code).toBe(1);expect(calls).toBe(1);expect(report.failure).toMatchObject({stage:'extract',code:'invalid_schema',issues:[{field:'gradeMin',code:'invalid_type'}]});
  expect(JSON.stringify(report)).not.toContain('private-value-sentinel');
});
it('does not replay a paid request or fall back to loose JSON when the schema is unsupported',async()=>{
  const {report,calls,code,stdout,stderr}=await probe({status:400});
  expect(code).toBe(1);expect(calls).toBe(1);expect(report.failure).toMatchObject({code:'provider_request',httpStatus:400});
  expect(stdout+stderr).not.toContain('private-provider-sentinel');expect(stdout+stderr).not.toContain('fake-test-key');
});
it('identifies truncated output independently of schema failures',async()=>{
  const {report,calls,code}=await probe({finish:'length'});expect(code).toBe(1);expect(calls).toBe(1);
  expect(report.failure).toMatchObject({code:'incomplete_response',finishReason:'length'});
});
it('identifies model refusals without exposing refusal text',async()=>{
  const {report,calls,code,stdout}=await probe({refusal:'private-refusal-sentinel',content:''});
  expect(code).toBe(1);expect(calls).toBe(1);expect(report.failure).toMatchObject({code:'refused_response'});expect(stdout).not.toContain('private-refusal-sentinel');
});
it('identifies unreadable JSON without exposing its content',async()=>{
  const {report,calls,code,stdout}=await probe({content:'private-output-sentinel'});
  expect(code).toBe(1);expect(calls).toBe(1);expect(report.failure).toMatchObject({code:'invalid_json'});expect(stdout).not.toContain('private-output-sentinel');
});
it.each([['timeout','timeout'],['connection','provider_connection']])('classifies the real SDK %s exception without mistaking it for invalid JSON',async(transport,failure)=>{
  const {report,calls,code,stdout,stderr}=await probe({transport});
  expect(code).toBe(1);expect(calls).toBe(1);expect(report.failure).toMatchObject({code:failure});
  expect(stdout+stderr).not.toContain('private-network-sentinel');
});
it('fails the live check if the model returned valid JSON without supported official facts',async()=>{
  const {report,calls,code}=await probe({content:JSON.stringify({...facts,evidence:{}})});
  expect(code).toBe(1);expect(calls).toBe(1);expect(report.failure).toMatchObject({stage:'verify',code:'missing_evidence'});
});
it('redacts a credential accidentally put in the model setting and refuses the diagnostic call',async()=>{
  const {report,calls,code,stdout}=await probe({settings:{AI_MODEL_EXTRACTION:'sk-private-model-sentinel'}});
  expect(code).toBe(1);expect(calls).toBe(0);expect(report.missing).toContain('valid AI model ID');expect(stdout).not.toContain('sk-private-model-sentinel');
});
