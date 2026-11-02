import { prisma } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { requireLLM } from '../agent/llm/index.js';
import { searchKnowledge } from './service.js';
import { createQuestionGraph } from './question-graph.js';
import { programAnswerChain } from './answer-chain.js';
import { privateWorkflow, workflowConfig, WorkflowStep } from '../workflows/privacy.js';
import { initializeKnowledge, pauseKnowledge } from './runtime.js';
import { loadContext } from '../lib/context.js';
import { eligibility } from '../domain/scoring.js';
import { toOpp } from '../lib/picks.js';
export async function runProgramBuddy(
  studentId: string,
  text: string,
  opportunityId: string,
  conversationId?: string,
) {
  if (!(await initializeKnowledge()))
    throw new HttpError(
      503,
      'Program questions are unavailable right now. You can still explore programs and open their official sites.',
    );
  const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) throw new HttpError(404, 'Program not found');
  const found = conversationId
    ? await prisma.conversation.findFirst({ where: { id: conversationId, studentId, opportunityId } })
    : null;
  if (conversationId && !found) throw new HttpError(404, 'Conversation not found');
  const convo =
    found ||
    (await prisma.conversation.create({
      data: { studentId, opportunityId, title: `About ${opportunity.name}`.slice(0, 60) },
    }));
  const history = await prisma.chatMessage.findMany({
    where: { studentId, conversationId: convo.id },
    orderBy: { createdAt: 'desc' },
    take: 6,
  });
  await prisma.chatMessage.create({
    data: { studentId, conversationId: convo.id, role: 'user', content: text },
  });
  const steps: WorkflowStep[] = [];
  const draft = programAnswerChain(
    requireLLM(),
    opportunity,
    history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    text,
  );
  const graph = createQuestionGraph(
    {
      draft,
      async retrieve(query) {
        try {
          return await searchKnowledge(opportunityId, query);
        } catch {
          pauseKnowledge();
          throw new HttpError(
            503,
            'Program questions are taking a break. Your catalog picks and applications still work. Please try again shortly.',
          );
        }
      },
    },
    (step) => steps.push(step),
  );
  const result = await privateWorkflow(() =>
    graph.invoke({ query: text.slice(0, 1000) }, workflowConfig('program-question', 20)),
  );
  const supported = result.supported;
  const citations = supported.map((c, i) => ({
    number: i + 1,
    chunkId: c.passage.id,
    sourceUrl: c.passage.sourceUrl,
    pageTitle: c.passage.pageTitle,
    checkedAt: c.passage.checkedAt.toISOString(),
  }));
  const { ctx } = await loadContext(studentId),
    fit = eligibility(toOpp(opportunity), ctx);
  const reply = supported.length
    ? supported.map((c, i) => `“${c.quote}” [${i + 1}]`).join('\n\n')
    : `The official pages don’t say. Please check ${opportunity.url}`;
  const eligibilityNote =
    fit.status === 'not_eligible'
      ? fit.reasons.join('; ')
      : fit.status === 'check'
        ? `Please confirm: ${fit.checks.join('; ')}`
        : 'Your grade fits the listed grade range. Other program requirements may apply.';
  const meta = {
    citations,
    workflow: { engine: 'langgraph', steps },
    opportunityId,
    eligibilityNote,
    toolEvents: [
      {
        tool: 'search_knowledge',
        label: `Read official program passages (${result.queries.length} searches)`,
      },
    ],
    proposalIds: [],
  };
  const saved = await prisma.chatMessage.create({
    data: {
      studentId,
      conversationId: convo.id,
      role: 'assistant',
      content: reply,
      meta: JSON.stringify(meta),
    },
  });
  await prisma.conversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
  return { id: saved.id, conversationId: convo.id, reply, ...meta };
}
