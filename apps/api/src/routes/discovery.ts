import {initializeKnowledge} from '../knowledge/runtime.js';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireStudent } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { discoveryAvailability } from '../discovery/availability.js';
import { discoveryStatus } from '../discovery/refresh.js';
import { enqueueSearch } from '../discovery/requests.js';
import { runJobs,runStudentDiscovery } from '../discovery/jobs.js';
import {requireOwner} from '../lib/owner-auth.js';
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
    requireOwner(req);
    z.object({})
      .strict()
      .parse(req.body || {});
    return runJobs();
  });
}
