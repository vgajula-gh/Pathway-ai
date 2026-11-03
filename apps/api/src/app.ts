import { assertSignInSecret } from './lib/accounts.js';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { accessRoutes } from './lib/access.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { env } from './lib/env.js';
import { HttpError } from './lib/auth.js';
import discovery from './routes/discovery.js';
import diagnostics from './routes/diagnostics.js';
import notifications from './routes/notifications.js';
import calendars from './routes/calendars.js';
import applications from './routes/applications.js';

import accounts from './routes/accounts.js';
import students from './routes/students.js';
import events from './routes/events.js';
import today from './routes/today.js';
import opportunities from './routes/opportunities.js';
import proposals from './routes/proposals.js';
import growth from './routes/growth.js';
import ai from './routes/ai.js';
import news from './routes/news.js';

export async function buildApp() {
  assertSignInSecret();
  const app = Fastify({ trustProxy: process.env.NODE_ENV === 'production' ? (_address: string, hop: number) => hop < 1 : false, connectionTimeout: env.provider === 'ollama' ? 1_200_000 : 120_000, logger: { level: 'info', redact: ['req.headers.authorization','req.headers["x-student-id"]', 'req.headers["x-access-code"]', 'req.headers.cookie', 'res.headers["set-cookie"]'] } });
  await app.register(cors, { origin: env.webOrigin, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(422).send({ error: 'Invalid input', details: err.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    if (env.provider === 'ollama' && err instanceof Error && /APIConnection|Timeout/.test(err.name)) return reply.code(503).send({ error: 'Local AI is taking longer than expected or is unavailable. Check that Ollama is running, then try again.' });
    app.log.error(err); return reply.code(500).send({ error: 'Something went wrong' });
  });
  app.addHook('onRequest', async req => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
      const origin = req.headers.origin;
      let sameHost = false;
      try { sameHost = new URL(origin).host === req.headers.host; } catch { /* Reject malformed origins. */ }
      const codespaceOrigin = process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ? `https://${process.env.CODESPACE_NAME}-5173.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}` : null;
      if (!sameHost && !(process.env.NODE_ENV !== 'production' && (origin === env.webOrigin || origin === codespaceOrigin))) throw new HttpError(403, 'Open Pathway directly to continue.');
    }
  });
  await accessRoutes(app);
  if (process.env.NODE_ENV === 'production') {
    await app.register(staticFiles, { root: fileURLToPath(new URL('../../web/dist/', import.meta.url)) });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.split('?')[0].startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }
  for (const r of [diagnostics, discovery, accounts, notifications, calendars, applications, students, events, today, opportunities, proposals, growth, ai, news]) await app.register(r);
  return app;
}
