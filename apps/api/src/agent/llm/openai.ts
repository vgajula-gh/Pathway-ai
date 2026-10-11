// OpenAI adapter (Chat Completions with function calling). Docs: https://platform.openai.com/docs
import OpenAI from 'openai';
import { LLM, RunToolsOptions, ImageInput, parseJSON } from './types.js';

export function openaiLLM(apiKey: string, model: string): LLM {
  if (!model) throw new Error('Set OPENAI_MODEL to a current OpenAI model id');
  const c = new OpenAI({ apiKey });
  type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;
  return {
    provider: 'openai',
    async runTools({ system, history, tools, maxRounds, maxTokens = 1200, exec }: RunToolsOptions) {
      const messages: Msg[] = [{ role: 'system', content: system }, ...history.map(h => ({ role: h.role, content: h.content }) as Msg)];
      const fns = tools.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      let reply = '';
      for (let round = 0; round < maxRounds; round++) {
        const res = await c.chat.completions.create({ model, messages, tools: fns, max_completion_tokens: maxTokens });
        const msg = res.choices[0].message;
        if (msg.content) reply += msg.content;
        if (!msg.tool_calls?.length) break;
        messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
        for (const call of msg.tool_calls) {
          if (call.type !== 'function') continue;
          let input: unknown = {}; try { input = JSON.parse(call.function.arguments || '{}'); } catch { /* invalid JSON → tool reports the error */ }
          const r = await exec(call.function.name, input);
          messages.push({ role: 'tool', tool_call_id: call.id, content: r.isError ? `Error: ${r.content}` : r.content });
        }
      }
      return reply;
    },
    async json<T>(system: string, prompt: string, images: ImageInput[] = [], maxTokens = 1500) {
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [...images.map(i => ({ type: 'image_url' as const, image_url: { url: `data:${i.mediaType};base64,${i.base64}` } })), { type: 'text', text: prompt }];
      const res = await c.chat.completions.create({ model, max_completion_tokens: maxTokens, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system + '\nRespond with a JSON object only.' }, { role: 'user', content }] });
      return parseJSON<T>(res.choices[0].message.content || '');
    },
    async text(system: string, prompt: string, maxTokens = 900) {
      const res = await c.chat.completions.create({ model, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] });
      return res.choices[0].message.content || '';
    }
  };
}
