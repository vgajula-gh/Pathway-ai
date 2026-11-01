// Tool-use loop for Buddy. See docs/07-AGENT-AND-TOOLS.md.
import { runProgramBuddy } from '../knowledge/buddy.js';
import { requireLLM, ChatTurn } from './llm/index.js';
import { BUDDY_SYSTEM } from './prompts.js';
import { TOOLS, ToolEvent } from './tools.js';
import { loadContext } from '../lib/context.js';
import { prisma, j } from '../lib/db.js';
import { ZodError } from 'zod';

const MAX_ROUNDS = 6;

export async function runBuddy(studentId: string, userText: string, conversationId?: string, opportunityId?: string) {
  const scoped=conversationId?await prisma.conversation.findFirst({where:{id:conversationId,studentId}}):null;
  if(opportunityId || scoped?.opportunityId) return runProgramBuddy(studentId,userText,opportunityId||scoped!.opportunityId!,conversationId);
  const llm = requireLLM();
  const { student, goals, ctx, rules } = await loadContext(studentId);
  // New topics start a new conversation; follow-ups pass the conversationId to continue it.
  let convo = conversationId ? await prisma.conversation.findFirst({ where: { id: conversationId, studentId } }) : null;
  if (!convo) convo = await prisma.conversation.create({ data: { studentId, title: userText.length > 60 ? userText.slice(0, 57) + '…' : userText } });
  const history = await prisma.chatMessage.findMany({ where: { studentId, conversationId: convo.id }, orderBy: { createdAt: 'desc' }, take: 12 });
  const context = JSON.stringify({ name: student.name, ...ctx, availability: rules, goals: goals.filter(g => g.status !== 'done').map(g => ({ id: g.id, title: g.title, steps: g.milestones.map(m => `${m.title} [${m.status}]`) })) });
  const historyTurns: ChatTurn[] = history.reverse().filter(m => m.content).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  historyTurns.push({ role: 'user', content: userText });
  while (historyTurns.length && historyTurns[0].role !== 'user') historyTurns.shift();
  await prisma.chatMessage.create({ data: { studentId, conversationId: convo.id, role: 'user', content: userText } });

  const toolEvents: ToolEvent[] = [], proposalIds: string[] = [];
  let reply = await llm.runTools({
    system: BUDDY_SYSTEM(new Date().toString(), context), history: historyTurns, maxRounds: MAX_ROUNDS,
    tools: TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
    async exec(name, input) {
      const tool = TOOLS.find(t => t.name === name);
      try { return { content: JSON.stringify(tool ? await tool.run(input, studentId, toolEvents, proposalIds) : { error: 'Unknown tool' }) }; }
      catch (err) { return { content: err instanceof ZodError ? err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : (err as Error).message, isError: true }; }
    }
  });
  reply = reply.trim() || (proposalIds.length ? 'I put together a plan. It\u2019s waiting for your approval.' : 'Sorry, I couldn\u2019t finish that. Try asking again.');
  const saved = await prisma.chatMessage.create({ data: { studentId, conversationId: convo.id, role: 'assistant', content: reply, meta: JSON.stringify({ toolEvents, proposalIds }) } });
  await prisma.conversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
  return { id: saved.id, conversationId: convo.id, reply, toolEvents, proposalIds };
}

export const serializeMessage = (m: { id: string; role: string; content: string; meta: string; createdAt: Date }) => ({ id: m.id, role: m.role, content: m.content, ...j(m.meta, {}), createdAt: m.createdAt });
