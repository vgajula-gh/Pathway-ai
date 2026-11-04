import { api } from '../lib/api';
import { NewsResponse, Student, Story } from '../lib/types';
import { NEWS_EMOJI } from '../lib/theme';
import { fmtDay } from '../lib/format';
import { Sheet, Typing, toast, useLoad } from './ui';
import NewsRefresh from './NewsRefresh';

export const storyWhen = (iso: string) => { const d = Math.round((+new Date(new Date().toDateString()) - +new Date(iso + 'T00:00')) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : fmtDay(iso); };
export const explainAsk = (n: Story) => `Explain this news story to me simply, and why it might matter to a high school student. Only use these facts: ${n.headline}. ${n.summary} (Source: ${n.source})`;

/** News for you: students choose topics; every story has a real source and link. */
export default function NewsSheet({ me, setMe, onClose, ask }: { me: Student; setMe: (s: Student) => void; onClose: () => void; ask: (t: string) => void }) {
  const { data, error, reload, setData } = useLoad(() => api<NewsResponse>('/api/news'), []);
  const setTopics = async (topics: string[] | null) => { const s = await api<Student>('/api/me', { method: 'PATCH', body: { settings: { newsTopics: topics } } }); setMe(s); reload(); };
  const toggle = (t: string) => { if (!data) return; const cur = data.topics.includes(t) ? data.topics.filter(x => x !== t) : [...data.topics, t]; if (!cur.length) return toast('Keep at least one topic'); setTopics(cur); };
  return (
    <Sheet title="News for you" onClose={onClose}>
      <NewsRefresh onRefreshed={setData}/>
      {error&&<p role="alert" className="note c-rose">Could not load news. <button className="link" onClick={reload}>Try again</button></p>}
      {!data ? !error&&<div style={{ textAlign: 'center', padding: 30 }}><Typing /></div> : <>
        <p className="label">YOUR TOPICS</p><p className="muted small" style={{ marginTop: 4 }}>{data.custom ? 'Tap to add or remove.' : 'Picked from your interests. Tap to change.'}</p>
        <div className="chips" style={{ marginTop: 10 }}>{data.allTopics.map(t => <button key={t} className="chip" aria-pressed={data.topics.includes(t)} onClick={() => toggle(t)}>{NEWS_EMOJI[t]} {t}</button>)}</div>
        {data.custom && <button className="link" style={{ marginTop: 10 }} onClick={() => setTopics(null)}>Match my interests again</button>}
        <div className="sec">{data.stories.length ? data.stories.map(n => (
          <div className="card spark" key={n.id} style={{ marginTop: 12 }}>
            <div className="k"><span className="tag">{NEWS_EMOJI[n.topic]} {n.topic}</span><span className="src">{n.source} · {storyWhen(n.publishedAt)}</span></div>
            <h3>{n.headline}</h3>{n.summary && <p className="muted small">{n.summary}</p>}
            <div className="row"><a className="chipbtn" href={n.url} target="_blank" rel="noreferrer">Read the story ↗</a>{me.aiConsent && <button className="chipbtn" onClick={() => { onClose(); ask(explainAsk(n)); }}>Explain it simply</button>}</div>
          </div>)) : <div className="card"><p className="muted">No stories in your topics right now. Try adding another topic.</p></div>}
          {data.emptyTopics.length > 0 && data.stories.length > 0 && <p className="note">Nothing new yet in {data.emptyTopics.join(', ')}.</p>}</div>
        <p className="note">Every story comes from a real, named source with a link. Pathway never writes the news itself, and your topics are private to you.</p>
      </>}
    </Sheet>
  );
}
