import {initializeKnowledge} from '../knowledge/runtime.js';
import { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { requireStudent } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { discoveryAvailability } from '../discovery/availability.js';
import { discoveryStatus } from '../discovery/refresh.js';
import { enqueueSearch } from '../discovery/requests.js';
import { runJobs,runStudentDiscovery } from '../discovery/jobs.js';
export default async function routes(app: FastifyInstance) {
  app.post('/api/opportunities/refresh', async (req,reply) => {
    const s = await requireStudent(req);
    z.object({})
      .strict()
      .parse(req.body || {});
    const result=await enqueueSearch(s.id,'initial',new Date(),{explicit:true});
    return reply.code(202).send({...result,...await discoveryStatus(s.id)});
  });
  app.post('/api/discovery/run',async req=>{
    const s=await requireStudent(req);
    z.object({}).strict().parse(req.body||{});
    const availability=await discoveryAvailability(s.aiConsent);
    if(!s.aiConsent)throw new HttpError(403,availability.unavailable!.message);
    if(!availability.enabled&&!await initializeKnowledge())throw new HttpError(503,availability.unavailable!.message);
    return runStudentDiscovery(s.id);
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
