import { normalizeTopic } from '../discovery/groups.js';
export const interestSignature = (interests: string[]) =>
  [...new Set(interests.map(normalizeTopic).filter(Boolean))].sort().join('|');
export type RefreshState = {
  cycleStartedAt: Date;
  manualUsed: number;
  extraEarned: boolean;
  extraUsed: boolean;
  interestSignature: string;
};
export function currentCycle(state: RefreshState, now: Date, days: number): RefreshState {
  if (+now - +state.cycleStartedAt >= days * 86400000)
    return { ...state, cycleStartedAt: now, manualUsed: 0, extraEarned: false, extraUsed: false };
  return state;
}
export function refreshAllowance(state: RefreshState, max: number, days: number) {
  const available = state.manualUsed < max || (state.extraEarned && !state.extraUsed);
  return {
    available,
    remaining: Math.max(0, max - state.manualUsed) + (state.extraEarned && !state.extraUsed ? 1 : 0),
    nextAvailableAt: new Date(+state.cycleStartedAt + days * 86400000).toISOString(),
  };
}

export function recheckDue(o: { lastRecheckedAt: Date | null; deadline: string | null }, now: Date) {
  if (!o.lastRecheckedAt || +now - +o.lastRecheckedAt >= 30 * 86400000) return true;
  if (!o.deadline) return false;
  const deadline = new Date(o.deadline + 'T00:00:00Z');
  return (
    +deadline >= +new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z') &&
    +deadline - +now <= 7 * 86400000 &&
    +o.lastRecheckedAt < +deadline - 7 * 86400000
  );
}
