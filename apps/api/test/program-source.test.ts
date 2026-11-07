import {expect,it,vi} from 'vitest';
import {programSourceURL} from '../src/domain/program-source.js';
import {researchOutput,citedLeads} from '../src/scout/providers.js';
import {research} from '../src/scout/research.js';
import {activeOpportunity} from '../src/domain/opportunity-active.js';
const maps='https://www.google.com/maps/search/Example+Program?utm_source=openai';
const context={today:'2030-01-01',gradeBand:'9-10',interests:['coding'],focusInterests:['coding'],region:'US',buckets:['free','paid'] as ('free'|'paid')[]};
const usage={provider:'openai' as const,model:'fixture',inputTokens:1,outputTokens:1,responseId:null};

it('distinguishes direct program pages from maps/search listings without excluding Google program websites or PDFs',()=>{
  for(const url of [maps,'https://maps.google.com/?q=camp','https://www.google.com/search?q=robotics','https://www.bing.com/maps?q=camp','https://duckduckgo.com/?q=camp','https://maps.apple.com/?q=camp'])expect(programSourceURL(url)).toBeNull();
  for(const url of ['https://example.edu/program','https://summerofcode.withgoogle.com/','https://example.edu/program.pdf'])expect(programSourceURL(url)?.href).toBe(url);
  expect(programSourceURL('https://www.google.com/url?q=https%3A%2F%2Fexample.edu%2Fprogram')?.href).toBe('https://example.edu/program');
  expect(programSourceURL('https://www.google.com/url?q=http%3A%2F%2F127.0.0.1%2F')).toBeNull();
});
it('retains actual direct citations when structured leads contain maps URLs, without another paid request',async()=>{
  const provider={research:vi.fn(async()=>({text:JSON.stringify({candidates:[{name:'Example',officialUrl:maps}]}),citations:['https://example.edu/program'],sources:[],usage}))};
  const result=await research(provider,context,6,true,async()=>{});
  expect(result.output.candidates.map(c=>c.officialUrl)).toEqual(['https://example.edu/program']);expect(result.repaired).toBe(false);expect(provider.research).toHaveBeenCalledOnce();
});
it('keeps valid siblings and reports a meaningful no-source outcome when the provider only supplied listings',async()=>{
  const output=researchOutput(JSON.stringify({candidates:[{name:'Map',officialUrl:maps},{name:'Program',officialUrl:'https://example.edu/program'}]}));
  expect(output.candidates.map(c=>c.name)).toEqual(['Program']);
  const provider={research:vi.fn(async()=>({text:JSON.stringify([{name:'Map',officialUrl:maps}]),citations:[maps],usage}))};
  await expect(research(provider,context,6,true,async()=>{})).rejects.toMatchObject({info:{code:'no_program_sources'}});
  expect(provider.research).toHaveBeenCalledOnce();
  expect(citedLeads({text:'',citations:[maps,'https://example.edu/program'],usage},2).candidates).toHaveLength(1);
});
it('keeps existing listing records out of actionable coverage without hiding unknown details on valid program URLs',()=>{
  const base={category:'Program',name:'Example',deadline:null,verificationStatus:'needs_verification'};
  expect(activeOpportunity({...base,url:maps},'2030-01-01')).toBe(false);
  expect(activeOpportunity({...base,url:'https://example.edu/program',applicationStatus:'unknown'},'2030-01-01')).toBe(true);
});
