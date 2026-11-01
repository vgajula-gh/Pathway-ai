import { useState } from 'react';
import { api } from '../lib/api';
import { Student } from '../lib/types';

export function AccountFields({ username, password, onChange, creating = false }: {
  username: string; password: string; onChange: (key: 'username' | 'password', value: string) => void; creating?: boolean;
}) {
  return <>
    <div className="frow"><label htmlFor="account-username">Username</label><input id="account-username" className="field" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" onChange={e => onChange('username', e.target.value)} /></div>
    <div className="frow"><label htmlFor="account-password">Password</label><input id="account-password" className="field" type="password" autoComplete={creating ? 'new-password' : 'current-password'} value={password} required minLength={12} maxLength={128} onChange={e => onChange('password', e.target.value)} /></div>
    {creating && <p className="note">Use a username with 3–30 letters, numbers or underscores and a password with at least 12 characters. You don’t need to use your real name. Save these somewhere safe; password recovery isn’t available yet.</p>}
  </>;
}
export default function SignIn({ onDone, onCreate, onChangeCode }: { onDone: (s: Student) => void; onCreate: () => void; onChangeCode?: () => void }) {
  const [fields, setFields] = useState({ username: '', password: '' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <div className="ob"><h1>Welcome back</h1><p className="sub">Sign in to pick up where you left off.</p>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try { onDone(await api<Student>('/api/auth/login', { body: fields })); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}><AccountFields {...fields} onChange={(key, value) => setFields(f => ({ ...f, [key]: value }))} />
      {error && <p role="alert">{error}</p>}
      <button className="btn fill lg" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <button className="link" onClick={onCreate}>New to Pathway? Create a profile</button>
    {onChangeCode && <button className="link" onClick={onChangeCode}>Use a different access code</button>}
    <p className="note">Already used Pathway before sign-in was added? Open it in your original browser and go to You → Account to add a username and password to that profile.</p>
  </div>;
}
