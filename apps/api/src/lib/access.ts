import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from './env.js';
import { HttpError } from './errors.js';
import { sessionStudent } from './accounts.js';

export function accessCode(req: Pick<FastifyRequest, 'headers'>): string | null {
  if (!env.accessCodes.length && process.env.NODE_ENV !== 'production') return null;
  const code = z.string().max(256).safeParse(req.headers['x-access-code']);
  if (!code.success || !env.accessCodes.includes(code.data)) throw new HttpError(401, 'Enter a valid access code to continue.');
  return code.data;
}
export async function accessRoutes(app: FastifyInstance) {
  app.get('/api/config', async () => ({ accessRequired: env.accessCodes.length > 0 || process.env.NODE_ENV === 'production', feedbackUrl: env.feedbackUrl }));
  app.post('/api/access', async req => {
    const { code } = z.object({ code: z.string().min(1).max(256) }).parse(req.body);
    accessCode({ headers: { 'x-access-code': code } });
    return { ok: true };
  });
  app.addHook('onRequest', async req => {
    const path = req.url.split('?')[0];
    if (path.startsWith('/api/') && !['/api/config', '/api/access', '/api/health', '/api/auth/session', '/api/auth/logout', '/api/auth/login', '/api/auth/recover'].includes(path) && req.method !== 'OPTIONS') {
      if (await sessionStudent(req)) return;
      accessCode(req);
    }
  });
}
