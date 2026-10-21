import type { PrismaClient } from '@prisma/client';
import { canShowStory } from '../domain/news.js';

/** Operator-only: no student-facing endpoint and no Buddy write tool. */
export async function reviewNews(db: PrismaClient, id: string, contentHash: string,
  decision: 'approved' | 'blocked', reviewer: string, now = new Date()) {
  if (!/^[a-f0-9]{64}$/.test(contentHash) || !reviewer.trim() || reviewer.length > 120) throw new Error('Expected content hash and operator identity');
  return db.$transaction(async tx => {
    const story = await tx.newsStory.findUniqueOrThrow({ where: { id } });
    if (story.contentHash !== contentHash) throw new Error('Story changed: review current content');
    if (decision === 'approved' && (!canShowStory({ ...story, moderationStatus: 'approved', reviewedAt: now }, now) || story.safetyFlags !== '[]')) {
      throw new Error('Story is stale, unverified, unsupported or flagged; cannot approve');
    }
    const updated = await tx.newsStory.updateMany({ where: { id, contentHash }, data: { moderationStatus: decision, reviewedAt: now, reviewedBy: reviewer.trim() } });
    if (updated.count !== 1) throw new Error('Story changed during review');
    await tx.newsReview.create({ data: { storyId: id, contentHash, decision, reviewer: reviewer.trim(), at: now } });
    return { id, status: decision };
  });
}
