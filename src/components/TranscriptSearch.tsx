import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { episodeByNumber, formatClock, loadTranscript, transcriptEps, type Transcript } from '../lib/data';

const PER_EPISODE = 4; // hits listed per episode before "+N 段"
const CONTEXT = 36; // characters shown either side of a hit

/** Full-text search across every transcript. Transcripts load on first use. */
export function TranscriptSearch() {
  const [all, setAll] = useState<Transcript[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  const ensureLoaded = () => {
    if (all || loading) return;
    setLoading(true);
    Promise.all(transcriptEps.map(loadTranscript)).then((ts) => {
      setAll(ts.filter((t): t is Transcript => !!t));
      setLoading(false);
    });
  };

  const query = q.trim();
  const groups = useMemo(() => {
    if (!all || !query) return [];
    return all
      .map((t) => ({
        ep: t.ep,
        hits: t.paragraphs.filter(([, text]) => text.includes(query)).map(([start, text, sp]) => {
          const at = text.indexOf(query);
          return {
            start,
            sp,
            pre: (at > CONTEXT ? '…' : '') + text.slice(Math.max(0, at - CONTEXT), at),
            post: text.slice(at + query.length, at + query.length + CONTEXT) + (text.length > at + query.length + CONTEXT ? '…' : ''),
          };
        }),
      }))
      .filter((g) => g.hits.length)
      .sort((a, b) => b.hits.length - a.hits.length);
  }, [all, query]);
  const total = groups.reduce((n, g) => n + g.hits.length, 0);

  return (
    <div className="tsearch">
      <div className="transcript-tools">
        <label className="transcript-search">
          <span className="visually-hidden">搜尋全部逐字稿</span>
          <input type="search" value={q} placeholder="例如：AI、信任、接班" onFocus={ensureLoaded}
            onChange={(e) => { ensureLoaded(); setQ(e.target.value); }} />
        </label>
        <span className="transcript-status" aria-live="polite">
          {loading ? '讀取逐字稿中…' : query ? `「${query}」出現在 ${total} 段、${groups.length} 集` : `${transcriptEps.length} 集逐字稿`}
        </span>
      </div>

      {groups.map((g) => {
        const e = episodeByNumber(g.ep);
        return (
          <div key={g.ep} className="tsearch-group">
            <Link to={`/episode/${g.ep}`} className="tsearch-ep">
              <span className="mono">EP.{g.ep}</span> {e?.title}
              <span className="muted"> · {e?.guest} · {g.hits.length} 段</span>
            </Link>
            <ol className="transcript-list">
              {g.hits.slice(0, PER_EPISODE).map((h) => (
                <li key={h.start}>
                  <span className="transcript-time">
                    {formatClock(h.start)}
                    {h.sp && <span className={`transcript-who sp-${h.sp}`}>{h.sp === 'host' ? 'Jason' : '來賓'}</span>}
                  </span>
                  <p>{h.pre}<mark>{query}</mark>{h.post}</p>
                </li>
              ))}
            </ol>
            {g.hits.length > PER_EPISODE && <span className="transcript-note">還有 {g.hits.length - PER_EPISODE} 段，到單集頁的逐字稿裡搜尋。</span>}
          </div>
        );
      })}
      <p className="transcript-note">AI 自動轉錄，未經人工校對；只搜得到逐字稿裡的寫法（同音錯字可能搜不到）。</p>
    </div>
  );
}
