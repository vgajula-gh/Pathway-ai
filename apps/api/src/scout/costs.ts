import type {LLMUsage} from '../agent/llm/types.js';
import {scoutSettings} from './settings.js';
export const usdSetting=(name:string,fallback:number)=>{
  const raw=process.env[name],value=raw&&/^\d+(?:\.\d{1,6})?$/.test(raw)?Number(raw):NaN;
  return Number.isFinite(value)&&value>=0&&value<=100000?value:fallback;
};
/** Owner-configured estimates, not provider invoices or a hard billing ceiling. */
export const scoutPricing=()=>({web:usdSetting('SCOUT_WEB_SEARCH_PRICE_USD',0.025),input:usdSetting('SCOUT_INPUT_PRICE_PER_MILLION',4),output:usdSetting('SCOUT_OUTPUT_PRICE_PER_MILLION',16),monthly:usdSetting('DISCOVERY_MONTHLY_SPEND_USD',25)});
export function estimatedCallCost(usage:LLMUsage,kind:'research'|'extract'|'repair') {
  const p=scoutPricing(),s=scoutSettings();
  const input=usage.inputTokens??(kind==='research'?60000:6000),output=usage.outputTokens??(kind==='research'?s.outputTokens:4096);
  return (kind==='research'?(usage.webSearches??s.webToolCalls)*p.web:0)+(input*p.input+output*p.output)/1e6;
}
export function discoveryReservationUsd() {
  const s=scoutSettings(),unknown:LLMUsage={provider:'openai',model:'estimate',inputTokens:null,outputTokens:null,responseId:null};
  return estimatedCallCost(unknown,'research')+estimatedCallCost(unknown,'repair')+
    (s.sourceMode==='fetch_and_extract'?Math.min(16,s.freeCandidates+s.paidCandidates)*estimatedCallCost(unknown,'extract'):0);
}
