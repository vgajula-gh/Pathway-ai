// Provider-agnostic LLM interface. The agent, prompts, tools and guardrails never import a vendor SDK;
// only the adapters in this folder do. Add a provider by implementing LLM and registering it in index.ts.
export interface ToolSpec { name: string; description: string; input_schema: Record<string, unknown> }
export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface ImageInput { mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; base64: string }
export interface ToolResult { content: string; isError?: boolean }
export interface JSONSchema { name: string; schema: Record<string, unknown> }
export interface LLMUsage {provider:'openai'|'anthropic'|'ollama';model:string;inputTokens:number|null;outputTokens:number|null;responseId:string|null;webSearches?:number|null}
export interface RunToolsOptions {
  system: string; history: ChatTurn[]; tools: ToolSpec[]; maxRounds: number; maxTokens?: number;
  exec: (name: string, input: unknown) => Promise<ToolResult>;
}
export interface LLM {
  readonly lastUsage?:LLMUsage|null;
  readonly provider: 'anthropic' | 'openai' | 'ollama';
  /** Tool-use loop: the model may call tools up to maxRounds times; returns the final text. */
  runTools(opts: RunToolsOptions): Promise<string>;
  /** JSON-only answer, parsed defensively (optionally with images). */
  json<T>(system: string, prompt: string, images?: ImageInput[], maxTokens?: number, schema?: JSONSchema): Promise<T>;
  /** Plain text answer. */
  text(system: string, prompt: string, maxTokens?: number): Promise<string>;
}
export function parseJSON<T>(raw: string): T {
  const t = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(t) as T; } catch { const m = t.match(/\{[\s\S]*\}|\[[\s\S]*\]/); if (m) return JSON.parse(m[0]) as T; throw new Error('unreadable'); }
}
