import { prisma } from './db.js';
export function audit(studentId: string, actor: 'student' | 'pathway' | 'system', event: string, record = '') {
  return prisma.auditEvent.create({ data: { studentId, actor, event, record } });
}
