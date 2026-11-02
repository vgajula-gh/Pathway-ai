export type FailureStage = 'search' | 'robots' | 'fetch' | 'extract' | 'verify' | 'store' | 'index';
const messages = {
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
  insufficient_text: 'The official page has too little readable text to check its details.',
  missing_evidence: 'The official page did not support the required program details.',
  identity_mismatch: 'The fetched page could not be confirmed as the same program.',
  deadline_passed: 'The official program deadline has passed.',
  invalid_response: 'The AI response could not be used to verify program details.',
  provider_authorization: 'The website owner needs to check the AI service credentials or permissions.',
  provider_limit: 'The AI service has reached its current allowance or request limit.',
  provider_request: 'The AI service could not accept the configured search or model request.',
  run_limit: 'This search reached its processing limit.',
  storage_unavailable: 'The program details could not be saved right now.',
  index_unavailable: 'Program details were saved, but program questions could not be prepared.',
  service_unavailable: 'The program search service is temporarily unavailable.',
};
export type FailureInfo = { stage: FailureStage; code: keyof typeof messages; sourceHost?: string; httpStatus?: number };
export class DiscoveryFailure extends Error {
  constructor(public info: FailureInfo) { super(messages[info.code]); this.name = 'DiscoveryFailure'; }
}
export const failureMessage = (failure: FailureInfo) => Object.hasOwn(messages, failure.code) ? messages[failure.code] : messages.service_unavailable;

/** Allowlisted metadata only: no raw provider errors, response bodies, URLs or prompts. */
export function failureInfo(error: unknown, stage: FailureStage): FailureInfo {
  if (error instanceof DiscoveryFailure) return error.info;
  const e = error as { status?: unknown; name?: unknown; code?: unknown; message?: unknown } | null;
  const status = typeof e?.status === 'number' && Number.isInteger(e.status) ? e.status : undefined;
  let code: FailureInfo['code'] = 'service_unavailable';
  if (status === 401 || status === 403) code = 'provider_authorization';
  else if (status === 429) code = 'provider_limit';
  else if (status === 400 || status === 404 || status === 422) code = 'provider_request';
  else if (e?.name === 'ZodError' || e?.name === 'SyntaxError' || e?.message === 'unreadable') code = 'invalid_response';
  else if (['TimeoutError', 'APIConnectionTimeoutError', 'AbortError'].includes(String(e?.name))) code = 'timeout';
  else if (typeof e?.message === 'string' && /^(Run time limit reached|Run limit reached)$/.test(e.message)) code = 'run_limit';
  else if (e?.message === 'Program deadline has passed') code = 'deadline_passed';
  else if (e?.message === 'The fetched page describes a different program') code = 'identity_mismatch';
  else if (stage === 'verify') code = 'missing_evidence';
  else if (stage === 'extract') code = 'invalid_response';
  else if (stage === 'store') code = 'storage_unavailable';
  else if (stage === 'index') code = 'index_unavailable';
  return { stage, code, ...(status && status >= 400 && status <= 599 ? { httpStatus: status } : {}) };
}
