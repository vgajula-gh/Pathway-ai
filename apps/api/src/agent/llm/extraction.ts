import { env } from '../../lib/env.js';
import { openaiLLM } from './openai.js';
import { anthropicLLM } from './anthropic.js';
import { ollamaLLM } from './ollama.js';
import { LLM } from './types.js';
import {AIOutputError} from './output-error.js';
export function extractionSettings(){
  const fallback=env.provider==='openai'?env.openaiModel:env.provider==='ollama'?env.ollamaModel:env.anthropicModel;
  return {provider:env.provider,model:(process.env.AI_MODEL_EXTRACTION?.trim()||fallback).trim()};
}
export function extractionLLM(options:{timeoutMs?:number}={}):LLM{
  const {model}=extractionSettings();
  if(!model)throw new AIOutputError('missing_model');
  const timeout=Math.max(1,Math.min(90000,options.timeoutMs??90000));
  return env.provider==='openai'?openaiLLM(env.openaiKey,model,{maxRetries:0,timeout}):env.provider==='ollama'?ollamaLLM(env.ollamaBaseURL,model,options.timeoutMs===undefined?undefined:timeout):anthropicLLM(env.anthropicKey,model,{maxRetries:0,timeout});
}
