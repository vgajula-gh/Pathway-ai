import { useEffect, useState } from 'react';
import { api, session, access, ApiError } from './lib/api';
import { Student, Tab, SignInResult } from './lib/types';
import { THEMES, Theme, applyTheme, nextTheme } from './lib/theme';
import { toast } from './components/ui';
import SignIn, { RecoveryCode } from './pages/SignIn';
import Onboarding from './pages/Onboarding';
import Today from './pages/Today';
import Explore from './pages/Explore';
import Buddy from './pages/Buddy';
import Grow from './pages/Grow';
import You from './pages/You';

const TABS: [Tab, string][] = [['today', 'Today'], ['explore', 'Explore'], ['buddy', 'Buddy'], ['grow', 'Grow'], ['you', 'You']];

function InvitationGate({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  const [ready, setReady] = useState(false), [required, setRequired] = useState(false);
  const [code, setCode] = useState(''), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(''); setRequired(false);
    api<{ accessRequired: boolean }>('/api/config').then(async config => {
      if (!active) return;
      if (!config.accessRequired) { setReady(true); return; }
      if (access.get()) {
        try { await api('/api/access', { body: { code: access.get() } }); if (active) setReady(true); return; }
        catch (e) { if (!(e instanceof ApiError) || e.status !== 401) throw e; access.clear(); }
      }
      if (active) setRequired(true);
    }).catch(() => { if (active) setError('Could not open Pathway. Your saved profile is safe. Please try again.'); });
    return () => { active = false; };
  }, [attempt]);
  if (ready) return <>{children}</>;
  return <main className="splash"><form onSubmit={async e => {
    e.preventDefault(); setError('');
    try { const clean = code.trim(); await api('/api/access', { body: { code: clean } }); access.set(clean); setReady(true); }
    catch (e) { setError((e as Error).message); }
  }}><h1>Your invitation to Pathway</h1><button className="link" type="button" onClick={onBack}>Back to sign in</button>{required && <><p>Enter your tester access code to continue.</p><label htmlFor="access-code">Access code</label><input id="access-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required maxLength={256} /><button type="submit" className="btn">Continue</button></>}{error && <p role="alert">{error}</p>}{error && !required && <button className="btn" type="button" onClick={() => setAttempt(a => a + 1)}>Try again</button>}</form></main>;
}

const requestedTab = (): Tab => { const value = new URLSearchParams(window.location?.search).get('tab'); return ['today', 'explore', 'buddy', 'grow', 'you'].includes(value || '') ? value as Tab : 'today'; };

