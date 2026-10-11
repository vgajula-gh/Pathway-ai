import { env } from '../../lib/env.js';
import { HttpError } from '../../lib/auth.js';
import { LLM } from './types.js';
import { anthropicLLM } from './anthropic.js';
import { ollamaLLM } from './ollama.js';
import { openaiLLM } from './openai.js';
export * from './types.js';

let cached: LLM | null | undefined;
/** The configured provider, or null when AI is disabled. */
export function getLLM(): LLM | null {
  if (cached !== undefined) return cached;
  cached = env.aiDisabled ? null : env.provider === 'ollama' ? ollamaLLM(env.ollamaBaseURL, env.ollamaModel) : env.provider === 'openai' ? openaiLLM(env.openaiKey, env.openaiModel) : anthropicLLM(env.anthropicKey, env.anthropicModel);
  return cached;
}
export function requireLLM(): LLM { const l = getLLM(); if (!l) throw new HttpError(503, 'AI is not configured on this server'); return l; }
export async function askJSON<T>(system: string, prompt: string, images: import('./types.js').ImageInput[] = [], maxTokens = 1500): Promise<T> {
  try { return await requireLLM().json<T>(system, prompt, images, maxTokens); }
  catch (e) { if (e instanceof HttpError) throw e; if ((e as Error).message === 'unreadable') throw new HttpError(502, 'The AI returned an unreadable answer. Please try again.'); throw e; }
}
