import { openaiLLM } from './openai.js';

/** Ollama exposes an OpenAI-compatible API; no credential or auth header is sent. */
export function ollamaLLM(baseURL: string, model: string) {
  return openaiLLM('', model, { baseURL, local: true });
}
