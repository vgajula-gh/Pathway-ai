import { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { requireStudent } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { discoveryAvailability } from '../discovery/availability.js';
import { personalPicks } from '../lib/picks.js';
import { discoveryStatus, queueDiscovery, useManualRefresh } from '../discovery/refresh.js';
import { runJobs } from '../discovery/jobs.js';
import { audit } from '../lib/audit.js';
export default async function routes(app: FastifyInstance) {
  app.post('/api/opportunities/refresh', async (req) => {
    const s = await requireStudent(req);
    z.object({})
      .strict()
      .parse(req.body || {});
    const availability = await discoveryAvailability(s.aiConsent);
    if (!availability.enabled)
      throw new HttpError(503, availability.unavailable!.message);
    await useManualRefresh(s.id);
    await personalPicks(s.id, true);
    await queueDiscovery(s.id);
    await audit(s.id, 'student', 'Refreshed personal opportunity picks');
    return discoveryStatus(s.id);
  });
  app.get('/api/discovery/status', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const s = await requireStudent(req);
    return { ...(await discoveryAvailability(s.aiConsent)), ...(await discoveryStatus(s.id)) };
  });
  app.post('/internal/jobs/run', async (req) => {
    const secret = process.env.JOBS_SECRET;
    if (!secret || secret.length < 32)
      throw new HttpError(
        503,
        'Scheduled jobs need an owner-configured JOBS_SECRET of at least 32 characters.',
      );
    const bearer = z.string().max(512).safeParse(req.headers.authorization);
    const value = bearer.success && bearer.data.startsWith('Bearer ') ? bearer.data.slice(7) : '';
    if (
      !timingSafeEqual(
        createHash('sha256').update(value).digest(),
        createHash('sha256').update(secret).digest(),
      )
    )
      throw new HttpError(401, 'Invalid job credentials');
    z.object({})
      .strict()
      .parse(req.body || {});
    return runJobs();
  });
}
