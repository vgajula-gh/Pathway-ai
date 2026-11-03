// Claude adapter (Anthropic Messages API with tool use). Docs: https://docs.claude.com/en/api/messages
import Anthropic from '@anthropic-ai/sdk';
import { LLM, RunToolsOptions, ImageInput, parseJSON, LLMUsage } from './types.js';

export function anthropicLLM(apiKey: string, model: string, options: {maxRetries?:number;timeout?:number} = {}): LLM {
  const c = new Anthropic({ apiKey, ...options });
  const textOf = (r: Anthropic.Message) => r.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('');
  let lastUsage:LLMUsage|null=null;
  const record=(res:Anthropic.Message)=>{lastUsage={provider:'anthropic',model,inputTokens:res.usage?.input_tokens??null,outputTokens:res.usage?.output_tokens??null,responseId:res.id||null};return res;};
  return {
    get lastUsage(){return lastUsage;},
    provider: 'anthropic',
    async runTools({ system, history, tools, maxRounds, maxTokens = 1200, exec }: RunToolsOptions) {
      const messages: Anthropic.MessageParam[] = history.map(h => ({ role: h.role, content: h.content }));
      let reply = '';
      for (let round = 0; round < maxRounds; round++) {
        const res = await c.messages.create({ model, max_tokens: maxTokens, system, messages, tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Tool.InputSchema })) });
        reply += textOf(res);
        if (res.stop_reason !== 'tool_use') break;
        messages.push({ role: 'assistant', content: res.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const b of res.content) if (b.type === 'tool_use') { const r = await exec(b.name, b.input); results.push({ type: 'tool_result', tool_use_id: b.id, content: r.content, is_error: r.isError }); }
        messages.push({ role: 'user', content: results });
      }
      return reply;
    },
    async json<T>(system: string, prompt: string, images: ImageInput[] = [], maxTokens = 1500) {
      const content: Anthropic.ContentBlockParam[] = [...images.map(i => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType, data: i.base64 } })), { type: 'text', text: prompt }];
      const res = await c.messages.create({ model, max_tokens: maxTokens, system: system + '\nRespond with JSON only. No prose, no code fences.', messages: [{ role: 'user', content }] });
      record(res);
      return parseJSON<T>(textOf(res));
    },
    async text(system: string, prompt: string, maxTokens = 900) {
      return textOf(await c.messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }));
    }
  };
}
