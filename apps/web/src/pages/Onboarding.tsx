import { useState } from 'react';
import { api } from '../lib/api';
import { Student } from '../lib/types';
import { AccountFields } from './SignIn';
import { toast } from '../components/ui';

const INTERESTS = ['AI', 'Coding', 'Robotics', 'Engineering', 'Science', 'Medicine', 'Space', 'Math', 'Business', 'Entrepreneurship', 'Art', 'Writing', 'Music', 'Sports', 'Volunteering', 'Climate', 'Debate'];

/** Student DNA intake: few, high-value questions; skippable; no mandatory calendar/email connection. */
export default function Onboarding({ onDone, onCancel }: { onDone: (s: Student) => void; onCancel?: () => void }) {
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [f, setF] = useState({ username: '', password: '', name: '', grade: 10, interests: [] as string[], goal: '', aiConsent: true, studyStart: '16:00', studyEnd: '21:00', downtimeStart: '21:00', downtimeEnd: '23:00', sampleWeek: true });
  const set = (k: keyof typeof f, v: unknown) => setF(x => ({ ...x, [k]: v }));
  const finish = async () => { const { username, password, ...profile } = f; setBusy(true); try { onDone(await api<Student>('/api/students', { body: { ...profile, credentials: { username, password }, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } })); } catch (e) { toast((e as Error).message); setBusy(false); } };
  const next = () => (step === 6 ? finish() : setStep(step + 1));
  const ok = step === 2 ? f.name.trim().length > 0 : step !== 6 || (/^[a-zA-Z0-9_]{3,30}$/.test(f.username) && f.password.length >= 12 && f.password.length <= 128);
  const cta = ['Get started', 'Continue', 'Continue', 'Continue', f.goal.trim() ? 'Continue' : 'Skip for now', 'Continue', 'Create account and start my day'][step];
  return (
    <div className="ob">
      {onCancel && <button className="link" disabled={busy} onClick={onCancel}>Back to sign in</button>}
      <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>{step > 0 && <button className="navbtn" onClick={() => setStep(step - 1)}>Back</button>}</div>
      {step === 0 && <div style={{ textAlign: 'center', marginTop: '12vh' }}><div className="orb" /><p className="label">PATHWAY AI</p><h1>Make the most of today.<br />Build a better tomorrow.</h1><p className="sub">A companion for your high school years: find what fits you, keep life simple, and grow.</p></div>}
      {step === 1 && <><h1>Your journey is yours.</h1>
        {[['You decide', 'Pathway suggests. Nothing changes until you approve it.'], ['Private by default', 'Only you see your plans and reflections unless you choose to share.'], ['Delete anytime', 'See, export or erase everything from the You tab.']].map(([t, s]) => <div className="promise" key={t}><span className="ic">✓</span><div><b>{t}</b><p className="muted small">{s}</p></div></div>)}
        <label className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28 }}><span style={{ flex: 1 }}><b>Use AI to help me</b><br /><span className="muted small">Pathway uses the configured AI model to write insights and plans from what you share. You can turn this off later.</span></span><input type="checkbox" className="switch" checked={f.aiConsent} onChange={e => set('aiConsent', e.target.checked)} /></label></>}
      {step === 2 && <><h1>What should I call you?</h1><input className="field" style={{ marginTop: 26 }} placeholder="First name" value={f.name} onChange={e => set('name', e.target.value)} aria-label="First name" autoFocus />
        <p className="sub" style={{ marginTop: 28 }}>Your grade</p><div className="seg">{[9, 10, 11, 12].map(g => <button key={g} aria-pressed={f.grade === g} onClick={() => set('grade', g)}>{g}th</button>)}</div></>}
      {step === 3 && <><h1>What lights you up?</h1><p className="sub">Pick a few. I’ll find opportunities around these.</p>
        <div className="chips">{INTERESTS.map(i => <button key={i} className="chip" aria-pressed={f.interests.includes(i)} onClick={() => set('interests', f.interests.includes(i) ? f.interests.filter(x => x !== i) : [...f.interests, i])}>{i}</button>)}</div></>}
      {step === 4 && <><h1>Something you’re reaching for?</h1><p className="sub">An aspiration, a skill, a project. Optional.</p>
        <input className="field" style={{ marginTop: 22 }} placeholder="e.g. Build my first AI app" value={f.goal} onChange={e => set('goal', e.target.value)} aria-label="Goal" />
        <div className="chips">{['Build my first AI app', 'Enter a competition', 'Start volunteering', 'Raise my grades'].map(g => <button key={g} className="chip" onClick={() => set('goal', g)}>{g}</button>)}</div></>}
      {step === 5 && <><h1>Protect your time.</h1><p className="sub">I’ll only suggest study in your window, and never touch your downtime.</p>
        <div className="rows" style={{ marginTop: 22 }}>{([['studyStart', 'Study from'], ['studyEnd', 'Until'], ['downtimeStart', 'Downtime from'], ['downtimeEnd', 'Until']] as const).map(([k, l]) => <div className="frow" key={k}><label htmlFor={k}>{l}</label><input id={k} type="time" value={f[k]} onChange={e => set(k, e.target.value)} /></div>)}</div>
        <label className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}><span style={{ flex: 1 }}><b>Explore with a sample week</b><br /><span className="muted small">Pretend classes, clubs and a test, clearly labeled. Scan your real schedule anytime.</span></span><input type="checkbox" className="switch" checked={f.sampleWeek} onChange={e => set('sampleWeek', e.target.checked)} /></label></>}
      {step === 6 && <><h1>Keep your journey with you</h1><p className="sub">Choose a sign-in to open your dashboard on any device.</p><AccountFields username={f.username} password={f.password} creating onChange={set} /></>}
      <div className="grow" />
      <div className="cta"><div className="dots" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div><button className="btn fill lg" disabled={!ok || busy} onClick={next}>{cta}</button></div>
    </div>
  );
}
