import { useState } from 'react';
import { api } from '../lib/api';
import { SignInResult } from '../lib/types';

export function PhraseFields({ phrase, confirmPhrase, onChange }: {
  phrase: string; confirmPhrase: string; onChange: (key: 'phrase' | 'confirmPhrase', value: string) => void;
}) {
  const [show, setShow] = useState(false);
  return <>
    <div className="frow"><label htmlFor="private-phrase">Private sign-in phrase</label><input id="private-phrase" className="field" type={show ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={phrase} required minLength={12} maxLength={128} onChange={e => onChange('phrase', e.target.value)} /></div>
    <div className="frow"><label htmlFor="confirm-phrase">Enter your phrase again</label><input id="confirm-phrase" className="field" type={show ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={confirmPhrase} required minLength={12} maxLength={128} onChange={e => onChange('confirmPhrase', e.target.value)} /></div>
    <label className="frow"><span>Show phrase</span><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /></label>
    <p className="note">Choose at least 12 characters—several unrelated words work well. Capital letters and extra spaces don’t matter. Keep it private: anyone with your phrase can open your profile.</p>
    {confirmPhrase && normalize(phrase) !== normalize(confirmPhrase) && <p role="alert">The phrases do not match.</p>}
  </>;
}
export const normalize = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export const validPhrase = (phrase: string, confirmPhrase: string) => normalize(phrase).length >= 12 && phrase.length <= 128 && confirmPhrase.length <= 128 && normalize(phrase) === normalize(confirmPhrase);
export function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false), [copied, setCopied] = useState(false);
  return <div className="ob"><h1>Save your recovery code</h1><p className="sub">If you forget your private phrase, this code lets you choose a new one and keep your profile. This is the only time we show it.</p>
    <label htmlFor="recovery-code">Your recovery code</label><input id="recovery-code" className="field" value={code} readOnly onFocus={e => e.target.select()} />
    <button className="link" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy recovery code'}</button>
    <p className="note">Keep it somewhere safe and separate from your phrase. Anyone with this code can recover your profile.</p>
    <label className="frow"><span>I’ve saved my recovery code</span><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} /></label>
    <button className="btn fill" disabled={!saved} onClick={onDone}>Open my dashboard</button>
  </div>;
}
export default function SignIn({ onDone, onCreate, onRestoreLocal }: { onDone: (s: SignInResult) => void; onCreate: () => void; onRestoreLocal?: () => void }) {
  const [phrase, setPhrase] = useState(''), [recovering, setRecovering] = useState(false), [show, setShow] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState(''), [replacement, setReplacement] = useState({ phrase: '', confirmPhrase: '' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <div className="ob"><h1>{recovering ? 'Recover your profile' : 'Welcome back'}</h1><p className="sub">{recovering ? 'Use your saved recovery code and choose a new private phrase.' : 'Enter your private phrase to open your dashboard on any device.'}</p>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try { onDone(await api<SignInResult>(recovering ? '/api/auth/recover' : '/api/auth/login', { body: recovering ? { recoveryCode, credentials: replacement } : { phrase } })); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>{recovering ? <><label htmlFor="saved-recovery">Recovery code</label><input id="saved-recovery" className="field" type="password" autoComplete="off" value={recoveryCode} required maxLength={128} onChange={e => setRecoveryCode(e.target.value)} /><PhraseFields {...replacement} onChange={(key, value) => setReplacement(f => ({ ...f, [key]: value }))} /></> : <><label htmlFor="sign-in-phrase">Private sign-in phrase</label><input id="sign-in-phrase" className="field" type={show ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="none" spellCheck={false} value={phrase} required maxLength={128} onChange={e => setPhrase(e.target.value)} /><label className="frow"><span>Show phrase</span><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /></label></>}
      {error && <p role="alert">{error}</p>}
      <button className="btn fill lg" type="submit" disabled={busy || (recovering && !validPhrase(replacement.phrase, replacement.confirmPhrase))}>{busy ? 'Opening your profile…' : recovering ? 'Recover my profile' : 'Sign in'}</button>
    </form>
    <button className="link" onClick={() => { setRecovering(r => !r); setError(''); setPhrase(''); setRecoveryCode(''); setReplacement({ phrase: '', confirmPhrase: '' }); }}>{recovering ? 'Back to sign in' : 'Forgot your phrase?'}</button>
    <button className="link" onClick={onCreate}>New to Pathway? Create a profile</button>
    {onRestoreLocal && <button className="link" onClick={onRestoreLocal}>Open my existing profile on this browser</button>}
    <p className="note">Used Pathway before private phrases were added? Open your original browser profile, then go to You → Account to add a private phrase.</p>
  </div>;
}
