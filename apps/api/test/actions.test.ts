import { describe, it, expect } from 'vitest';
import { ProposalInput, idemKey } from '../src/domain/actions.js';

describe('action contracts', () => {
  it('accepts a valid reminder proposal', () => {
    const p = ProposalInput.parse({ summary: 'Prep', actions: [{ type: 'add_event', title: 'Prep', eventType: 'reminder', start: '2026-10-15T16:00', end: '2026-10-15T16:15' }] });
    expect(p.actions[0].type).toBe('add_event');
  });
  it('rejects malformed datetimes and unknown actions', () => {
    expect(() => ProposalInput.parse({ summary: 'x', actions: [{ type: 'add_event', title: 'a', start: 'tomorrow', end: 'later' }] })).toThrow();
    expect(() => ProposalInput.parse({ summary: 'x', actions: [{ type: 'send_email', to: 'a@b.c' }] })).toThrow();
  });
  it('produces stable idempotency keys', () => {
    const a = [{ type: 'save_opportunity' as const, opportunityId: 'cac' }];
    expect(idemKey('s1', a)).toBe(idemKey('s1', a)); expect(idemKey('s1', a)).not.toBe(idemKey('s2', a));
  });
});
