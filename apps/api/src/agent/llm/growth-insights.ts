import {env} from '../../lib/env.js';
import {openaiLLM} from './openai.js';
import {anthropicLLM} from './anthropic.js';
import {ollamaLLM} from './ollama.js';
import type {LLM} from './types.js';
/** Bounded task request; paid-provider SDK retries disabled. All providers retain the shared interface. */
export function growthInsightLLM():LLM|null {
  if(env.aiDisabled)return null;
  const model=process.env.AI_MODEL_INSIGHTS?.trim()||(env.provider==='openai'?'gpt-4.1-mini':env.provider==='ollama'?env.ollamaModel:env.anthropicModel);
  return env.provider==='openai'?openaiLLM(env.openaiKey,model,{maxRetries:0,timeout:25000}):env.provider==='ollama'?ollamaLLM(env.ollamaBaseURL,model,25000):anthropicLLM(env.anthropicKey,model,{maxRetries:0,timeout:25000});
}
