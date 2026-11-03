import {setting} from '../discovery/config.js';
export const scoutSettings=()=>({
  sourceMode:process.env.SCOUT_SOURCE_MODE==='fetch_and_extract'?'fetch_and_extract':'research_evidence',
  researchCalls:setting('SCOUT_MAX_CALLS_PER_SEARCH',3,3),
  webToolCalls:Math.max(1,setting('SCOUT_MAX_TOOL_CALLS',5,10)),
  researchTimeoutMs:Math.max(1000,setting('SCOUT_RESEARCH_TIMEOUT_SECONDS',150,150)*1000),
  freeCandidates:setting('SCOUT_FREE_CANDIDATES',8,16),
  paidCandidates:setting('SCOUT_PAID_CANDIDATES',8,16),
  cacheDays:setting('SCOUT_CACHE_DAYS',30,30)||30,
  // Bounded HTTP worker stages, not a long task after sending a response.
  timeoutMs:Math.min(60000,Math.max(1000,setting('SCOUT_TIMEOUT_SECONDS',60,150)*1000)),
  outputTokens:Math.max(1000,setting('SCOUT_MAX_OUTPUT_TOKENS',6000,8000)),
  httpAttempts:setting('SCOUT_MAX_HTTP_ATTEMPTS',40,80),
});
