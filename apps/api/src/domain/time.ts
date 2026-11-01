// Local wall-clock helpers. Events are stored as local "YYYY-MM-DDTHH:MM" strings
// in the student's timezone (Student.timezone). Keep all date math here.
export const pad = (n: number) => String(n).padStart(2, '0');
export const dkey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fmtLocal = (d: Date) => `${dkey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function parseLocal(s?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  return isNaN(+d) ? null : d;
}
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const minOf = (t: string) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const mondayOf = (d: Date) => addDays(sod(d), -((d.getDay() + 6) % 7));

/** Wall-clock representation for deterministic existing engine helpers. */
export function wallNow(timezone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const get = (k: string) => Number(parts.find(p => p.type === k)?.value);
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
}
