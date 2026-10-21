import { useEffect, useMemo, useRef, useState } from 'react';
import { formatClock, loadAudioUrl, loadTranscript, type Transcript } from '../lib/data';
import { PauseIcon, PlayIcon } from './ui';

const WHO = { host: 'Jason', guest: '來賓' } as const;
const PREVIEW = 6; // paragraphs shown before 展開全文
const SPEEDS = [1, 1.25, 1.5, 2];

/** Wrap every occurrence of `q` in <mark>. */
function highlight(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(q);
  return parts.flatMap((p, i) => (i ? [<mark key={i}>{q}</mark>, p] : [p]));
}

/** Index of the paragraph being spoken at `t` (last one whose start ≤ t), or -1 before the first. */
function activeAt(starts: number[], t: number) {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/**
 * The episode's machine transcript (Whisper, cleaned, unreviewed) with the episode's
 * audio. Click a paragraph to play from there; the paragraph being spoken is
 * highlighted. Search filters to matching paragraphs. Loads on mount as its own chunk.
 */
export function TranscriptPanel({ ep, durationSec }: { ep: number; durationSec?: number | null }) {
  const [data, setData] = useState<Transcript | null | undefined>(undefined);
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    let live = true;
    setData(undefined);
    loadTranscript(ep).then((t) => { if (live) setData(t); });
    loadAudioUrl(ep).then((u) => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [ep]);

  const starts = useMemo(() => (data ? data.paragraphs.map((p) => p[0]) : []), [data]);
  const active = playing || time > 0 ? activeAt(starts, time) : -1;

  // Playing past the preview opens the full text so the highlighted paragraph stays on the page.
  useEffect(() => { if (active >= PREVIEW && !open) setOpen(true); }, [active, open]);

  const query = q.trim();
  const hits = useMemo(
    () => (data && query ? data.paragraphs.map((p, i) => [p, i] as const).filter(([[, text]]) => text.includes(query)) : []),
    [data, query],
  );

  const play = () => { void audioRef.current?.play(); };
  const toggle = () => { const a = audioRef.current; if (!a) return; if (a.paused) play(); else a.pause(); };
  const seek = (t: number, andPlay = false) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    setTime(t);
    if (andPlay) play();
  };
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  if (data === undefined) return <p className="muted">讀取逐字稿中…</p>;
  if (data === null) return null;

  const indexed = data.paragraphs.map((p, i) => [p, i] as const);
  const list = query ? hits : open ? indexed : indexed.slice(0, PREVIEW);

  return (
    <div className="transcript">
      {src && (
        <div className="player" role="group" aria-label="播放這一集">
          <audio
            ref={audioRef}
            src={src}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration); }}
          />
          <button type="button" className="player-play" aria-label={playing ? '暫停' : '播放'} onClick={toggle}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <span className="player-time mono" aria-hidden="true">{formatClock(Math.floor(time))}</span>
          <input
            className="player-scrub"
            type="range"
            min={0}
            max={Math.max(1, Math.floor(duration))}
            step={1}
            value={Math.floor(time)}
            aria-label="播放進度"
            aria-valuetext={`${formatClock(Math.floor(time))} / ${formatClock(Math.floor(duration))}`}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ ['--progress' as string]: `${duration ? (time / duration) * 100 : 0}%` }}
          />
          <span className="player-time mono" aria-hidden="true">{formatClock(Math.floor(duration))}</span>
          <button type="button" className="player-speed mono" aria-label={`播放速度 ${speed} 倍`} onClick={cycleSpeed}>{speed}×</button>
        </div>
      )}

      <div className="transcript-tools">
        <label className="transcript-search">
          <span className="visually-hidden">在逐字稿中搜尋</span>
          <input type="search" value={q} placeholder="在這集逐字稿裡找一個詞" onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="transcript-status" aria-live="polite">
          {query ? `「${query}」出現在 ${hits.length} 段` : src ? '點任一段，從那裡開始播放' : `${data.paragraphs.length} 段`}
        </span>
      </div>

      <ol className="transcript-list">
        {list.map(([[start, text, sp], i]) => {
          const body = (
            <>
              <span className="transcript-time">
                {formatClock(start)}
                {sp && <span className={`transcript-who sp-${sp}`}>{WHO[sp]}</span>}
              </span>
              <span className={`transcript-text${sp ? ` sp-text-${sp}` : ''}`}>{highlight(text, query)}</span>
            </>
          );
          return (
            <li key={start} className={i === active ? 'is-active' : undefined}>
              {src ? (
                <button type="button" className="transcript-seg" aria-current={i === active ? 'true' : undefined}
                  onClick={() => seek(start, true)}>
                  {body}
                </button>
              ) : <div className="transcript-seg">{body}</div>}
            </li>
          );
        })}
      </ol>

      {!query && data.paragraphs.length > PREVIEW && (
        <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? '收起' : `展開全文（${data.paragraphs.length} 段）`}
        </button>
      )}
      <p className="transcript-note">
        AI 自動轉錄（Whisper {data.model ?? ''}），未經人工校對，可能有錯字與同音字；時間點為自動對齊，可能差幾秒。
        {data.paragraphs.some((p) => p[2]) ? '說話者為自動分辨，短句（如「對」）偶有誤標。' : '尚未區分說話者。'}
      </p>
    </div>
  );
}
