import {AIOutputError} from '../agent/llm/output-error.js';
import type {SourceType} from './source-urls.js';
import {OpportunityEvidenceError,type VerificationIssue} from '../domain/opportunity-evidence.js';
export type FailureStage = 'search' | 'robots' | 'fetch' | 'extract' | 'verify' | 'store' | 'index';
const messages = {
  interrupted:'This research step was interrupted. Completed results were kept; paid work was not repeated.',
  robots_blocked: 'The official website does not allow automated reading of this page.',
  robots_unavailable: 'The official website’s crawling rules could not be checked.',
  http_error: 'The official website returned an unsuccessful response.',
  redirect_requires_review: 'The official page redirects to a different website that needs review.',
  redirect_limit: 'The official website redirected too many times.',
  private_address: 'Private network pages are not supported.',
  invalid_url: 'This source is not a supported public HTTPS page.',
  dns_failed: 'The official website’s address could not be resolved.',
  connection_failed: 'The official website could not be reached.',
  timeout: 'The official website or AI service took too long to respond.',
  page_too_large: 'The official page exceeds the reading limit.',
  unsupported_content: 'The official source is not a readable web page.',
  content_decoding_failed:'The official page could not be decoded. Other sources may still work.',
  insufficient_text: 'The official page has too little readable text to check its details.',
  missing_evidence: 'Programs were found, but their official pages did not confirm the details needed to recommend them.',
  identity_mismatch: 'The fetched page could not be confirmed as the same program.',
  deadline_passed: 'The official program deadline has passed.',
  invalid_response: 'The AI response could not be used to verify program details.',
  missing_model:'The website owner needs to configure the program-reading AI model.',
  incomplete_response:'The AI could not finish reading the program details. Please try again.',
  refused_response:'The AI service could not read these program details. Other programs may still work.',
  invalid_json:'The AI returned unreadable program details. Please try again.',
  invalid_schema:'The AI returned program details in an unexpected format. Please try again.',
  extraction_error:'The program-reading service encountered an error. The website owner can check its diagnostics.',
  provider_authorization: 'The website owner needs to check the AI service credentials or permissions.',
  provider_limit: 'The AI service has reached its current allowance or request limit.',
  provider_request: 'The AI service could not accept the configured search or model request.',
  provider_connection:'The AI service could not be reached. Please try again later.',
  run_limit: 'This search reached its processing limit.',
  storage_unavailable: 'The program details could not be saved right now.',
  index_unavailable: 'Program details were saved, but program questions could not be prepared.',
  service_unavailable: 'The program search service is temporarily unavailable.',
};
export type FailureInfo = { stage: FailureStage; code: keyof typeof messages; sourceHost?: string; httpStatus?: number;
  operation?:'research'|'repair'|'extract';providerCode?:string;providerParam?:string;
  verification?:VerificationIssue[];
  issues?:{field:string;code:string}[];finishReason?:'length'|'content_filter'|'empty'|'refusal';errorType?:'TypeError'|'ReferenceError'|'Error';location?:string;
  mediaType?:SourceType;contentEncoding?:'gzip'|'br'|'deflate'|'identity'|'other' };
