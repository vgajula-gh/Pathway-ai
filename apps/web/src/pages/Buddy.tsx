import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { ChatMessage, Conversation, Proposal, Student } from '../lib/types';
import { fmtDay } from '../lib/format';
import { Typing, toast, useLoad } from '../components/ui';
import ProposalReview, { actionLine } from '../components/ProposalReview';
import ScanSheet from './ScanSheet';

const SUGG = [['📚', 'I have a biology exam Friday and soccer Wednesday'], ['🏆', 'Find a hackathon I could enter'], ['😮‍💨', 'My week feels like too much'], ['🤖', 'Help me start an AI project']];

/** Buddy: a companion home (orb, starters, earlier chats) and conversation threads. New topics start new threads. */
export default function Buddy({ me, seed, clearSeed }: { me: Student; seed: string | null; clearSeed: () => void }) {
  const convos = useLoad(() => api<Conversation[]>('/api/buddy/conversations'), []);
  const [active, setActive] = useState<string | null>(null), [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [props, setProps] = useState<Record<string, Proposal>>({}), [review, setReview] = useState<Proposal | null>(null), [scan, setScan] = useState(false);
  const inChat = active !== null || busy, seeded = useRef(false), input = useRef<HTMLTextAreaElement>(null);
  const open = async (id: string) => { setActive(id); setMsgs(await api<ChatMessage[]>(`/api/buddy/conversations/${id}/messages`)); };
  const send = async (t: string, fresh: boolean) => {
    if (!t.trim() || busy) return; setBusy(true); setText('');
    const convId = fresh ? undefined : active || undefined;
    if (fresh) { setActive(null); setMsgs([]); }
    setMsgs(m => [...(fresh ? [] : m), { id: 'tmp', role: 'user', content: t }]);
    try { const r = await api<{ conversationId: string }>('/api/buddy/messages', { body: { text: t, conversationId: convId } }); await open(r.conversationId); convos.reload(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { if (seed && !seeded.current) { seeded.current = true; send(seed, true); clearSeed(); } }, [seed]); // eslint-disable-line
  useEffect(() => { msgs.flatMap(m => m.proposalIds || []).filter(id => !props[id]).forEach(id => api<Proposal>(`/api/proposals/${id}`).then(p => setProps(x => ({ ...x, [id]: p })))); if (inChat) window.scrollTo(0, document.body.scrollHeight); }, [msgs]); // eslint-disable-line
  const h = new Date().getHours(), hi = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Hey';
  const last = convos.data?.[0];
  return (
    <>
      {!inChat ? <div className="bhome">
        <div className="hello"><button className="orb big" onClick={() => input.current?.focus()} aria-label="Buddy" /><h1>{hi}, {me.name}.<br />What’s on your mind?</h1>
          <p className="muted" style={{ marginTop: 10 }}>I’m your companion for school, goals and everything in between. I’ll always check with you before changing anything.</p></div>
        {last && <button className="card tap" style={{ marginTop: 20 }} onClick={() => open(last.id)}><p className="label">PICK UP WHERE YOU LEFT OFF</p><p style={{ marginTop: 6, fontWeight: 500 }}>{last.title}</p><p className="muted small">{last.messageCount} messages · tap to continue</p></button>}
        <div className="sec" style={{ marginTop: 22 }}><div className="sec-h"><h2>Try asking</h2></div><div className="sugg" style={{ marginTop: 0 }}>{SUGG.map(([e, q]) => <button key={q} onClick={() => send(q, true)}>{e}  {q}</button>)}</div></div>
        {(convos.data?.length || 0) > 1 && <div className="sec recent"><div className="sec-h"><h2>Earlier chats</h2></div><div className="rows">{convos.data!.slice(1, 6).map(c => <button key={c.id} className="r" onClick={() => open(c.id)}><span className="b"><span className="t">{c.title}</span><span className="s" style={{ display: 'block' }}>{fmtDay(c.updatedAt.slice(0, 10))}</span></span></button>)}</div></div>}
        {!me.aiConsent && <p className="note" style={{ textAlign: 'center' }}>AI help is turned off. Turn it on in You › Privacy.</p>}
      </div> : <>
        <div className="chathead"><button className="home" onClick={() => { setActive(null); setMsgs([]); window.scrollTo(0, 0); }} aria-label="Back to Buddy home"><span className="orb" aria-hidden="true" />‹ Buddy</button>{!busy && <button className="link" onClick={() => { setActive(null); setMsgs([]); }}>New chat</button>}</div>
        <div className="chat">{msgs.map(m => <div key={m.id} style={{ display: 'contents' }}>
          <div className={`bub ${m.role === 'user' ? 'me' : 'ai'}`}>{m.content}</div>
          {(m.proposalIds || []).map(id => props[id] && <div className="prop" key={id}><b>{props[id].summary}</b>{props[id].actions.slice(0, 4).map((a, i) => { const [e, t, s] = actionLine(a); return <div className="pi" key={i}><span>{e}</span><div><div>{t}</div>{s && <div className="muted small">{s}</div>}</div></div>; })}
            {props[id].status === 'AWAITING_APPROVAL' ? <div className="acts"><button className="btn fill" onClick={() => setReview(props[id])}>Review & approve</button></div> : <p className="tiny">{props[id].status === 'VERIFIED' ? 'Saved and verified' : props[id].status.toLowerCase()}</p>}</div>)}
        </div>)}{busy && <div className="status"><Typing /><span>Thinking…</span></div>}</div></>}
      <form className="composer" onSubmit={e => { e.preventDefault(); send(text, !inChat); }}><div className="in">
        <button type="button" className="iconb" onClick={() => setScan(true)} aria-label="Scan a schedule">📷</button>
        <textarea ref={input} rows={1} value={text} disabled={busy || !me.aiConsent} placeholder={inChat ? 'Reply to Buddy' : 'Ask Buddy anything'} aria-label="Message Buddy" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text, !inChat); } }} />
        <button type="submit" className="iconb send" aria-label="Send" disabled={busy}>↑</button></div></form>
      {review && <ProposalReview initial={review} onClose={() => { setReview(null); setProps({}); if (active) open(active); }} />}
      {scan && <ScanSheet aiConsent={me.aiConsent} onClose={() => setScan(false)} />}
    </>
  );
}
