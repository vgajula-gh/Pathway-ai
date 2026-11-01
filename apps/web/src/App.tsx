import { useEffect, useState } from 'react';
import { api, session, access, ApiError } from './lib/api';
import { Student, Tab } from './lib/types';
import { THEMES, Theme, applyTheme, nextTheme } from './lib/theme';
import { toast } from './components/ui';
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
  useEffect(() => { api<{ accessRequired: boolean }>('/api/config').then(async config => {
    if (!config.accessRequired) { setReady(true); return; }
    if (access.get()) {
      try { await api('/api/access', { body: { code: access.get() } }); setReady(true); return; } catch { /* Ask again if revoked. */ }
    }
    setRequired(true);
  }).catch(() => setError('Could not open Pathway. Refresh to try again.')); }, []);
  if (ready) return <App />;
  return <main className="splash"><form onSubmit={async e => {
    e.preventDefault(); setError('');
    try { const clean = code.trim(); await api('/api/access', { body: { code: clean } }); access.set(clean); setReady(true); }
    catch (e) { setError((e as Error).message); }
  }}><h1>Welcome to Pathway</h1>{required && <><p>Enter your access code to get started.</p><label htmlFor="access-code">Access code</label><input id="access-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required maxLength={256} /><button type="submit" className="btn">Continue</button></>}{error && <p role="alert">{error}</p>}</form></main>;
}

function App() {
  const [me, setMe] = useState<Student | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>(() => { const value = new URLSearchParams(window.location.search).get('tab'); return ['today', 'explore', 'buddy', 'grow', 'you'].includes(value || '') ? value as Tab : 'today'; });
  const [startupError, setStartupError] = useState(''), [attempt, setAttempt] = useState(0);
  const [buddySeed, setBuddySeed] = useState<string | null>(null);
  const [buddyKey, setBuddyKey] = useState(0);
  useEffect(() => { if (!session.get()) { setMe(null); return; } setStartupError(''); api<Student>('/api/me').then(setMe).catch(e => { if (e instanceof ApiError && e.status === 401) { session.clear(); setMe(null); } else setStartupError('Could not load your dashboard. Connect to the internet and try again. Your profile is still saved.'); }); }, [attempt]);
  useEffect(() => { document.body.dataset.tab = tab; window.scrollTo(0, 0); }, [tab]);
  useEffect(() => { applyTheme((me?.settings.theme || 'dusk') as Theme); }, [me?.settings.theme]);
  if (startupError) return <main className="splash"><p role="alert">{startupError}</p><button className="btn" onClick={() => setAttempt(a => a + 1)}>Try again</button></main>;
  if (me === undefined) return <div className="splash"><p className="muted">Opening Pathway…</p></div>;
  if (me === null) return <Onboarding onDone={s => { session.set(s.id); setMe(s); }} />;
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
        {tab === 'you' && <You me={me} setMe={setMe} />}
      </main>
    </>
  );
}
