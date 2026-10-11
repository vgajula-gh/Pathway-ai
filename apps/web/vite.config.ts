import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  const codespaceHost = process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `${process.env.CODESPACE_NAME}-5173.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : undefined;
  return {
    plugins: [react()],
    envDir: '../../',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: codespaceHost ? [codespaceHost] : [],
      proxy: {
        '/api': { target: `http://127.0.0.1:${process.env.PORT || env.PORT || '8787'}`, changeOrigin: true }
      }
    }
  };
});
