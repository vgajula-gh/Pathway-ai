import { seedCatalog } from './lib/catalog.js';
import { syncDueCalendars } from './lib/calendars.js';
import { buildApp } from './app.js';
import { env } from './lib/env.js';
if (process.env.NODE_ENV === 'production') await seedCatalog();
const app = await buildApp();
if (env.aiDisabled) app.log.warn(`AI features disabled (AI_DISABLED=true or missing provider configuration)`);
else app.log.info(`LLM provider: ${env.provider}`);

// Persistent leases make polling safe across multiple always-on replicas.
const calendarTimer = setInterval(() => { syncDueCalendars().catch(() => app.log.warn('Calendar background sync unavailable')); }, 60000);
calendarTimer.unref();
app.addHook('onClose', async () => clearInterval(calendarTimer));
await app.listen({ port: env.port, host: '0.0.0.0' });
void syncDueCalendars().catch(() => app.log.warn('Calendar background sync unavailable'));
