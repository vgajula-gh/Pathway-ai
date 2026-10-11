// OpenAI adapter (Chat Completions with function calling). Docs: https://platform.openai.com/docs
import OpenAI from 'openai';
import { LLM, RunToolsOptions, ImageInput, parseJSON } from './types.js';

export function openaiLLM(apiKey: string, model: string, options: { baseURL?: string; local?: boolean } = {}): LLM {
  if (!model) throw new Error(`Set ${options.local ? 'OLLAMA_MODEL' : 'OPENAI_MODEL'} to a model id`);
  const c = new OpenAI({ apiKey: options.local ? 'ollama' : apiKey, baseURL: options.baseURL,
    ...(options.local ? { defaultHeaders: { Authorization: null }, timeout: 900_000, maxRetries: 0 } : {}) });
  const tokenLimit = (maxTokens: number) => options.local ? { max_tokens: maxTokens } : { max_completion_tokens: maxTokens };
  type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;
  return {
    provider: options.local ? 'ollama' : 'openai',
    async runTools({ system, history, tools, maxRounds, maxTokens = 1200, exec }: RunToolsOptions) {
      const messages: Msg[] = [{ role: 'system', content: system }, ...history.map(h => ({ role: h.role, content: h.content }) as Msg)];
      const fns = tools.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      let reply = '';
      for (let round = 0; round < maxRounds; round++) {
        const res = await c.chat.completions.create({ model, messages, tools: fns, ...tokenLimit(maxTokens) });
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
    async json<T>(system: string, prompt: string, images: ImageInput[] = [], maxTokens = 1500) {
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [...images.map(i => ({ type: 'image_url' as const, image_url: { url: `data:${i.mediaType};base64,${i.base64}` } })), { type: 'text', text: prompt }];
      const request = { model, ...tokenLimit(maxTokens),
        messages: [{ role: 'system' as const, content: system + '\nRespond with a JSON object only.' }, { role: 'user' as const, content }] };
      try {
        const res = await c.chat.completions.create({ ...request, response_format: { type: 'json_object' } });
        return parseJSON<T>(res.choices[0].message.content || '');
      } catch (error) {
        // Only retry local JSON-mode incompatibility or unreadable output, not outages/timeouts.
        const unsupported = error instanceof OpenAI.APIError && [400, 422].includes(error.status || 0);
        if (!options.local || (!unsupported && (error as Error).message !== 'unreadable' && !(error instanceof SyntaxError))) throw error;
        const res = await c.chat.completions.create(request);
        return parseJSON<T>(res.choices[0].message.content || '');
      }
    },
    async text(system: string, prompt: string, maxTokens = 900) {
      const res = await c.chat.completions.create({ model, ...tokenLimit(maxTokens), messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] });
      return res.choices[0].message.content || '';
    }
  };
}
