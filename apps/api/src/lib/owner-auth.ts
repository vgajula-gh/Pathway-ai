import {createHash,timingSafeEqual} from 'node:crypto';
import type {FastifyRequest} from 'fastify';
import {HttpError} from './errors.js';
export function requireOwner(req:FastifyRequest) {
  const secret=process.env.JOBS_SECRET;
  if(!secret||secret.length<32)throw new HttpError(503,'Owner diagnostics and jobs need JOBS_SECRET of at least 32 characters.');
  const bearer=req.headers.authorization,value=typeof bearer==='string'&&bearer.length<=512&&bearer.startsWith('Bearer ')?bearer.slice(7):'';
  if(!timingSafeEqual(createHash('sha256').update(value).digest(),createHash('sha256').update(secret).digest()))throw new HttpError(401,'Invalid job credentials');
}