export default function App() {
  const [me, setMe] = useState<Student | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>(requestedTab);
  const [buddyScope,setBuddyScope]=useState<string|undefined>();
  const [buddySeed, setBuddySeed] = useState<string | null>(null);
  const [buddyKey, setBuddyKey] = useState(0);
  const [creating, setCreating] = useState(false), [restoring, setRestoring] = useState(false), [pending, setPending] = useState<SignInResult | null>(null), [loadError, setLoadError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoadError(''); setMe(undefined);
    (async () => {
      const auth = await api<{ student: Student | null }>('/api/auth/session');
      if (!active) return;
      if (auth.student) { session.set(auth.student.id); setMe(auth.student); return; }
      if (!session.get()) { setMe(null); return; }
      // Old browser-only profiles can be linked from You without losing data.
      try { const s = await api<Student>('/api/me'); if (active) setMe(s); }
      catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) { setMe(null); return; }
        throw e;
      }
    })().catch(() => { if (active) setLoadError('Could not load your dashboard. Your saved profile is safe. Please try again.'); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => { document.body.dataset.tab = tab; window.scrollTo(0, 0); }, [tab]);
  useEffect(() => { applyTheme((me?.settings.theme || 'dusk') as Theme); }, [me?.settings.theme]);
  const onSignedOut = () => { setCreating(false); setRestoring(false); setMe(null); };
  const openDashboard = (s: Student) => { session.set(s.id); setCreating(false); setRestoring(false); setTab(creating ? 'explore' : requestedTab()); setMe(s); };
  const signedIn = (s: SignInResult) => { if (s.recoveryCode) setPending(s); else openDashboard(s); };
  if (pending?.recoveryCode) return <RecoveryCode code={pending.recoveryCode} onDone={() => { const { recoveryCode: _, ...profile } = pending; setPending(null); openDashboard(profile); }} />;
  if (loadError) return <main className="splash"><p role="alert">{loadError}</p><button className="btn" onClick={() => setAttempt(a => a + 1)}>Try again</button></main>;
  if (me === undefined) return <div className="splash"><p className="muted">Opening Pathway…</p></div>;
  if (me === null) {
    if (creating) return <InvitationGate onBack={() => setCreating(false)}><Onboarding onDone={signedIn} onCancel={() => setCreating(false)} /></InvitationGate>;
    if (restoring) return <InvitationGate onBack={() => setRestoring(false)}><RestoreProfile onDone={openDashboard} onBack={() => setRestoring(false)} /></InvitationGate>;
    return <SignIn onDone={signedIn} onCreate={() => setCreating(true)} onRestoreLocal={session.get() ? () => setRestoring(true) : undefined} />;
  }
  const ask = (text: string, opportunityId?: string) => { setBuddyScope(opportunityId); setBuddySeed(text); setTab('buddy'); };
  const go = (t: Tab) => { if (t === 'buddy') setBuddyKey(k => k + 1); setTab(t); };
  const theme = (me.settings.theme || 'dusk') as Theme, th = THEMES.find(t => t[0] === theme)!;
  const cycleTheme = async () => { const t = nextTheme(theme); setMe({ ...me, settings: { ...me.settings, theme: t } }); toast(`Appearance: ${THEMES.find(x => x[0] === t)![1]}`); await api('/api/me', { method: 'PATCH', body: { settings: { theme: t } } }); };
  return (
    <>
      <header className="appbar">
        <div className="row1"><div className="brand"><span className="o" aria-hidden="true" />Pathway</div>
          <div className="tools"><button className="iconbtn" onClick={cycleTheme} aria-label={`Appearance: ${th[1]}. Tap to change`}>{th[2]}</button><button className="avatar" onClick={() => go('you')} aria-label="You">{me.name[0]?.toUpperCase()}</button></div></div>
        <nav className="navpills" role="tablist" aria-label="Sections">{TABS.map(([k, l]) => <button key={k} className="navpill" role="tab" aria-selected={tab === k} onClick={() => go(k)}><span>{l}</span></button>)}</nav>
      </header>
      <main>
        {tab === 'today' && <Today me={me} go={go} ask={ask} setMe={setMe} />}
        {tab === 'explore' && <Explore me={me} ask={ask} />}
        {tab === 'buddy' && <Buddy key={buddyKey} me={me} seed={buddySeed} opportunityId={buddyScope} clearSeed={() => {setBuddySeed(null);setBuddyScope(undefined);}} />}
        {tab === 'grow' && <Grow me={me} ask={ask} go={go} />}
        {tab === 'you' && <You me={me} setMe={setMe} onSignOut={onSignedOut} />}
      </main>
    </>
  );
}

function RestoreProfile({ onDone, onBack }: { onDone: (s: Student) => void; onBack: () => void }) {
  const [error, setError] = useState('');
  useEffect(() => { let active = true; api<Student>('/api/me').then(s => { if (active) onDone(s); }).catch(() => { if (active) setError('Could not open that browser profile. Use its original invitation code, or sign in with your private phrase.'); }); return () => { active = false; }; }, []);
  return <main className="splash"><p role={error ? 'alert' : undefined}>{error || 'Opening your existing profile…'}</p>{error && <button className="btn" onClick={onBack}>Back to sign in</button>}</main>;
}
