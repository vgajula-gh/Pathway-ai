import { env } from '../../lib/env.js';
import { openaiLLM } from './openai.js';
import { anthropicLLM } from './anthropic.js';
import { ollamaLLM } from './ollama.js';
import { LLM } from './types.js';
export function extractionLLM():LLM{const model=process.env.AI_MODEL_EXTRACTION;return env.provider==='openai'?openaiLLM(env.openaiKey,model||env.openaiModel,{maxRetries:0,timeout:30000}):env.provider==='ollama'?ollamaLLM(env.ollamaBaseURL,model||env.ollamaModel):anthropicLLM(env.anthropicKey,model||env.anthropicModel,{maxRetries:0,timeout:30000});}
