/** Pure setup helpers shared by Codespaces provisioning and its tests. */
export const DEFAULT_OLLAMA_MODEL = 'llama3.2:3b';
export function useOllama(value = 'true') { return !['false', '0', 'off'].includes(value.toLowerCase()); }
export function configureLocalAI(text, model = DEFAULT_OLLAMA_MODEL) {
  const values = { LLM_PROVIDER: 'ollama', AI_DISABLED: 'false', OLLAMA_BASE_URL: 'http://localhost:11434/v1', OLLAMA_MODEL: model };
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n]/.test(value)) throw new Error('Model name must be a single line');
    const line = `${key}=${value}`;
    text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), () => line) : `${text.trimEnd()}\n${line}\n`;
  }
  return text;
}
