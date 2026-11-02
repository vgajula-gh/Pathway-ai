import RegionSelect from '../components/RegionSelect';
import { useState } from 'react';
import { CalendarHelp } from '../components/Calendars';
import { api, session } from '../lib/api';
import { SignInResult } from '../lib/types';
import { PhraseFields, validPhrase } from './SignIn';
import { toast, useLoad } from '../components/ui';

const INTERESTS = ['AI', 'Coding', 'Robotics', 'Engineering', 'Science', 'Medicine', 'Space', 'Math', 'Business', 'Entrepreneurship', 'Art', 'Writing', 'Music', 'Sports', 'Volunteering', 'Climate', 'Debate'];

/** Student DNA intake: few, high-value questions; skippable; no mandatory calendar/email connection. */
export default function Onboarding({ onDone, onCancel }: { onDone: (s: SignInResult) => void; onCancel?: () => void }) {
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState('');
  const config = useLoad(() => api<{demoMode:boolean}>('/api/config'), []);
  const [f, setF] = useState({ phrase: '', confirmPhrase: '', name: '', region: '', grade: 10, interests: [] as string[], goal: '', aiConsent: true, studyStart: '16:00', studyEnd: '21:00', downtimeStart: '21:00', downtimeEnd: '23:00', sampleWeek: true });
  const set = (k: keyof typeof f, v: unknown) => setF(x => ({ ...x, [k]: v }));
  const finish = async () => { const { phrase, confirmPhrase, ...profile } = f; setBusy(true); try { const student = await api<SignInResult>('/api/students', { body: { ...profile, sampleWeek: !!config.data?.demoMode && f.sampleWeek, credentials: { phrase, confirmPhrase }, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }); session.set(student.id); if (calendarUrl.trim()) { try { await api('/api/calendars', { body: { label: 'School calendar', url: calendarUrl.trim() } }); } catch { toast('Your profile is ready. You can finish linking your calendar in You.'); } } setCalendarUrl(''); onDone(student); } catch (e) { toast((e as Error).message); setBusy(false); } };
  const next = () => (step === 7 ? finish() : setStep(step + 1));
  const ok = step === 2 ? f.name.trim().length > 0 : step !== 7 || validPhrase(f.phrase, f.confirmPhrase);
  const cta = ['Get started', 'Continue', 'Continue', 'Continue', f.goal.trim() ? 'Continue' : 'Skip for now', 'Continue', calendarUrl.trim() ? 'Continue' : 'Skip for now', 'Create account and start my day'][step];
  return (
    <div className="ob">
      {onCancel && <button className="link" disabled={busy} onClick={onCancel}>Back to sign in</button>}
      <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>{step > 0 && <button className="navbtn" onClick={() => setStep(step - 1)}>Back</button>}</div>
      {step === 0 && <div style={{ textAlign: 'center', marginTop: '12vh' }}><div className="orb" /><p className="label">PATHWAY AI</p><h1>Make the most of today.<br />Build a better tomorrow.</h1><p className="sub">A companion for your high school years: find what fits you, keep life simple, and grow.</p></div>}
      {step === 1 && <><h1>Your journey is yours.</h1>
        {[['You decide', 'Pathway suggests. Nothing changes until you approve it.'], ['Private by default', 'Only you see your plans and reflections unless you choose to share.'], ['Delete anytime', 'See, export or erase everything from the You tab.']].map(([t, s]) => <div className="promise" key={t}><span className="ic">✓</span><div><b>{t}</b><p className="muted small">{s}</p></div></div>)}
        <label className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28 }}><span style={{ flex: 1 }}><b>Use AI to help me</b><br /><span className="muted small">Pathway uses the configured AI model to write insights and plans from what you share. You can turn this off later.</span></span><input type="checkbox" className="switch" checked={f.aiConsent} onChange={e => set('aiConsent', e.target.checked)} /></label></>}
      {step === 2 && <><h1>What should I call you?</h1><input className="field" style={{ marginTop: 26 }} placeholder="First name" value={f.name} onChange={e => set('name', e.target.value)} aria-label="First name" autoFocus />
        <p className="sub" style={{ marginTop: 28 }}>Your grade</p><div className="seg">{[9, 10, 11, 12].map(g => <button key={g} aria-pressed={f.grade === g} onClick={() => set('grade', g)}>{g}th</button>)}</div><RegionSelect value={f.region} onChange={v=>set('region',v)} /></>}
      {step === 3 && <><h1>What lights you up?</h1><p className="sub">Pick a few. I’ll find opportunities around these.</p>
        <div className="chips">{INTERESTS.map(i => <button key={i} className="chip" aria-pressed={f.interests.includes(i)} onClick={() => set('interests', f.interests.includes(i) ? f.interests.filter(x => x !== i) : [...f.interests, i])}>{i}</button>)}</div></>}
      {step === 4 && <><h1>Something you’re reaching for?</h1><p className="sub">An aspiration, a skill, a project. Optional.</p>
        <input className="field" style={{ marginTop: 22 }} placeholder="e.g. Build my first AI app" value={f.goal} onChange={e => set('goal', e.target.value)} aria-label="Goal" />
        <div className="chips">{['Build my first AI app', 'Enter a competition', 'Start volunteering', 'Raise my grades'].map(g => <button key={g} className="chip" onClick={() => set('goal', g)}>{g}</button>)}</div></>}
      {step === 5 && <><h1>Protect your time.</h1><p className="sub">I’ll only suggest study in your window, and never touch your downtime.</p>
        <div className="rows" style={{ marginTop: 22 }}>{([['studyStart', 'Study from'], ['studyEnd', 'Until'], ['downtimeStart', 'Downtime from'], ['downtimeEnd', 'Until']] as const).map(([k, l]) => <div className="frow" key={k}><label htmlFor={k}>{l}</label><input id={k} type="time" value={f[k]} onChange={e => set(k, e.target.value)} /></div>)}</div>
        {config.data?.demoMode && <label className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}><span style={{ flex: 1 }}><b>Explore with a sample week</b><br /><span className="muted small">Pretend classes, clubs and a test, clearly labeled. Scan your real schedule anytime.</span></span><input type="checkbox" className="switch" checked={f.sampleWeek} onChange={e => set('sampleWeek', e.target.checked)} /></label>}</>}
      {step === 7 && <><h1>Keep your journey with you</h1><p className="sub">Create a private phrase to open your dashboard on any device.</p><PhraseFields phrase={f.phrase} confirmPhrase={f.confirmPhrase} onChange={set} /></>}
      {step === 6 && <><h1>Add your calendar?</h1><p className="sub">Optional. Bring classes and dates into Pathway without typing them again.</p><label htmlFor="onboard-calendar">Private iCal link</label><input id="onboard-calendar" className="field" type="password" autoComplete="off" maxLength={4096} value={calendarUrl} onChange={e => setCalendarUrl(e.target.value)} /><CalendarHelp /></>}
      <div className="grow" />
      <div className="cta"><div className="dots" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6, 7].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div><button className="btn fill lg" disabled={!ok || busy} onClick={next}>{cta}</button></div>
    </div>
  );
}
