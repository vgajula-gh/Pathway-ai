export const EVENT_TYPES = ['class', 'exam', 'deadline', 'club', 'sports', 'competition', 'volunteering', 'study', 'personal', 'reminder', 'other'] as const;
export type EventType = typeof EVENT_TYPES[number];
/** Fixed commitments can't be moved by Pathway; flexible blocks can. */
export const FIXED: Record<string, boolean> = { class: true, exam: true, deadline: true, club: true, sports: true, competition: true, volunteering: true, study: false, personal: false, reminder: false, other: true };

export interface CalEvent {
  id: string; title: string; type: string; start: string; end: string;
  location?: string; recurDays: number[]; recurUntil?: string; source?: string; done?: boolean; readOnly?: boolean;
}
export interface Occurrence extends CalEvent { s: Date; e: Date; occ?: string }
export interface AvailabilityRules {
  studyStart: string; studyEnd: string; maxStudyMin: number; downtimeStart: string; downtimeEnd: string;
}
export interface StudentContext {
  region?: string; grade: number; interests: string[]; skills: string[]; budget: string; format: string; goals: string[];
}
