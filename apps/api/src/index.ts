import {runMonthlyLetters} from './growth-map/letters.js';
import { runJobs } from './discovery/jobs.js';
import { initializeKnowledge } from './knowledge/runtime.js';
import { seedCatalog } from './lib/catalog.js';
import { deliverDueNudges } from './lib/nudges.js';
import { syncDueCalendars } from './lib/calendars.js';
import { buildApp } from './app.js';
import { env } from './lib/env.js';
import {backgroundActivity} from './maintenance/admission.js';
if (process.env.NODE_ENV === 'production') await backgroundActivity(seedCatalog);
const app = await buildApp();
if (env.aiDisabled) app.log.warn(`AI features disabled (AI_DISABLED=true or missing provider configuration)`);
else app.log.info(`LLM provider: ${env.provider}`);

// Persistent leases make polling safe across multiple always-on replicas.
const calendarTimer = setInterval(() => { syncDueCalendars().catch(() => app.log.warn('Calendar background sync unavailable')); }, 60000);
calendarTimer.unref();
app.addHook('onClose', async () => clearInterval(calendarTimer));
const nudgeTimer = setInterval(() => { deliverDueNudges().catch(() => app.log.warn('Nudge scheduler unavailable')); }, 60000);
nudgeTimer.unref();
app.addHook('onClose', async () => clearInterval(nudgeTimer));
const growthLetterTimer=setInterval(()=>{void runMonthlyLetters().catch(()=>app.log.warn('Monthly growth letters are unavailable; the map still works'));},3600000);
growthLetterTimer.unref();
app.addHook('onClose',async()=>clearInterval(growthLetterTimer));
const discoveryTimer=setInterval(()=>{void runJobs().catch(()=>app.log.warn('Opportunity background jobs are unavailable; catalog browsing still works'));},60000);
discoveryTimer.unref();
app.addHook('onClose',async()=>clearInterval(discoveryTimer));
await app.listen({ port: env.port, host: '0.0.0.0' });
void syncDueCalendars().catch(() => app.log.warn('Calendar background sync unavailable'));

void deliverDueNudges().catch(() => app.log.warn('Nudge scheduler unavailable'));

void backgroundActivity(initializeKnowledge).then(()=>runJobs()).catch(()=>app.log.warn('Opportunity discovery is unavailable; catalog browsing still works'));
