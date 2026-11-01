import { prisma, schema } from './prisma-production.mjs';

if (process.env.NODE_ENV === 'production' || process.env.REPLIT_ENVIRONMENT === 'production') {
  throw new Error('Refusing to push a development schema from a production environment.');
}
if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || '')) {
  throw new Error('Replit schema sync requires the development PostgreSQL DATABASE_URL. Run this inside the Replit workspace.');
}

prisma(['db', 'push', '--schema', schema]);
