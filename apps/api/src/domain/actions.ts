// Action Agent contract. Every change Pathway makes goes through a proposal:
// PROPOSED → AWAITING_APPROVAL → APPROVED → EXECUTING → VERIFIED | FAILED  (or REJECTED / EXPIRED).
import { z } from 'zod';
import { EVENT_TYPES } from './types.js';

const localDT = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use YYYY-MM-DDTHH:MM');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).default('');

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_event'), title: z.string().min(1).max(120), eventType: z.enum(EVENT_TYPES).default('study'), start: localDT, end: localDT, location: z.string().max(120).default('') }),
  z.object({ type: z.literal('move_event'), eventId: z.string(), start: localDT, end: localDT }),
  z.object({ type: z.literal('remove_event'), eventId: z.string() }),
  z.object({ type: z.literal('add_goal'), ref: z.string().min(1), title: z.string().min(1).max(140), category: z.string().default('aspiration'), priority: z.enum(['high', 'medium', 'low']).default('medium'), targetDate: date, opportunityId: z.string().optional() }),
  z.object({ type: z.literal('add_milestone'), goalRef: z.string().min(1), title: z.string().min(1).max(140), purpose: z.string().default(''), effortMin: z.number().int().min(5).max(600).default(30), targetDate: date }),
  z.object({ type: z.literal('add_application_requirements'), opportunityId:z.string(), checklist:z.array(z.object({title:z.string().min(1).max(240),sourceUrl:z.string().url()})).max(20), deadline:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), referenceHash:z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ type: z.literal('save_opportunity'), opportunityId: z.string() }),
  z.object({ type: z.literal('add_portfolio_entry'), title: z.string().min(1), entryType: z.string().default('project'), date: date, reflection: z.string().default(''), skills: z.array(z.string()).default([]) })
]);
export type Action = z.infer<typeof ActionSchema>;
export const ProposalInput = z.object({ summary: z.string().min(1).max(200), rationale: z.string().max(600).default(''), actions: z.array(ActionSchema).min(1).max(30) });
export type ProposalInput = z.infer<typeof ProposalInput>;

export const STATUS = ['AWAITING_APPROVAL', 'APPROVED', 'EXECUTING', 'VERIFIED', 'FAILED', 'REJECTED', 'EXPIRED'] as const;
export const PROPOSAL_TTL_MS = 48 * 3600 * 1000;

/** Stable idempotency key: the same student + same actions can only execute once. */
export function idemKey(studentId: string, actions: Action[]) {
  const s = studentId + '|' + JSON.stringify(actions);
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function describe(a: Action): string {
  switch (a.type) {
    case 'add_event': return `${a.eventType === 'reminder' ? 'Reminder' : 'Add'}: ${a.title} (${a.start.replace('T', ' ')})`;
    case 'move_event': return `Move event to ${a.start.replace('T', ' ')}`;
    case 'remove_event': return 'Remove an event';
    case 'add_goal': return `New goal: ${a.title}`;
    case 'add_milestone': return `Step: ${a.title} (${a.effortMin} min)`;
    case 'add_application_requirements': return `Add ${a.checklist.length} official checklist steps${a.deadline ? ` and deadline ${a.deadline}` : ''}`;
    case 'save_opportunity': return 'Save opportunity';
    case 'add_portfolio_entry': return `Portfolio: ${a.title}`;
  }
}
