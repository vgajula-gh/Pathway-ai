import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  const port = Number(process.env.VITE_PORT || '5173');
  const codespaceHost = process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : undefined;
  return {
    plugins: [react(), { name: 'pathway-offline-shell', generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).map(name => '/' + name);
      const shell = ['/', '/index.html', '/manifest.webmanifest', '/icons/orb-192.png', '/icons/orb-512.png', ...assets];
      const version = createHash('sha256').update(JSON.stringify(shell)).update(readFileSync(new URL('./service-worker.js', import.meta.url))).update(readFileSync(new URL('./public/manifest.webmanifest', import.meta.url))).update(readFileSync(new URL('./public/icons/orb-192.png', import.meta.url))).update(readFileSync(new URL('./public/icons/orb-512.png', import.meta.url))).digest('hex').slice(0, 12);
      const source = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8').replace('__VERSION__', version).replace('__SHELL__', JSON.stringify(shell));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    } }],
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
