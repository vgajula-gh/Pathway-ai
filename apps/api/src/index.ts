import { seedCatalog } from './lib/catalog.js';
import { buildApp } from './app.js';
import { env } from './lib/env.js';
if (process.env.NODE_ENV === 'production') await seedCatalog();
const app = await buildApp();
await app.listen({ port: env.port, host: '0.0.0.0' });
if (env.aiDisabled) app.log.warn(`AI features disabled (AI_DISABLED=true or missing provider configuration)`);
else app.log.info(`LLM provider: ${env.provider}`);
