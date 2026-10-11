export const parseLocal = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : new Date(NaN); };
export const fmtTime = (s: string) => parseLocal(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtDay = (s: string) => parseLocal(s).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtDayLong = (d = new Date()) => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
export const fmtMins = (m = 0) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };
export const EMO: Record<string, string> = { class: '📚', exam: '📝', deadline: '⏰', club: '🧩', sports: '⚽', competition: '🏆', volunteering: '🤝', study: '💡', personal: '🌿', reminder: '🔔', other: '📌' };
export const CEMO: Record<string, string> = { 'STEM competition': '🏆', 'Academic competition': '🧠', Research: '🔬', 'Creative competition': '🎨', 'Club & leadership': '🧭', Entrepreneurship: '🚀', 'Hackathons & clubs': '💻', Volunteering: '🤝', Scholarship: '🎓', Internship: '🛰️', 'Summer program': '☀️' };
export const SOURCE_TAG: Record<string, string> = { manual: 'You added', upload: 'Imported', pathway: 'Suggested · you approved', sample: 'Sample data' };
export const FIT_LABEL = { strong: 'Strong fit', good: 'Good fit', look: 'Worth a look' } as const;
