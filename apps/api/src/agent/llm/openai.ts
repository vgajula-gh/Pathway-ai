// OpenAI adapter (Chat Completions with function calling). Docs: https://platform.openai.com/docs
import OpenAI from 'openai';
import { LLM, RunToolsOptions, ImageInput, parseJSON, JSONSchema, LLMUsage } from './types.js';
import {AIOutputError} from './output-error.js';

export function openaiLLM(apiKey: string, model: string, options: { baseURL?: string; local?: boolean; maxRetries?: number; timeout?: number } = {}): LLM {
  if (!model) throw new Error(`Set ${options.local ? 'OLLAMA_MODEL' : 'OPENAI_MODEL'} to a model id`);
  const c = new OpenAI({ apiKey: options.local ? 'ollama' : apiKey, baseURL: options.baseURL, ...(options.maxRetries!==undefined?{maxRetries:options.maxRetries}:{}), ...(options.timeout!==undefined?{timeout:options.timeout}:{}),
    ...(options.local ? { defaultHeaders: { Authorization: null }, timeout: 900_000, maxRetries: 0 } : {}) });
  // Original GPT-5 nano spends completion tokens on reasoning as well as text.
  // Give it explicit headroom and low effort instead of the provider default.
  const nano = !options.local && /^gpt-5-nano(?:$|-)/.test(model);
  const tokenLimit = (maxTokens: number) => options.local ? { max_tokens: maxTokens }
    : nano ? { max_completion_tokens: maxTokens + 4096, reasoning_effort: 'low' as const }
    : { max_completion_tokens: maxTokens };
  let lastUsage:LLMUsage|null=null;
  async function complete(request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming) {
    const res = await c.chat.completions.create(request);
    lastUsage={provider:options.local?'ollama':'openai',model,inputTokens:res.usage?.prompt_tokens??null,outputTokens:res.usage?.completion_tokens??null,responseId:res.id||null};
    const choice = res.choices[0];
    if(choice?.message.refusal||choice?.finish_reason==='content_filter')throw new AIOutputError('refused_response',choice?.message.refusal?'refusal':'content_filter');
    // Never execute tools with truncated arguments, silently accept partial JSON,
    // or turn a reasoning-only completion into Buddy's generic fallback.
    if (choice?.finish_reason === 'length' || (!choice?.message.content?.trim() && !choice?.message.tool_calls?.length && !choice?.message.refusal)) {
      console.warn('OpenAI incomplete response', { model, finishReason: choice?.finish_reason, reasoningTokens: res.usage?.completion_tokens_details?.reasoning_tokens });
      throw new AIOutputError('incomplete_response',choice?.finish_reason==='length'?'length':'empty');
    }
    return res;
  }
  type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;
  return {
    get lastUsage(){return lastUsage;},
    provider: options.local ? 'ollama' : 'openai',
    async runTools({ system, history, tools, maxRounds, maxTokens = 1200, exec }: RunToolsOptions) {
      const messages: Msg[] = [{ role: 'system', content: system }, ...history.map(h => ({ role: h.role, content: h.content }) as Msg)];
      const fns = tools.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      let reply = '';
      for (let round = 0; round < maxRounds; round++) {
        const res = await complete({ model, messages, tools: fns, ...tokenLimit(maxTokens) });
        const msg = res.choices[0].message;
        if (msg.content) reply += msg.content;
        if (!msg.tool_calls?.length) break;
        messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
        for (const call of msg.tool_calls) {
          if (call.type !== 'function') continue;
          let input: unknown;
          try {
            input = JSON.parse(call.function.arguments);
            if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an object');
          } catch {
            messages.push({ role: 'tool', tool_call_id: call.id, content: 'Error: Invalid tool-call JSON. Provide arguments as a valid JSON object and try again. No action was performed.' });
            continue;
          }
          const r = await exec(call.function.name, input);
          messages.push({ role: 'tool', tool_call_id: call.id, content: r.isError ? `Error: ${r.content}` : r.content });
        }
      }
      return reply;
    },
    async json<T>(system: string, prompt: string, images: ImageInput[] = [], maxTokens = 1500, schema?:JSONSchema) {
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [...images.map(i => ({ type: 'image_url' as const, image_url: { url: `data:${i.mediaType};base64,${i.base64}` } })), { type: 'text', text: prompt }];
      const request = { model, ...tokenLimit(maxTokens),
        messages: [{ role: 'system' as const, content: system + '\nRespond with a JSON object only.' }, { role: 'user' as const, content }] };
      try {
        const response_format:OpenAI.ResponseFormatJSONSchema|OpenAI.ResponseFormatJSONObject=schema&&!options.local
          ?{type:'json_schema',json_schema:{name:schema.name,strict:true,schema:schema.schema}}:{type:'json_object'};
        const res = await complete({ ...request, response_format });
        return parseJSON<T>(res.choices[0].message.content || '');
      } catch (error) {
        // Only retry local JSON-mode incompatibility or unreadable output, not outages/timeouts.
        const unsupported = error instanceof OpenAI.APIError && [400, 422].includes(error.status || 0);
        const unreadable=(error as Error).message==='unreadable'||error instanceof SyntaxError;
        if(!options.local&&unreadable)throw new AIOutputError('invalid_json');
        if (!options.local || (!unsupported && !unreadable)) throw error;
        const res = await complete(request);
        return parseJSON<T>(res.choices[0].message.content || '');
      }
    },
    async text(system: string, prompt: string, maxTokens = 900) {
      const res = await complete({ model, ...tokenLimit(maxTokens), messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] });
      return res.choices[0].message.content || '';
    }
  };
}
