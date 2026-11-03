import RegionSelect from '../components/RegionSelect';
import Notifications from '../components/Notifications';
import Calendars from '../components/Calendars';
import DiscoveryPreferencesEditor from '../components/DiscoveryPreferencesEditor';
import { useState } from 'react';
import { api, download, session, access } from '../lib/api';
import { AIHealth, Student } from '../lib/types';
import { Sheet, toast, useLoad } from '../components/ui';
import { PhraseFields, validPhrase, RecoveryCode } from './SignIn';
import { SignInResult } from '../lib/types';
import NewsSheet from '../components/NewsSheet';
import { THEMES, applyTheme } from '../lib/theme';

export default function You({ me, setMe, onSignOut }: { me: Student; setMe: (s: Student | null) => void; onSignOut?: () => void }) {
  const config = useLoad(() => api<{ feedbackUrl: string | null }>('/api/config'), []);
  const [account, setAccount] = useState({ phrase: '', confirmPhrase: '' }), [accountError, setAccountError] = useState(''), [accountBusy, setAccountBusy] = useState(false);
  const [changingPhrase, setChangingPhrase] = useState(false), [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const health = useLoad(() => api<AIHealth>('/api/health'), []);
  const [edit, setEdit] = useState(false), [log, setLog] = useState(false), [news, setNews] = useState(false),[discoveryEdit,setDiscoveryEdit]=useState(false);
  const patch = async (body: Record<string, unknown>) => { try { setMe(await api<Student>('/api/me', { method: 'PATCH', body })); toast('Saved'); } catch (e) { toast((e as Error).message); } };
  const prov = (k: string) => me.provenance[k] ? `${me.provenance[k].src} · ${new Date(me.provenance[k].at).toLocaleDateString()}` : '';
  const a = me.availability;
  return (
    <>
      <div className="top"><p className="date">Your Student DNA</p><button className="link" onClick={() => setEdit(true)}>Edit</button></div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 10 }}><div className="avatar" style={{ width: 64, height: 64, fontSize: 26 }}>{me.name[0]?.toUpperCase()}</div><div><h1 className="display" style={{ margin: 0 }}>{me.name}</h1><p className="muted">{me.grade}th grade</p></div></div>
      <div className="sec"><div className="rows">
        <Row t="Interests" s={me.interests.join(', ') || 'Not set'} p={prov('interests')} />
        <Row t="Region" s={me.region === 'virtual' ? 'Virtual only' : me.region || 'Not shared'} />
        <Row t="Skills" s={me.skills.join(', ') || 'Not set yet'} p={prov('skills')} />
        <Row t="Availability" s={a ? `Study ${a.studyStart}–${a.studyEnd}, up to ${a.maxStudyMin} min a day. Downtime ${a.downtimeStart}–${a.downtimeEnd}.` : 'Not set'} p={prov('availability')} />
      </div><p className="note">Pathway only uses what you tell it. It doesn’t guess sensitive things about you.</p></div>
      <Calendars />
      <Notifications />
      <div className="sec"><h2>Opportunity preferences</h2><p className="note">Choose your interests, location, time and optional project goals.</p><button className="btn" onClick={()=>setDiscoveryEdit(true)}>Edit opportunity preferences</button></div>

      <div className="sec"><div className="sec-h"><h2>Account</h2></div>
        {recoveryCode ? <RecoveryCode code={recoveryCode} onDone={() => { setRecoveryCode(null); setChangingPhrase(false); }} /> : <>
          {me.hasSignIn && <><p>Your private phrase opens this profile on any device.</p><button className="link" onClick={() => setChangingPhrase(c => !c)}>{changingPhrase ? 'Cancel' : 'Change private phrase'}</button><button className="link" onClick={async () => {
            try {
              const subscription = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? await (await navigator.serviceWorker.getRegistration())?.pushManager?.getSubscription() : null;
              await api('/api/auth/logout', { method: 'POST', ...(subscription ? { body: { endpoint: subscription.endpoint } } : {}) });
              if (subscription) await subscription.unsubscribe().catch(() => false);
              session.clear(); access.clear(); setMe(null); onSignOut?.(); }
            catch (e) { toast((e as Error).message); }
          }}>Sign out</button></>}
          {(!me.hasSignIn || changingPhrase) && <form onSubmit={async e => {
            e.preventDefault(); setAccountBusy(true); setAccountError('');
            try {
              const { recoveryCode: code, ...profile } = await api<SignInResult>(me.hasSignIn ? '/api/auth/change-phrase' : '/api/auth/link', { body: account });
              setMe(profile); setAccount({ phrase: '', confirmPhrase: '' }); setRecoveryCode(code || null);
            } catch (e) { setAccountError((e as Error).message); } finally { setAccountBusy(false); }
          }}><p>{me.hasSignIn ? 'Choose a new phrase. This signs out your other devices, turns off notifications, and replaces your old recovery code.' : 'Keep this profile and open it on any device with a private phrase.'}</p><PhraseFields {...account} onChange={(key, value) => setAccount(a => ({ ...a, [key]: value }))} />
            {accountError && <p role="alert">{accountError}</p>}<button className="btn" disabled={accountBusy || !validPhrase(account.phrase, account.confirmPhrase)} type="submit">{accountBusy ? 'Saving…' : me.hasSignIn ? 'Save new phrase' : 'Enable sign-in'}</button></form>}
        </>}
      </div>
      <div className="sec"><div className="sec-h"><h2>My Day</h2></div><div className="rows">
        <label className="frow"><span>Word of the day</span><input type="checkbox" className="switch" checked={me.settings.showWord} onChange={e => patch({ settings: { showWord: e.target.checked } })} /></label>
        <label className="frow"><span>News for you</span><input type="checkbox" className="switch" checked={me.settings.showNews} onChange={e => patch({ settings: { showNews: e.target.checked } })} /></label>
        <button className="r" onClick={() => setNews(true)}><span className="b"><span className="t">News topics</span><span className="s" style={{ display: 'block' }}>{me.settings.newsTopics?.join(', ') || 'Matches your interests'}</span></span></button></div>
        <p className="note">Headlines always come from a named source with a link. Pathway never writes news itself.</p></div>
      <div className="sec"><div className="sec-h"><h2>Appearance</h2></div><div className="seg" role="radiogroup" aria-label="Appearance">{THEMES.map(([k, l, i]) => <button key={k} role="radio" aria-checked={me.settings.theme === k} aria-pressed={me.settings.theme === k} onClick={() => { applyTheme(k); patch({ settings: { theme: k } }); }}>{i} {l}</button>)}</div></div>
      <div className="sec"><div className="sec-h"><h2>Privacy</h2></div><div className="rows">
        <label className="frow"><span>Use AI to help me</span><input type="checkbox" className="switch" aria-describedby="ai-status" checked={me.aiConsent} onChange={e => patch({ aiConsent: e.target.checked })} /></label>
        <p className="note" id="ai-status">{health.data ? health.data.aiEnabled ? `${me.aiConsent ? 'AI help is on' : 'AI help is off'}. ${health.data.provider === 'ollama' ? 'Local AI is configured for testing.' : 'Your AI provider is configured.'}` : 'AI is not configured on this server yet. Set up a provider and restart the server before testing.' : health.error ? 'Could not check AI configuration. Reopen this page to try again.' : 'Checking AI configuration…'}</p>
        <label className="frow"><span>Voice</span><input type="checkbox" className="switch" checked={me.settings.voice} aria-describedby="voice-privacy" onChange={e => patch({ settings: { voice: e.target.checked } })} /></label>
        <p className="note" id="voice-privacy">No audio is recorded or stored by Pathway; your browser may process speech with its provider.</p>
        <div className="frow"><span>Family sharing</span><span className="muted small">Only items you mark shared</span></div>
        <button className="r" onClick={() => setLog(true)}><span className="b"><span className="t">Activity log</span></span></button></div></div>
      <div className="sec"><div className="sec-h"><h2>Your data</h2></div><div className="rows">
        <button className="r" onClick={() => download('/api/me/export', 'pathway-my-data.json')}><span className="b"><span className="t" style={{ color: 'var(--peri)' }}>Export my data</span></span></button>
        <button className="r" onClick={async () => { if (!confirm('Delete everything in Pathway? This can’t be undone.')) return; await api('/api/me', { method: 'DELETE' }); session.clear(); access.clear(); setMe(null); onSignOut?.(); }}><span className="b"><span className="t c-rose">Delete everything</span></span></button></div></div>
      {config.data?.feedbackUrl && <div className="sec"><a className="link" href={config.data.feedbackUrl} target="_blank" rel="noopener noreferrer">Send feedback</a></div>}
      {edit && <EditSheet me={me} onClose={() => setEdit(false)} onSave={async b => { await patch(b); setEdit(false); }} />}
      {discoveryEdit&&<DiscoveryPreferencesEditor me={me} onSaved={setMe} onClose={()=>setDiscoveryEdit(false)}/>}
      {log && <AuditSheet onClose={() => setLog(false)} />}
      {news && <NewsSheet me={me} setMe={s2 => setMe(s2)} onClose={() => setNews(false)} ask={() => setNews(false)} />}
    </>
  );
}
const Row = ({ t, s, p }: { t: string; s: string; p?: string }) => <div className="r"><span className="b"><span className="t">{t}</span><span className="s" style={{ display: 'block' }}>{s}</span>{p && <span className="tiny" style={{ display: 'block', marginTop: 4 }}>{p}</span>}</span></div>;

