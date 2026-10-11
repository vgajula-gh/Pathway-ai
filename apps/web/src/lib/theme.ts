// Appearance: Dusk (softly dark, default), Dark, Light, or match the device.
export const THEMES = [['dusk', 'Dusk', '🌆'], ['dark', 'Dark', '🌙'], ['light', 'Light', '☀️'], ['auto', 'Match device', '🌓']] as const;
export type Theme = typeof THEMES[number][0];
export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
}
export const nextTheme = (t: Theme): Theme => THEMES[(THEMES.findIndex(x => x[0] === t) + 1) % THEMES.length][0];
export const NEWS_EMOJI: Record<string, string> = { Space: '🚀', Science: '🔬', 'AI & Tech': '🤖', 'Health & Medicine': '🩺', 'Climate & Nature': '🌿', 'Arts & Culture': '🎨', Sports: '🏅' };
export const WARM = ['Small steps still count. Today is a good day for one.', 'You don’t have to do everything today. Just the next right thing.', 'Curiosity is a superpower. Follow it a little today.', 'Rest is part of the plan, too.', 'Every expert started as a beginner. Keep going.', 'Be kind to yourself today. You’re doing more than you think.', 'One focused hour beats a distracted afternoon.', 'Try something new today, even something small.'];
export function partOfDay(d = new Date()) { const h = d.getHours(); return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night'; }
