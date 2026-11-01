import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  const port = Number(process.env.VITE_PORT || '5173');
  const codespaceHost = process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : undefined;
  return {
    plugins: [react()],
    envDir: '../../',
    server: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      allowedHosts: codespaceHost ? [codespaceHost] : true,
      proxy: {
        '/api': { target: `http://127.0.0.1:${process.env.PORT || env.PORT || '8787'}`, changeOrigin: true,
          proxyTimeout: (process.env.LLM_PROVIDER || env.LLM_PROVIDER) === 'ollama' ? 1_200_000 : 120_000,
          timeout: (process.env.LLM_PROVIDER || env.LLM_PROVIDER) === 'ollama' ? 1_200_000 : 120_000 }
      }
    }
  };
});
