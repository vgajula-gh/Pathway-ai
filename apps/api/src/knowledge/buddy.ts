import {knowledgeScope,MY_OPPORTUNITIES} from './scope.js';
import {structuredFacts,requestedFacts,structuredExcerpt} from './facts.js';
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
  const programs=await knowledgeScope(studentId,opportunityId);
  if(!programs.length)throw new HttpError(422,'Add a program to your picks or Interested list first.');
  if (!(await initializeKnowledge()))
    throw new HttpError(
      503,
      'Program questions are unavailable right now. You can still explore programs and open their official sites.',
    );
  const opportunity=programs[0],cross=opportunityId===MY_OPPORTUNITIES;
  const found = conversationId
    ? await prisma.conversation.findFirst({ where: { id: conversationId, studentId, opportunityId } })
    : null;
  if (conversationId && !found) throw new HttpError(404, 'Conversation not found');
  const convo =
    found ||
    (await prisma.conversation.create({
      data: { studentId, opportunityId, title:cross?'My opportunities':`About ${opportunity.name}`.slice(0,60) },
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
    {id:opportunityId,name:cross?programs.map(p=>p.name).join('; '):opportunity.name},
    history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    text,
  );
  const graph = createQuestionGraph(
    {
      draft,
      async retrieve(query) {
        try {
          return await searchKnowledge(studentId,query,opportunityId);
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
  // Recompute membership on every turn, including just before returning passages.
  const current=await knowledgeScope(studentId,opportunityId),{ctx}=await loadContext(studentId);
  if(!current.length)throw new HttpError(422,'Your opportunity list changed. Open Explore and choose a program again.');
  const supported=result.supported.filter(c=>current.some(p=>p.id===c.passage.opportunityId)&&!structuredExcerpt(c.quote));
  const citations:{number:number;chunkId?:string;opportunityId:string;sourceUrl:string;pageTitle:string;checkedAt:string}[]=[];
  const requested=requestedFacts(text);
  const reply=current.map(o=>{
    const claims=supported.filter(c=>c.passage.opportunityId===o.id),facts=structuredFacts(o,ctx);
    const lines=requested.map(key=>{
      const fact=facts[key];let citation='';
      if(fact.sourceUrl&&o.sourceCheckedAt){const number=citations.length+1;citations.push({number,opportunityId:o.id,sourceUrl:fact.sourceUrl,pageTitle:o.name,checkedAt:o.sourceCheckedAt.toISOString()});citation=` [${number}]`;}
      return `${key[0].toUpperCase()+key.slice(1)}: ${fact.value}${citation}`;
    });
    for(const c of claims){const number=citations.length+1;citations.push({number,chunkId:c.passage.id,opportunityId:o.id,sourceUrl:c.passage.sourceUrl,pageTitle:c.passage.pageTitle,checkedAt:c.passage.checkedAt.toISOString()});lines.push(`“${c.quote}” [${number}]`);}
    if(!claims.length)lines.push(`The official pages don’t say. Please check ${o.url}`);
    return `${cross?o.name+'\n':''}${lines.join('\n\n')}`;
  }).join('\n\n');
  const eligibilityNote=cross?'Eligibility is checked separately for each program.':structuredFacts(current[0],ctx).eligibility.value;
  const interested=await prisma.savedOpportunity.findMany({where:{studentId,status:{not:'dismissed'}}});
  const meta = {
    citations,
    workflow: { engine: 'langgraph', steps },
    ...(cross?{scope:MY_OPPORTUNITIES}:{opportunityId}),
    programs:current.map(o=>({id:o.id,name:o.name,canAddRequirements:interested.some(s=>s.opportunityId===o.id)})),
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
