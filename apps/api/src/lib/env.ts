// LLM_PROVIDER picks the model vendor: "anthropic" (Claude, default) or "openai".
const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase() === 'openai' ? 'openai' : 'anthropic';
const key = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
export const env = {
  port: Number(process.env.PORT || 8787),
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  provider: provider as 'anthropic' | 'openai',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || '',
  aiDisabled: process.env.AI_DISABLED === 'true' || !key
};
