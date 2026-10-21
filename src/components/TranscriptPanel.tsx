import { useEffect, useMemo, useState } from 'react';
import { formatClock, loadTranscript, type Transcript } from '../lib/data';

const WHO = { host: 'Jason', guest: '來賓' } as const;

const PREVIEW = 6; // paragraphs shown before 展開全文

/** Wrap every occurrence of `q` in <mark>. */
function highlight(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(q);
  return parts.flatMap((p, i) => (i ? [<mark key={i}>{q}</mark>, p] : [p]));
}

/**
 * The episode's machine transcript (Whisper, cleaned, unreviewed). Loads on
 * mount as its own chunk. Search filters to matching paragraphs.
 */
export function TranscriptPanel({ ep }: { ep: number }) {
  const [data, setData] = useState<Transcript | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    let live = true;
    setData(undefined);
    loadTranscript(ep).then((t) => { if (live) setData(t); });
    return () => { live = false; };
  }, [ep]);

  const query = q.trim();
  const hits = useMemo(
    () => (data && query ? data.paragraphs.filter(([, text]) => text.includes(query)) : []),
    [data, query],
  );

  if (data === undefined) return <p className="muted">讀取逐字稿中…</p>;
  if (data === null) {
    return <div className="placeholder">這一集的逐字稿整理中。</div>;
  }

  const list = query ? hits : open ? data.paragraphs : data.paragraphs.slice(0, PREVIEW);
  return (
    <div className="transcript">
      <div className="transcript-tools">
        <label className="transcript-search">
          <span className="visually-hidden">在逐字稿中搜尋</span>
          <input type="search" value={q} placeholder="在這集逐字稿裡找一個詞" onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="transcript-status" aria-live="polite">
          {query ? `「${query}」出現在 ${hits.length} 段` : `${data.paragraphs.length} 段`}
        </span>
      </div>

      <ol className="transcript-list">
        {list.map(([start, text, sp]) => (
          <li key={start}>
            <span className="transcript-time">
              {formatClock(start)}
              {sp && <span className={`transcript-who sp-${sp}`}>{WHO[sp]}</span>}
            </span>
            <p className={sp ? `sp-text-${sp}` : undefined}>{highlight(text, query)}</p>
          </li>
        ))}
      </ol>

      {!query && data.paragraphs.length > PREVIEW && (
        <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? '收起' : `展開全文（${data.paragraphs.length} 段）`}
        </button>
      )}
      <p className="transcript-note">
        AI 自動轉錄（Whisper {data.model ?? ''}），未經人工校對，可能有錯字與同音字；
        {data.paragraphs.some((p) => p[2]) ? '說話者為自動分辨，短句（如「對」）偶有誤標。' : '尚未區分說話者。'}
      </p>
    </div>
  );
}
