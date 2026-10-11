// Clearly labeled sample week (source = "sample") so demos work without real data.
import { addDays, dkey, mondayOf } from '../domain/time.js';
export function sampleWeek(studentId: string) {
  const mon = mondayOf(new Date()), at = (d: number, t: string) => `${dkey(addDays(mon, d))}T${t}`, until = dkey(addDays(mon, 70));
  const W = (title: string, type: string, days: number[], s: string, e: string, location = '') => ({ studentId, title, type, start: at(0, s), end: at(0, e), location, recurDays: JSON.stringify(days), recurUntil: until, source: 'sample' });
  const O = (title: string, type: string, d: number, s: string, e: string, location = '') => ({ studentId, title, type, start: at(d, s), end: at(d, e), location, source: 'sample' });
  return [W('School', 'class', [1, 2, 3, 4, 5], '08:00', '15:00', 'Lincoln High'), W('Robotics club', 'club', [2, 4], '15:30', '17:00', 'Room 214'), W('Soccer practice', 'sports', [1, 3], '16:00', '17:30', 'Field B'),
    W('Debate club', 'club', [3], '16:30', '17:30', 'Library'), O('Biology exam', 'exam', 11, '09:00', '10:00', 'Room 108'), O('English essay due', 'deadline', 11, '23:59', '23:59'), O('Food bank volunteering', 'volunteering', 5, '10:00', '12:00', 'Community Food Bank')];
}
