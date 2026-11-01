import { useEffect, useState } from 'react';
import { api, session, access, ApiError } from './lib/api';
import { Student, Tab } from './lib/types';
import { THEMES, Theme, applyTheme, nextTheme } from './lib/theme';
import { toast } from './components/ui';
import SignIn from './pages/SignIn';
import Onboarding from './pages/Onboarding';
import Today from './pages/Today';
import Explore from './pages/Explore';
import Buddy from './pages/Buddy';
import Grow from './pages/Grow';
import You from './pages/You';

const TABS: [Tab, string][] = [['today', 'Today'], ['explore', 'Explore'], ['buddy', 'Buddy'], ['grow', 'Grow'], ['you', 'You']];

export default function AccessGate() {
  const [ready, setReady] = useState(false), [required, setRequired] = useState(false);
  const [code, setCode] = useState(''), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(''); setRequired(false);
    Promise.all([api<{ accessRequired: boolean }>('/api/config'), api<{ student: Student | null }>('/api/auth/session')]).then(async ([config, auth]) => {
      if (!active) return;
      if (auth.student || !config.accessRequired) { setReady(true); return; }
      if (access.get()) {
        try { await api('/api/access', { body: { code: access.get() } }); if (active) setReady(true); return; }
        catch (e) { if (!(e instanceof ApiError) || e.status !== 401) throw e; access.clear(); }
      }
      if (active) setRequired(true);
    }).catch(() => { if (active) setError('Could not open Pathway. Your saved profile is safe. Please try again.'); });
    return () => { active = false; };
  }, [attempt]);
  if (ready) return <App onSignedOut={() => { setReady(false); setAttempt(a => a + 1); }} />;
  return <main className="splash"><form onSubmit={async e => {
    e.preventDefault(); setError('');
    try { const clean = code.trim(); await api('/api/access', { body: { code: clean } }); access.set(clean); setReady(true); }
    catch (e) { setError((e as Error).message); }
  }}><h1>Welcome to Pathway</h1>{required && <><p>Enter your tester access code to continue.</p><label htmlFor="access-code">Access code</label><input id="access-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required maxLength={256} /><button type="submit" className="btn">Continue</button></>}{error && <p role="alert">{error}</p>}{error && !required && <button className="btn" type="button" onClick={() => setAttempt(a => a + 1)}>Try again</button>}</form></main>;
}

function App({ onSignedOut }: { onSignedOut: () => void }) {
  const [me, setMe] = useState<Student | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('today');
  const [buddySeed, setBuddySeed] = useState<string | null>(null);
  const [buddyKey, setBuddyKey] = useState(0);
  const [creating, setCreating] = useState(false), [loadError, setLoadError] = useState(''), [attempt, setAttempt] = useState(0);
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
  if (loadError) return <main className="splash"><p role="alert">{loadError}</p><button className="btn" onClick={() => setAttempt(a => a + 1)}>Try again</button></main>;
  if (me === undefined) return <div className="splash"><p className="muted">Opening Pathway…</p></div>;
  const signedIn = (s: Student) => { session.set(s.id); setCreating(false); setTab('today'); setMe(s); };
  if (me === null) return creating ? <Onboarding onDone={signedIn} onCancel={() => setCreating(false)} /> : <SignIn onDone={signedIn} onCreate={() => setCreating(true)} onChangeCode={() => { access.clear(); onSignedOut(); }} />;
  const ask = (text: string) => { setBuddySeed(text); setTab('buddy'); };
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
        {tab === 'buddy' && <Buddy key={buddyKey} me={me} seed={buddySeed} clearSeed={() => setBuddySeed(null)} />}
        {tab === 'grow' && <Grow me={me} ask={ask} go={go} />}
        {tab === 'you' && <You me={me} setMe={setMe} onSignOut={onSignedOut} />}
      </main>
    </>
  );
}
