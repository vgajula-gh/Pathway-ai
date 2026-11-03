import type {FastifyRequest} from 'fastify';
import {HttpError} from '../lib/errors.js';

// Obtained from Replit's deployment metadata, not the development-domain env vars.
export const productionHost = 'pathway-ai.replit.app';
export function maintenanceEnabled() {
  return process.env.NODE_ENV === 'production' && /^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || '');
}
export function assertProductionTarget(req: FastifyRequest) {
  if (!maintenanceEnabled() || req.headers.host !== productionHost)
    throw new HttpError(403, 'Pilot reset is restricted to the reviewed production PostgreSQL deployment.');
}
