import { prisma } from '../lib/db.js';
import { reviewNews } from '../news/review.js';
try {
  if (process.argv[2] === 'list' && process.argv.length === 3) {
    console.log(JSON.stringify(await prisma.newsStory.findMany({ where: { moderationStatus: { in: ['pending', 'blocked'] }, isSample: false }, orderBy: { publishedAt: 'desc' }, take: 100 }), null, 2));
  } else {
    const [id, hash, decision, reviewer, extra] = process.argv.slice(2);
    if (!id || !hash || !reviewer || extra || !['approved', 'blocked'].includes(decision)) throw new Error('Usage: news:review -- ID CONTENT_HASH approved|blocked OPERATOR');
    console.log(JSON.stringify(await reviewNews(prisma, id, hash, decision as 'approved' | 'blocked', reviewer)));
  }
} catch (error) { console.error(error instanceof Error ? error.message : 'Review failed'); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
