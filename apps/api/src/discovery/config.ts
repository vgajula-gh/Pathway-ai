import type {WorkflowStep} from '../workflows/privacy.js';
import { env } from '../lib/env.js';
import type { FailureInfo } from './failures.js';
import {extractionSettings} from '../agent/llm/extraction.js';
export const safeModelId=(value:string|undefined)=>value&&value.length<=160&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(value)&&!/^(sk-|rk-|sess-|https?:|postgres)/i.test(value)?value:null;
export function discoveryModels(){
  const extraction=extractionSettings(),provider=process.env.SEARCH_PROVIDER;
  const searchProvider=provider==='openai'||provider==='anthropic'?provider:'none';
  const searchModel=process.env.AI_MODEL_SCOUT||process.env.SEARCH_MODEL||(searchProvider==='openai'?'gpt-4.1-mini':searchProvider==='anthropic'?process.env.ANTHROPIC_MODEL||'claude-sonnet-5-5':undefined);
  return {search:{provider:searchProvider,model:safeModelId(searchModel)},extraction:{provider:extraction.provider,model:safeModelId(extraction.model)}};
}
export function setting(name: string, fallback: number, max = 1000) {
  const v = process.env[name];
  return v && /^\d+$/.test(v) && Number(v) <= max ? Number(v) : fallback;
}
export const CAPS = {
  searches: 2,
  pages: 20,
  candidates: 10,
  embeddingCalls: 4,
  vectorUpserts: 100,
  extractionCalls: 5,
  pageChars: 18000,
};
export type Usage = {
  runs: number;
  searches: number;
  pages: number;
  embeddings: number;
  vectorUpserts: number;
  tokens: number;
  estimatedCost: number;
};
export class RunBudget {
  candidates={found:0,filtered:0,queued:0};
  readonly models=discoveryModels();
  readonly workflow: WorkflowStep[] = [];
  readonly failures: FailureInfo[] = [];
  readonly robots = new Map<string, Promise<{ url: string; body: string; status: number }>>();
  savedIds: string[] = [];
  phase = 'searching';
  onStep?: () => Promise<void>;
  usage: Usage = {
    runs: 1,
    searches: 0,
    pages: 0,
    embeddings: 0,
    vectorUpserts: 0,
    tokens: 0,
    estimatedCost: 0,
  };
  deadlineAt = Date.now() + 90000;
  check() {
    if (Date.now() > this.deadlineAt) throw new Error('Run time limit reached');
  }
  extractionCalls = 0;
  take(kind: 'searches' | 'pages' | 'embeddings' | 'vectorUpserts', count = 1) {
    this.check();
    const max = kind === 'embeddings' ? CAPS.embeddingCalls : CAPS[kind];
    if (this.usage[kind] + count > max) throw new Error('Run limit reached');
    this.usage[kind] += count;
  }
}
export function searchConfigured() {
  return process.env.SEARCH_PROVIDER === 'openai'
    ? !!process.env.OPENAI_API_KEY
    : process.env.SEARCH_PROVIDER === 'anthropic'
      ? !!process.env.ANTHROPIC_API_KEY
      : false;
}
export function discoveryConfigured() {
  return (
    process.env.DISCOVERY_ENABLED === 'true' &&
    process.env.AI_DISABLED !== 'true' &&
    !env.aiDisabled &&
    (process.env.SCOUT_SOURCE_MODE!=='fetch_and_extract'||!!extractionSettings().model) &&
    searchConfigured()
  );
}