function EditSheet({ me, onClose, onSave }: { me: Student; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const a = me.availability || { studyStart: '16:00', studyEnd: '21:00', maxStudyMin: 120, downtimeStart: '21:00', downtimeEnd: '23:00' };
  const [f, setF] = useState({ region: me.region || '', name: me.name, grade: me.grade, interests: me.interests.join(', '), skills: me.skills.join(', '), location: me.location, budget: me.budget, format: me.format, ...a });
  const list = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
  const save = () => onSave({ region: f.region, name: f.name, grade: Number(f.grade), interests: list(f.interests), skills: list(f.skills), location: f.location, budget: f.budget, format: f.format, availability: { studyStart: f.studyStart, studyEnd: f.studyEnd, maxStudyMin: Number(f.maxStudyMin), downtimeStart: f.downtimeStart, downtimeEnd: f.downtimeEnd } });
  const inp = (k: keyof typeof f, l: string, type = 'text') => <div className="frow"><label htmlFor={k}>{l}</label><input id={k} type={type} value={String(f[k])} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>;
  return <Sheet title="Edit your DNA" onClose={onClose} left={<button className="navbtn" onClick={onClose}>Cancel</button>} right={<button className="navbtn strong" onClick={save}>Save</button>}>
    <div className="rows">{inp('name', 'Name')}{inp('grade', 'Grade', 'number')}{inp('interests', 'Interests')}{inp('skills', 'Skills')}{inp('location', 'Area (broad)')}<RegionSelect value={f.region} onChange={v=>setF({...f,region:v})} /></div>
    <p className="label" style={{ margin: '20px 2px 8px' }}>AVAILABILITY</p><div className="rows">{inp('studyStart', 'Study from', 'time')}{inp('studyEnd', 'Until', 'time')}{inp('maxStudyMin', 'Most per day (min)', 'number')}{inp('downtimeStart', 'Downtime from', 'time')}{inp('downtimeEnd', 'Until', 'time')}</div>
    <p className="label" style={{ margin: '20px 2px 8px' }}>OPPORTUNITIES</p><div className="rows">
      <div className="frow"><label htmlFor="b">Budget</label><select id="b" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value })}><option value="free">Free only</option><option value="any">Any</option></select></div>
      <div className="frow"><label htmlFor="fm">Format</label><select id="fm" value={f.format} onChange={e => setF({ ...f, format: e.target.value })}><option value="any">Any</option><option value="virtual">Online only</option></select></div></div></Sheet>;
}

function AuditSheet({ onClose }: { onClose: () => void }) {
  const { data } = useLoad(() => api<{ id: string; actor: string; event: string; record: string; at: string }[]>('/api/audit'), []);
  return <Sheet title="Activity log" onClose={onClose}><div className="rows">{(data || []).map(e => <div className="r" key={e.id}><span className="b"><span className="t small">{e.event}{e.record ? `: ${e.record}` : ''}</span><span className="s" style={{ display: 'block' }}>{e.actor === 'student' ? 'You' : 'Pathway'} · {new Date(e.at).toLocaleString()}</span></span></div>)}</div></Sheet>;
}
