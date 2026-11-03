import {expect,it} from 'vitest';
import {searchDiagnostics} from '../src/discovery/diagnostics.js';
import {primaryFailure} from '../src/discovery/failures.js';
import {failureInfo} from '../src/discovery/failures.js';

it('drops arbitrary provider values while keeping controlled request parameters and operations',()=>{
 const failure=failureInfo({status:400,code:'sk-private-sentinel',param:'https://private.example/token'},'search');
 const {diagnostics}=searchDiagnostics([{id:'safe',usage:JSON.stringify({failures:[{...failure,operation:'research',providerCode:'sk-private-sentinel',providerParam:'private-param'}]})}]);
 expect(diagnostics.failures).toEqual([{stage:'search',code:'provider_request',httpStatus:400,operation:'research',count:1}]);expect(JSON.stringify(diagnostics)).not.toContain('private');
});

it('summarizes historical workflow records without requiring new provider calls or invented candidate counts',()=>{
 const run={id:'old',usage:JSON.stringify({searches:2,pages:7,savedIds:[],workflow:[{node:'search_candidates',status:'completed'},{node:'fetch_official_pages',status:'failed'},{node:'fetch_official_pages',status:'completed'},{node:'extract_facts',status:'failed'}],failures:[{stage:'fetch',code:'unsupported_content'},{stage:'extract',code:'invalid_schema',issues:[{field:'gradeMin',code:'invalid_type'}]}]})};
 const {diagnostics,failures}=searchDiagnostics([run,run]);
 expect(diagnostics).toMatchObject({runs:1,searchAttempts:2,httpAttempts:7,candidates:null,programsSaved:0,steps:{search:{completed:1,failed:0},fetch:{completed:1,failed:1},extract:{completed:0,failed:1}}});
 expect(diagnostics.failures).toHaveLength(2);expect(primaryFailure(failures)?.code).toBe('invalid_schema');expect(diagnostics.models).toEqual([]);
});
it('shows saved IDs and filtered candidates during a run without exposing raw source information',()=>{
 const {diagnostics}=searchDiagnostics([{id:'live',usage:JSON.stringify({candidates:{found:12,filtered:3,queued:9},savedIds:['one','one','two'],models:{search:{provider:'openai',model:'gpt-4.1-mini'},extraction:{provider:'openai',model:'gpt-5-nano'}},failures:[{stage:'fetch',code:'unsupported_content',mediaType:'application/pdf',sourceHost:'private-source-sentinel',sourceUrl:'https://example.edu/private-source-sentinel'}]})}]);
 expect(diagnostics).toMatchObject({programsSaved:2,candidates:{found:12,filtered:3,queued:9},failures:[{stage:'fetch',code:'unsupported_content',mediaType:'application/pdf',count:1}]});
 expect(diagnostics.models).toHaveLength(1);expect(JSON.stringify(diagnostics)).not.toContain('private-source-sentinel');
});
it('only forwards controlled details from malformed or untrusted stored diagnostic fields',()=>{
 const result=searchDiagnostics([{id:'bad',usage:'not json'},{id:'malformed',usage:JSON.stringify({models:{search:{provider:'openai',model:'sk-private-key-sentinel'},extraction:{provider:'private-provider-sentinel',model:'anything'}},workflow:[{node:{toString:123},status:'failed'}],failures:[{stage:'extract',code:'invalid_schema',issues:[{field:'private-field-sentinel',code:'invalid_type'},{field:'gradeMin',code:'private-code-sentinel'},{field:'gradeMax',code:'invalid_type'}],message:'private-message-sentinel'},{stage:'private-stage-sentinel',code:'invalid_schema'},{stage:'fetch',code:'private-code-sentinel'}]})}]);
 const value=JSON.stringify(result.diagnostics);expect(value).not.toContain('private-');expect(result.diagnostics.failures).toEqual([{stage:'extract',code:'invalid_schema',issues:[{field:'gradeMax',code:'invalid_type'}],count:1}]);
 expect(result.diagnostics.models).toEqual([{search:{provider:'openai',model:null}}]);
});
it('preserves every failure count while prioritizing configuration and later processing failures over an early document',()=>{
 const failures=[{stage:'fetch',code:'unsupported_content'},{stage:'extract',code:'incomplete_response'},{stage:'search',code:'provider_authorization'}] as const;
 const {diagnostics}=searchDiagnostics([{id:'one',usage:JSON.stringify({failures:[...failures,...failures]})}]);
 expect(diagnostics.failures.map(f=>f.count)).toEqual([2,2,2]);expect(primaryFailure([...failures])?.code).toBe('provider_authorization');expect(primaryFailure(failures.slice(0,2))?.code).toBe('incomplete_response');
});
it('does not hide a decompression or HTTP failure behind a filtered document',()=>{
 expect(primaryFailure([{stage:'fetch',code:'unsupported_content'},{stage:'fetch',code:'content_decoding_failed',contentEncoding:'gzip'}])?.code).toBe('content_decoding_failed');
});
it('retains only controlled verification fields and reasons, with no arbitrary stored values',()=>{
 const failure={stage:'verify',code:'missing_evidence',verification:[{field:'gradeMin',reason:'quote_not_found',quote:'private-quote'},{field:'officialDomain',reason:'unreviewed_domain',sourceUrl:'https://private-source.example'},{field:'private-field',reason:'not_stated'},{field:'format',reason:'private-reason'}]};
 const {diagnostics}=searchDiagnostics([{id:'one',usage:JSON.stringify({failures:[failure,failure]})}]);
 expect(diagnostics.failures).toEqual([{stage:'verify',code:'missing_evidence',verification:[{field:'gradeMin',reason:'quote_not_found'},{field:'officialDomain',reason:'unreviewed_domain'}],count:2}]);
 expect(JSON.stringify(diagnostics)).not.toContain('private-');
});
it('explains verification rejections instead of an incidental reading or processing limit',()=>{
 const failures=[{stage:'verify',code:'missing_evidence'},{stage:'verify',code:'deadline_passed'},{stage:'fetch',code:'timeout'},{stage:'fetch',code:'unsupported_content'},{stage:'extract',code:'run_limit'}] as const;
 expect(primaryFailure([...failures])?.code).toBe('missing_evidence');
 expect(primaryFailure([...failures,{stage:'search',code:'provider_authorization'}])?.code).toBe('provider_authorization');
 expect(primaryFailure([{stage:'extract',code:'run_limit'}])?.code).toBe('run_limit');
});

it('reports observed web tools, tokens, confirmation counts and estimates without inventing old usage',()=>{
 const run={id:'new',usage:JSON.stringify({calls:[{kind:'research',usage:{inputTokens:120,outputTokens:40,webSearches:3}},{kind:'repair',usage:{inputTokens:20,outputTokens:10}}],estimatedCost:0.08,candidateOutcomes:{verified:2,needs_verification:4}})};
 expect(searchDiagnostics([run]).diagnostics).toMatchObject({webSearches:3,inputTokens:140,outputTokens:50,estimatedCostUsd:0.08,verifiedCandidates:2});
 expect(searchDiagnostics([{id:'old',usage:'{}'}]).diagnostics).toMatchObject({webSearches:null,inputTokens:null,estimatedCostUsd:null,verifiedCandidates:null});
});
