import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db.js';
import { requireStudent, HttpError } from '../lib/auth.js';
import { runBuddy, serializeMessage } from '../agent/buddy.js';
import { askJSON, getLLM, requireLLM, ImageInput } from '../agent/llm/index.js';
import { COACH_SYSTEM, EXTRACT_PROMPT, EXTRACT_SYSTEM } from '../agent/prompts.js';
import { env } from '../lib/env.js';
import { RESOURCES } from '../data/resources.js';

const gate = (s: { aiConsent: boolean }) => { if (!s.aiConsent) throw new HttpError(403, 'AI help is turned off. Turn it on in You › Privacy.'); };

export default async function routes(app: FastifyInstance) {
  // Buddy home lists conversations; each conversation holds its own messages.
  app.get('/api/buddy/conversations', async req => {
    const s = await requireStudent(req);
    const list = await prisma.conversation.findMany({ where: { studentId: s.id }, orderBy: { updatedAt: 'desc' }, take: 20, include: { _count: { select: { messages: true } } } });
    return list.map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c._count.messages }));
  });
  app.get('/api/buddy/conversations/:id/messages', async req => {
    const s = await requireStudent(req), { id } = req.params as { id: string };
    const c = await prisma.conversation.findFirst({ where: { id, studentId: s.id } }); if (!c) throw new HttpError(404, 'Not found');
    return (await prisma.chatMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, take: 100 })).map(serializeMessage);
  });
  app.delete('/api/buddy/conversations/:id', async (req, reply) => {
    const s = await requireStudent(req), { id } = req.params as { id: string };
    await prisma.conversation.deleteMany({ where: { id, studentId: s.id } }); return reply.code(204).send();
  });
  app.post('/api/buddy/messages', async req => {
    const s = await requireStudent(req); gate(s);
    const { text, conversationId } = req.body as { text: string; conversationId?: string };
    if (!text?.trim()) throw new HttpError(422, 'Empty message');
    return runBuddy(s.id, text.trim().slice(0, 4000), conversationId);
  });

  // Returns CANDIDATE events only. Nothing is saved until the student confirms via POST /api/events/bulk.
  app.post('/api/extract', async req => {
    const s = await requireStudent(req); gate(s);
    let text: string | undefined; const images: ImageInput[] = [];
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'file') { const buf = await part.toBuffer(); if (!/^image\/(png|jpeg|webp|gif)$/.test(part.mimetype)) throw new HttpError(415, 'Use a PNG, JPG, WebP or GIF image'); images.push({ mediaType: part.mimetype as ImageInput['mediaType'], base64: buf.toString('base64') }); }
        else if (part.fieldname === 'text') text = String(part.value);
      }
    } else text = (req.body as { text?: string })?.text;
    if (!text && !images.length) throw new HttpError(422, 'Send an image or text');
    return askJSON<{ events: unknown[] }>(EXTRACT_SYSTEM, EXTRACT_PROMPT(new Date().toDateString(), text), images, 3000);
  });

  app.post('/api/coach', async req => {
    const s = await requireStudent(req); gate(s); const { question } = req.body as { question: string };
    return { answer: await requireLLM().text(COACH_SYSTEM(s.grade), String(question || '').slice(0, 2000)) };
  });

  app.get('/api/resources', async () => RESOURCES);
  app.get('/api/health', async () => ({ ok: true, aiEnabled: !!getLLM(), provider: env.aiDisabled ? null : env.provider }));
}
