import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { env } from './lib/env.js';
import { HttpError } from './lib/auth.js';
import students from './routes/students.js';
import events from './routes/events.js';
import today from './routes/today.js';
import opportunities from './routes/opportunities.js';
import proposals from './routes/proposals.js';
import growth from './routes/growth.js';
import ai from './routes/ai.js';
import news from './routes/news.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: 'info', redact: ['req.headers["x-student-id"]'] } });
  await app.register(cors, { origin: env.webOrigin, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(422).send({ error: 'Invalid input', details: err.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    app.log.error(err); return reply.code(500).send({ error: 'Something went wrong' });
  });
  for (const r of [students, events, today, opportunities, proposals, growth, ai, news]) await app.register(r);
  return app;
}
