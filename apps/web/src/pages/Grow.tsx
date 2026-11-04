import SavedGrowthLetter from '../components/growth-map/SavedGrowthLetter';
import SkillTagReview from '../components/growth-map/SkillTagReview';
import ReviewSheet from '../components/growth-map/ReviewSheet';
import { useEffect,useState } from 'react';
import { api, download } from '../lib/api';
import { Goal, PortfolioEntry, Student, Tab } from '../lib/types';
import { fmtDay, fmtMins } from '../lib/format';
import { Ring, Sheet, Typing, toast, useLoad } from '../components/ui';

const SKILLS = ['Teamwork', 'Communication', 'Leadership', 'Problem solving', 'Coding', 'Research', 'Creativity', 'Time management'];

export default function Grow({ me, ask, go, startCapture=false, onCaptureOpened }: { me: Student; ask: (t: string) => void; go: (t: Tab) => void;startCapture?:boolean;onCaptureOpened?:()=>void }) {
  const goals = useLoad(() => api<Goal[]>('/api/goals'), []), pf = useLoad(() => api<PortfolioEntry[]>('/api/portfolio'), []);
  const [goalId, setGoalId] = useState<string | null>(null), [newGoal, setNewGoal] = useState(false), [capture, setCapture] = useState<null | { title?: string; linkedMilestoneId?:string }>(null), [captured, setCaptured] = useState<(PortfolioEntry & {linkedMilestoneId?:string}) | null>(null);
  const [savedLetter,setSavedLetter]=useState<PortfolioEntry|null>(null);
  const [tagReview,setTagReview]=useState<{type:'milestone';id:string}|null>(null);
  useEffect(()=>{if(startCapture){setCapture({});onCaptureOpened?.();}},[startCapture]);
  const [q, setQ] = useState(''), [answer, setAnswer] = useState(''), [coaching, setCoaching] = useState(false);
  if (!goals.data || !pf.data) return <div className="splash"><Typing /></div>;
  const active = goals.data.filter(g => g.status !== 'done'), monthAgo = Date.now() - 30 * 864e5;
  const steps = goals.data.flatMap(g => g.milestones).filter(m => m.status === 'done').length, logged = pf.data.filter(p => p.type!=='growth_letter'&&+new Date(p.date) > monthAgo).length;
  const story = steps || logged ? `So far you’ve finished ${steps} step${steps === 1 ? '' : 's'}${logged ? ` and captured ${logged} experience${logged === 1 ? '' : 's'} this month` : ''}.` : 'Your story starts with one small step. Pick a goal, or capture something you’ve already done.';
  const goal = goals.data.find(g => g.id === goalId);
  const pct = (g: Goal) => g.status === 'done' ? 1 : g.milestones.length ? g.milestones.filter(m => m.status === 'done').length / g.milestones.length : 0;
  const coach = async () => { if (!q.trim()) return; setCoaching(true); try { setAnswer((await api<{ answer: string }>('/api/coach', { body: { question: q } })).answer); } catch (e) { toast((e as Error).message); } setCoaching(false); };
  return (
    <>
      <div className="top"><p className="date">Grow · Prepare</p></div>
      <h1 className="display">Your growth story</h1>
      <div className="card" style={{ marginTop: 18 }}><p className="lead">{story}</p></div>
      <div className="sec"><div className="sec-h"><h2>Goals</h2><button className="link" onClick={() => setNewGoal(true)}>New goal</button></div>
        {active.length ? active.map(g => { const next = g.milestones.find(m => m.status !== 'done'); return (
          <button key={g.id} className="card tap" onClick={() => setGoalId(g.id)}><div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Ring pct={pct(g)} color="var(--peach)" size={52} width={5} /><div style={{ flex: 1 }}><b>{g.title}</b><p className="muted small">{next ? `Next: ${next.title}` : g.milestones.length ? 'All steps done' : 'No steps yet'}</p></div></div></button>); })
          : <div className="card"><p className="muted">No goals yet.</p><div className="acts"><button className="btn fill" onClick={() => setNewGoal(true)}>Add a goal</button></div></div>}</div>
      <div className="sec"><div className="sec-h"><h2>Learning companion</h2></div><div className="card"><p className="muted small">Stuck on a concept? I’ll explain, show an example and give practice. I won’t do graded work for you.</p>
        <textarea className="field" style={{ marginTop: 12 }} value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. How do Python loops work?" aria-label="Question" />
        <div className="acts"><button className="btn fill" disabled={coaching || !me.aiConsent} onClick={coach}>{coaching ? 'Explaining…' : 'Explain'}</button></div>{answer && <div className="answer">{answer}</div>}</div></div>
      <div className="sec"><div className="sec-h"><h2>Portfolio</h2><button className="link" onClick={() => setCapture({})}>Capture</button></div>
        {pf.data.length ? <><div className="rows">{pf.data.map(x => <div className="r" key={x.id}><span className="emo">{x.type==='growth_letter'?'📝':'🏅'}</span><span className="b">{x.type==='growth_letter'?<button className="link" onClick={()=>setSavedLetter(x)}>{x.title}</button>:<span className="t">{x.title}</span>}<span className="s" style={{ display: 'block' }}>{x.type==='growth_letter'?'Reflection':x.type} · {fmtDay(x.date)} · {x.visibility === 'shared' ? 'Shared with family' : 'Private'}</span></span>
          <button className="link" onClick={async () => { await api(`/api/portfolio/${x.id}`, { method: 'PATCH', body: { visibility: x.visibility === 'shared' ? 'private' : 'shared' } }); pf.reload(); }}>{x.visibility === 'shared' ? 'Make private' : 'Share'}</button></div>)}</div>
          <button className="link" style={{ marginTop: 12 }} onClick={() => download('/api/me/export', 'pathway-data.json')}>Export</button></>
          : <button className="card tap" onClick={() => setCapture({})}><b>Capture an experience</b><p className="muted small">Volunteered, built something, competed? Reflect on it and see the skills you showed.</p></button>}</div>

      {savedLetter&&<SavedGrowthLetter entry={savedLetter} onClose={()=>setSavedLetter(null)} onDeleted={()=>{setSavedLetter(null);pf.reload();}}/>}
      {goal && !tagReview && <Sheet onClose={() => setGoalId(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0 14px' }}><Ring pct={pct(goal)} color="var(--peach)" size={120} width={8}>{Math.round(pct(goal) * 100)}%</Ring><h2 className="serif" style={{ fontSize: 26, marginTop: 12, textAlign: 'center' }}>{goal.title}</h2></div>
        {goal.milestones.length > 0 && <div className="card" style={{ padding: '4px 12px' }}>{goal.milestones.map(m => <div key={m.id} className={`tl-i ${m.status === 'done' ? 'done' : ''}`} style={{ gridTemplateColumns: '30px 1fr auto' }}>
          <button className={`chk ${m.status === 'done' ? 'on' : ''}`} aria-label={`${m.status === 'done' ? 'Mark not done' : 'Mark done'}: ${m.title}`} onClick={async () => { await api(`/api/milestones/${m.id}`, { method: 'PATCH', body: { status: m.status === 'done' ? 'todo' : 'done' } }); goals.reload();if(m.status!=='done')setTagReview({type:'milestone',id:m.id}); }}>{m.status === 'done' ? '✓' : ''}</button>
          <div><div className="tt">{m.title}</div><div className="tg">{fmtMins(m.effortMin)}{m.targetDate ? ` · by ${fmtDay(m.targetDate)}` : ''}</div></div>
          {m.status === 'done' ? <button className="link" onClick={() => { setGoalId(null); setCapture({ title: m.title,linkedMilestoneId:m.id }); }}>Capture</button> : <span />}</div>)}</div>}
        {goal.status !== 'done' && me.aiConsent && <button className="btn fill lg" style={{ marginTop: 16 }} onClick={() => ask(`Break my goal "${goal.title}" (goal id ${goal.id}) into a realistic plan with effort estimates, check my free time over the next 2 weeks, and propose milestones plus this week's sessions for my approval.`)}>{goal.milestones.length ? 'Rethink my steps' : 'Break it into steps'}</button>}
        <div className="rows" style={{ marginTop: 14 }}>{goal.status !== 'done' && <button className="r" onClick={async () => { await api(`/api/goals/${goal.id}`, { method: 'PATCH', body: { status: 'done' } }); goals.reload(); setGoalId(null); setCapture({ title: goal.title }); }}><span className="b"><span className="t c-teal">I reached this goal</span></span></button>}
          <button className="r" onClick={async () => { if (!confirm('Delete this goal?')) return; await api(`/api/goals/${goal.id}`, { method: 'DELETE' }); setGoalId(null); goals.reload(); }}><span className="b"><span className="t c-rose">Delete goal</span></span></button></div></Sheet>}
      {newGoal && <GoalForm onClose={() => setNewGoal(false)} onSaved={() => { setNewGoal(false); goals.reload(); }} />}
      {capture && <CaptureForm initial={capture.title} onClose={() => setCapture(null)} onSaved={x => { setCapture(null); setCaptured({...x,linkedMilestoneId:capture?.linkedMilestoneId}); pf.reload(); }} />}
      {tagReview&&<ReviewSheet source={tagReview} onClose={()=>setTagReview(null)} onSaved={goals.reload}/>}
      {captured && <Sheet onClose={() => setCaptured(null)}><div style={{ textAlign: 'center', padding: '20px 0' }}><p style={{ fontSize: 44 }}>🏅</p><h2 className="serif" style={{ fontSize: 26 }}>Captured</h2><p className="muted" style={{ marginTop: 8 }}>{captured.title} is in your portfolio{captured.skills.length ? `, showing ${captured.skills.join(', ').toLowerCase()}` : ''}.</p></div>
        <SkillTagReview type="portfolio" id={captured.id} linkedMilestoneId={captured.linkedMilestoneId} onSaved={()=>setCaptured(null)}/><button className="btn" onClick={()=>{setCaptured(null);go('explore');}}>Explore related experiences</button></Sheet>}
    </>
  );
}

function GoalForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState('');
  const save = async () => { if (!t.trim()) return; await api('/api/goals', { body: { title: t } }); toast('Goal added'); onSaved(); };
  return <Sheet title="New goal" onClose={onClose} left={<button className="navbtn" onClick={onClose}>Cancel</button>} right={<button className="navbtn strong" onClick={save}>Add</button>}>
    <input className="field" autoFocus value={t} onChange={e => setT(e.target.value)} placeholder="e.g. Build my first AI app" aria-label="Goal" />
    <div className="chips">{['Build an app', 'Raise a grade', 'Enter a competition', 'Start volunteering', 'Learn Python'].map(g => <button key={g} className="chip" onClick={() => setT(g)}>{g}</button>)}</div></Sheet>;
}

function CaptureForm({ initial, onClose, onSaved }: { initial?: string; onClose: () => void; onSaved: (x: PortfolioEntry) => void }) {
  const [f, setF] = useState({ title: initial || '', type: 'volunteering', date: new Date().toISOString().slice(0, 10), reflection: '', skills: [] as string[], visibility: 'private' as 'private' | 'shared' });
  const save = async () => { if (!f.title.trim()) return toast('What did you do?'); onSaved(await api<PortfolioEntry>('/api/portfolio', { body: f })); };
  return <Sheet title="Capture an experience" onClose={onClose} left={<button className="navbtn" onClick={onClose}>Cancel</button>} right={<button className="navbtn strong" onClick={save}>Save</button>}>
    <input className="field" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="What did you do?" aria-label="What you did" />
    <div className="rows" style={{ marginTop: 12 }}><div className="frow"><label htmlFor="k">Kind</label><select id="k" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{['volunteering', 'project', 'competition', 'leadership', 'club', 'certificate', 'presentation', 'showcase', 'publication', 'job', 'course', 'reading', 'other'].map(c => <option key={c}>{c}</option>)}</select></div>
      <div className="frow"><label htmlFor="d">When</label><input id="d" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div></div>
    <textarea className="field" style={{ marginTop: 12 }} value={f.reflection} onChange={e => setF({ ...f, reflection: e.target.value })} placeholder="What did you learn? What surprised you?" aria-label="Reflection" />
    <p className="label" style={{ marginTop: 18 }}>SKILLS YOU SHOWED</p><div className="chips">{SKILLS.map(s => <button key={s} className="chip" aria-pressed={f.skills.includes(s)} onClick={() => setF({ ...f, skills: f.skills.includes(s) ? f.skills.filter(x => x !== s) : [...f.skills, s] })}>{s}</button>)}</div>
    <div className="rows" style={{ marginTop: 16 }}><label className="frow"><span>Share with family</span><input type="checkbox" className="switch" checked={f.visibility === 'shared'} onChange={e => setF({ ...f, visibility: e.target.checked ? 'shared' : 'private' })} /></label></div>
    <p className="note">Private by default. Saved as self-reported.</p></Sheet>;
}
