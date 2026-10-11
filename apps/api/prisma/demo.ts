import { PrismaClient } from '@prisma/client';
import { sampleWeek } from '../src/lib/sample.js';

const prisma = new PrismaClient();
const id = 'pathway-demo-student';
try {
  // Re-running setup preserves the trainer's changes to this profile.
  await prisma.student.upsert({
    where: { id },
    update: {},
    create: {
      id, name: 'Demo Student', grade: 10, timezone: 'America/New_York',
      interests: JSON.stringify(['science', 'technology', 'volunteering']),
      aiConsent: false,
      availability: { create: {} },
      events: { create: sampleWeek(id).map(({ studentId: _studentId, ...event }) => event) },
      goals: { create: { title: 'Explore a new opportunity', priority: 'high' } }
    }
  });
  console.log(`Demo student ready: ${id} (synthetic data, AI consent off).`);
} finally {
  await prisma.$disconnect();
}