export class DiscoveryFailure extends Error {
  constructor(public info: FailureInfo) { super(messages[info.code]); this.name = 'DiscoveryFailure'; }
}
export const failureMessage = (failure: FailureInfo) => Object.hasOwn(messages, failure.code) ? messages[failure.code] : messages.service_unavailable;
export const operationalFailure=(f:FailureInfo)=>!['deadline_passed','missing_evidence'].includes(f.code);
export const knownFailureCode=(code:unknown):code is FailureInfo['code']=>typeof code==='string'&&Object.hasOwn(messages,code);
const providerCodes=new Set(['invalid_request_error','invalid_json_schema','unsupported_parameter','unsupported_value','model_not_found','context_length_exceeded','invalid_value','invalid_parameter','missing_required_parameter','unknown_parameter']);
const parameterParts=new Set(['model','tools','type','tool_choice','max_tool_calls','max_output_tokens','max_completion_tokens','max_tokens','search_context_size','text','format','response_format','json_schema','schema','properties','required','additionalProperties','items','name','strict','reasoning','effort','input','messages','temperature','top_p']);
export function safeProviderDetails(value:{providerCode?:unknown;providerParam?:unknown}) {
  const code=typeof value.providerCode==='string'&&providerCodes.has(value.providerCode)?value.providerCode:undefined;
  const param=typeof value.providerParam==='string'&&value.providerParam.length<=180&&value.providerParam.split(/[.\[\]]/).filter(Boolean).every(p=>parameterParts.has(p)||/^\d{1,3}$/.test(p))?value.providerParam:undefined;
  return {...(code?{providerCode:code}:{}),...(param?{providerParam:param}:{})};
}
export function primaryFailure(failures:FailureInfo[]) {
  const relevant=failures.filter(operationalFailure),verification=failures.filter(f=>f.stage==='verify');
  const pool=verification.length?[...relevant,...verification]:relevant.length?relevant:failures;
  const rank=(f:FailureInfo)=>['missing_model','provider_authorization','provider_request','provider_limit'].includes(f.code)?100:
    (f.code==='run_limit'||f.code==='timeout'&&verification.length>=2)&&verification.length?15:
    ['unsupported_content','invalid_url'].includes(f.code)?5:
    ({search:70,robots:10,fetch:20,extract:80,verify:40,store:90,index:90}[f.stage]);
  return pool.reduce<FailureInfo|undefined>((best,f)=>!best||rank(f)>rank(best)?f:best,undefined);
}

/** Allowlisted metadata only: no raw provider errors, response bodies, URLs or prompts. */
export function failureInfo(error: unknown, stage: FailureStage): FailureInfo {
  if (error instanceof DiscoveryFailure) return error.info;
  if(error instanceof OpportunityEvidenceError)return {stage,code:error.verification.some(i=>i.reason==='past_deadline')?'deadline_passed':'missing_evidence',verification:error.verification};
  if(error instanceof AIOutputError)return {stage,code:error.code,...(error.finishReason?{finishReason:error.finishReason}:{})};
  const e = error as { status?: unknown; name?: unknown; code?: unknown;param?:unknown;error?:{code?:unknown;param?:unknown}; message?: unknown;stack?:unknown } | null;
  // OpenAI SDK subclasses inherit Error.name === "Error"; constructor identity is distinct.
  const type=error instanceof Error?error.constructor.name:String(e?.name||'');
  const status = typeof e?.status === 'number' && Number.isInteger(e.status) ? e.status : undefined;
  let code: FailureInfo['code'] = 'service_unavailable';
  if (status === 401 || status === 403) code = 'provider_authorization';
  else if (status === 429) code = 'provider_limit';
  else if (status === 400 || status === 404 || status === 422) code = 'provider_request';
  else if (e?.name === 'ZodError' || e?.name === 'SyntaxError' || e?.message === 'unreadable') code = 'invalid_response';
  else if (['TimeoutError', 'APIConnectionTimeoutError', 'AbortError'].includes(type)||['TimeoutError','AbortError'].includes(String(e?.name))) code = 'timeout';
  else if(type==='APIConnectionError')code='provider_connection';
  else if (typeof e?.message === 'string' && /^(Run time limit reached|Run limit reached)$/.test(e.message)) code = 'run_limit';
  else if (e?.message === 'Program deadline has passed') code = 'deadline_passed';
  else if (e?.message === 'The fetched page describes a different program') code = 'identity_mismatch';
  else if (stage === 'verify') code = 'missing_evidence';
  else if (stage === 'extract') code = 'extraction_error';
  else if (stage === 'store') code = 'storage_unavailable';
  else if (stage === 'index') code = 'index_unavailable';
  const location=code==='extraction_error'&&typeof e?.stack==='string'
    ?e.stack.match(/apps\/api\/(?:src|dist)\/((?:agent\/llm\/(?:openai|anthropic|ollama|extraction|types)|discovery\/extraction)\.(?:ts|js)):(\d+):\d+/):null;
  return { stage, code, ...(status && status >= 400 && status <= 599 ? { httpStatus: status } : {}),
    ...safeProviderDetails({providerCode:e?.code||e?.error?.code,providerParam:e?.param||e?.error?.param}),
    ...(code==='extraction_error'?{errorType:e?.name==='TypeError'?'TypeError':e?.name==='ReferenceError'?'ReferenceError':'Error',...(location?{location:location[1]+':'+location[2]}:{})}:{}) };
}
