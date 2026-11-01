// Local Ollama needs no provider API key.
const selected = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
const provider = selected === 'ollama' ? 'ollama' : selected === 'openai' ? 'openai' : 'anthropic';
const key = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
export const env = {
  accessCodes: (process.env.ACCESS_CODES || '').split(',').map(s => s.trim()).filter(Boolean),
  feedbackUrl: /^https?:\/\//.test(process.env.FEEDBACK_URL || '') ? process.env.FEEDBACK_URL! : null,
  port: Number(process.env.PORT || 8787),
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  provider: provider as 'anthropic' | 'openai' | 'ollama',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || '',
  ollamaBaseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:3b',
  aiDisabled: process.env.AI_DISABLED === 'true' || (provider !== 'ollama' && !key)
};
