import Week from '../components/Week';
import { useState } from 'react';
import { api } from '../lib/api';
import { Proposal, Student, Tab, Today as TodayData } from '../lib/types';
import { EMO, SOURCE_TAG, fmtDay, fmtDayLong, fmtMins, fmtTime } from '../lib/format';
import { Ring, Sheet, Typing, toast, useLoad } from '../components/ui';
import ProposalReview from '../components/ProposalReview';
import ScanSheet from './ScanSheet';
import NewsSheet, { explainAsk, storyWhen } from '../components/NewsSheet';
import { NEWS_EMOJI, WARM, partOfDay } from '../lib/theme';
import { NewsResponse } from '../lib/types';

const COLORS = { focus: 'var(--peri)', freeTime: 'var(--teal)', progress: 'var(--peach)' } as const;
const CLS = { focus: 'c-peri', freeTime: 'c-teal', progress: 'c-peach' } as const;

export default function Today({ me, go, ask, setMe }: { me: Student; go: (t: Tab) => void; ask: (t: string) => void; setMe: (s: Student) => void }) {
  const { data: d, reload } = useLoad(() => api<TodayData>('/api/today'), []);
  const news = useLoad(() => api<NewsResponse>('/api/news'), [me.settings.newsTopics?.join(',')]);
  const [newsOpen, setNewsOpen] = useState(false);
  const [sheet, setSheet] = useState<null | { k: 'ring'; v: keyof TodayData['metrics'] } | { k: 'why' } | { k: 'review'; p: Proposal } | { k: 'scan' }>(null);
  const [snoozed, setSnoozed] = useState(false), [busy, setBusy] = useState(false);
  if (!d) return <div className="splash"><Typing /></div>;
  const m = d.metrics, na = d.brief?.nextStep ? { ...d.brief.nextStep, source: 'Suggested by Pathway from your schedule, deadlines and goals', dataUsed: ['Today’s calendar', 'Upcoming deadlines', 'Your goals'] } : d.nextAction;
  const ringVal = (k: keyof TodayData['metrics']) => k === 'progress' ? (m.progress.planned ? `${m.progress.done}/${m.progress.planned}` : '—') : fmtMins(m[k].minutes);
  const insight = async () => { setBusy(true); try { await api('/api/today/insight', { method: 'POST' }); reload(); } catch (e) { toast((e as Error).message); } setBusy(false); };
  const doIt = () => { if ('ask' in na && na.ask && me.aiConsent) ask(na.ask); else if ('route' in na && na.route) go('explore'); else go('buddy'); };
  const toggleDone = async (id: string, done: boolean) => { await api(`/api/events/${id}`, { method: 'PATCH', body: { done: !done } }); reload(); };
  const openReview = async (id: string) => setSheet({ k: 'review', p: await api<Proposal>(`/api/proposals/${id}`) });
  const part = partOfDay(), hello = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Hey there' }[part];
  const icon = { morning: '☀️', afternoon: '🌤️', evening: '🌇', night: '🌙' }[part];
  const doy = Math.floor((+new Date(new Date().toDateString()) - +new Date(new Date().getFullYear(), 0, 0)) / 864e5);
  const top = news.data?.top;
  return (
    <>
      <button className="orbfab" onClick={() => go('buddy')} aria-label="Talk to Buddy"><span className="orb" aria-hidden="true" />Talk to Buddy</button>
      <section className={`sky ${part}`} aria-label="Welcome"><span className="sun" aria-hidden="true" />
        <p className="when">{icon} {fmtDayLong()}</p>
        <h1>{hello}, {me.name}</h1>
        <p className="warm">{d.brief?.insight || WARM[doy % WARM.length]}</p>
        <p className="sum">{d.timeline.length ? `${d.timeline.length} things on today.` : 'Nothing on your calendar today.'}</p>
        {!d.brief && me.aiConsent && <button className="glass" disabled={busy} onClick={insight}>{busy ? 'Reading your day…' : '✨ Get today’s insight'}</button>}
        {d.brief?.workload && <p className="sum">{d.brief.workload}</p>}
      </section>
      {(me.settings.showWord || me.settings.showNews) && <div className="sec" style={{ marginTop: 22 }}><div className="sec-h"><h2>Today’s spark</h2></div><div className="sparks">
        {me.settings.showWord && <div className="card spark"><div className="k"><p className="label">WORD OF THE DAY</p>{'speechSynthesis' in window && <button className="chipbtn" onClick={() => speechSynthesis.speak(new SpeechSynthesisUtterance(d.word.word))}>🔊 Hear it</button>}</div>
          <h3 style={{ fontSize: 28, fontWeight: 300 }}>{d.word.word}</h3><p className="muted small">{d.word.pos} · {d.word.meaning}</p><p className="small"><i>{d.word.example}</i></p></div>}
        {me.settings.showNews && (top ? <div className="card spark"><div className="k"><p className="label">{news.data?.personal ? 'NEWS FOR YOU' : 'TODAY’S HEADLINE'}</p><span className="tag">{NEWS_EMOJI[top.topic]} {top.topic}</span></div>
            <button onClick={() => setNewsOpen(true)} style={{ textAlign: 'left' }}><h3>{top.headline}</h3></button>{top.summary && <p className="muted small">{top.summary}</p>}
            <p className="src">{top.source} · {storyWhen(top.publishedAt)}</p>
            <div className="row"><button className="chipbtn" onClick={() => setNewsOpen(true)}>More for you →</button><a className="chipbtn" href={top.url} target="_blank" rel="noreferrer">Read ↗</a>{me.aiConsent && <button className="chipbtn" onClick={() => ask(explainAsk(top))}>Explain it simply</button>}</div></div>
          : <div className="card spark"><p className="label">NEWS FOR YOU</p><h3 style={{ fontSize: 18 }}>No stories yet</h3><p className="muted small">Only real, named sources. <button className="link" onClick={() => setNewsOpen(true)}>Pick your topics</button></p></div>)}
      </div></div>}
      <div className="sec" style={{ marginTop: 22 }}>
        {d.pending.length ? <div className="card next"><div className="k"><i style={{ background: 'var(--peach)' }} /><span className="label">WAITING FOR YOUR OK</span></div><h3>{d.pending[0].summary}</h3><p className="muted">{d.pending[0].count} changes ready. Nothing happens until you approve.</p><div className="acts"><button className="btn fill" onClick={() => openReview(d.pending[0].id)}>Review</button></div></div>
          : snoozed ? <div className="card next"><span className="label">SNOOZED UNTIL TOMORROW</span><p className="muted" style={{ marginTop: 8 }}>Enjoy the breathing room. <button className="link" onClick={() => setSnoozed(false)}>Show it anyway</button></p></div>
          : <div className="card next"><div className="k"><i /><span className="label">NEXT BEST STEP</span></div><h3>{na.title}</h3><p className="muted">{na.why}</p>
              <div className="acts"><button className="btn fill" onClick={doIt}>Do it</button><button className="btn" onClick={() => { setSnoozed(true); toast('Snoozed until tomorrow'); }}>Later</button><button className="btn" onClick={() => setSheet({ k: 'why' })}>Why this?</button></div></div>}
      </div>
      {!!d.dueSoon?.length && <section className="sec"><div className="card"><h2>Due soon</h2>{d.dueSoon.map(a => <p key={a.opportunityId}>{a.name} · {a.countdown?.label}<br /><span className="note">{a.deadlineSource}</span></p>)}<button className="btn fill" onClick={() => go('explore')}>Review my applications</button></div></section>}
      <div className="sec"><div className="sec-h"><h2>Your day at a glance</h2><span className="tiny">Tap a ring</span></div><div className="card glance"><div className="rings">{(['focus', 'freeTime', 'progress'] as const).map(k => (
        <button key={k} className="ringbtn" onClick={() => setSheet({ k: 'ring', v: k })} aria-label={`${m[k].label}: ${ringVal(k)}, ${m[k].status}`}>
          <Ring pct={m[k].pct} color={COLORS[k]}>{ringVal(k)}</Ring><span className="n">{m[k].label}</span><span className={`st ${CLS[k]}`}>{m[k].status}</span></button>))}</div></div></div>
      <Week />
      <div className="sec"><div className="sec-h"><h2>Timeline</h2><button className="link" onClick={() => setSheet({ k: 'scan' })}>Scan schedule</button></div>
        <div className="card" style={{ padding: '8px 14px' }}>{d.timeline.length ? <div className="tl">{d.timeline.map(o => { const flex = !o.recurring && ['study', 'reminder', 'personal'].includes(o.type); return (
          <div key={o.id + o.start} className={`tl-i ${o.done ? 'done' : ''}`}><span className="tm">{o.end > o.start ? fmtTime(o.start) : 'Due'}</span><span className="dot" style={{ background: o.clash ? 'var(--rose)' : 'var(--peri)' }} />
            <div><div className="tt">{EMO[o.type]} {o.title}</div><div className="tg">{o.clash && <span className="c-rose">Overlaps another event · </span>}{SOURCE_TAG[o.source] || (o.source.startsWith('From ') ? o.source + ' · read-only' : 'You added')}</div></div>
            {flex && !o.readOnly ? <button className={`chk ${o.done ? 'on' : ''}`} onClick={() => toggleDone(o.id, o.done)} aria-label={o.done ? 'Mark not done' : 'Mark done'}>{o.done ? '✓' : ''}</button> : <span />}</div>); })}</div>
          : <p className="muted small" style={{ padding: 4 }}>Nothing scheduled today.</p>}</div></div>
      {d.comingUp.length > 0 && <div className="sec"><div className="sec-h"><h2>Coming up</h2></div><div className="rows">{d.comingUp.map(o => <div className="r" key={o.id + o.start}><span className="emo">{EMO[o.type]}</span><span className="b"><span className="t">{o.title}</span><span className="s" style={{ display: 'block' }}>{fmtDay(o.start)}</span></span></div>)}</div></div>}

      {sheet?.k === 'ring' && <Sheet title={m[sheet.v].label} onClose={() => setSheet(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0 10px' }}><Ring pct={m[sheet.v].pct} color={COLORS[sheet.v]} size={150} width={9}>{ringVal(sheet.v)}</Ring><p className={CLS[sheet.v]} style={{ marginTop: 10, fontWeight: 600 }}>{m[sheet.v].status}</p></div>
        <p className="muted small" style={{ textAlign: 'center' }}>{sheet.v === 'focus' ? 'Study time on your calendar today compared with the daily limit you set. Not a grade.' : sheet.v === 'freeTime' ? 'Open minutes in your study window plus protected downtime. Pathway leaves room on purpose.' : 'Goal steps planned this week and how many you’ve finished. It tracks your goals, not you against anyone.'}</p>
        <div className="sec"><p className="label">CONTRIBUTORS</p><div className="card" style={{ padding: '4px 16px', marginTop: 6 }}>
          {sheet.v === 'focus' && <Contrib l="Study planned today" v={`${fmtMins(m.focus.minutes)} of ${fmtMins(m.focus.limit)}`} pct={m.focus.pct} c={COLORS.focus} />}
          {sheet.v === 'freeTime' && <><Contrib l="Free in your study window" v={fmtMins(m.freeTime.inWindow)} pct={1} c={COLORS.freeTime} /><Contrib l="Protected downtime" v={fmtMins(m.freeTime.downtime)} pct={1} c={COLORS.freeTime} /></>}
          {sheet.v === 'progress' && <><Contrib l="Steps done this week" v={String(m.progress.done)} pct={m.progress.pct} c={COLORS.progress} /><Contrib l="Steps planned this week" v={String(m.progress.planned)} pct={1} c="var(--line2)" /></>}
        </div></div></Sheet>}
      {sheet?.k === 'why' && <Sheet title="Why this step" onClose={() => setSheet(null)}><h2 className="serif" style={{ fontSize: 26 }}>{na.title}</h2><p className="muted" style={{ marginTop: 10 }}>{na.why}</p>
        <div className="sec"><p className="label">WHERE THIS CAME FROM</p><p style={{ marginTop: 6 }}>{na.source}</p></div><div className="sec"><p className="label">WHAT I LOOKED AT</p><p className="muted" style={{ marginTop: 6 }}>{na.dataUsed.join(' · ')}</p></div></Sheet>}
      {sheet?.k === 'review' && <ProposalReview initial={sheet.p} onClose={() => { setSheet(null); reload(); }} onDone={reload} />}
      {newsOpen && <NewsSheet me={me} setMe={setMe} onClose={() => setNewsOpen(false)} ask={ask} />}
      {sheet?.k === 'scan' && <ScanSheet aiConsent={me.aiConsent} onClose={() => { setSheet(null); reload(); }} />}
    </>
  );
}
const Contrib = ({ l, v, pct, c }: { l: string; v: string; pct: number; c: string }) => <div className="contrib"><div className="h"><b>{l}</b><span className="muted">{v}</span></div><div className="cbar"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%`, background: c }} /></div></div>;
