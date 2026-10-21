import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { ArrowIcon } from '../components/ui';
import { clipSets, episodeByNumber, formatClock, transcriptEps, type Clip, type Speaker, type Sub } from '../lib/data';

const FORMATS = [
  { id: 'reel', name: '9:16', w: 270, h: 480, note: 'Reels / Shorts：音訊或畫面 + 字幕' },
  { id: 'square', name: '1:1', w: 320, h: 320, note: '貼文：動態牆、LinkedIn' },
  { id: 'card', name: '引言卡', w: 300, h: 375, note: '不需要影片：金句圖卡 4:5' },
] as const;

// Pipeline status for this demo; 分辨說話者 turns done once the clips carry speakers.
const STEPS: { label: string; state: 'done' | 'now' | 'todo' }[] = [
  { label: '音檔', state: 'done' },
  { label: '逐字稿', state: 'done' },
  { label: '分辨說話者', state: 'todo' },
  { label: '精華候選', state: 'now' },
  { label: '剪輯與字幕', state: 'todo' },
  { label: '匯出與排程', state: 'todo' },
];

const SPEAKER_NAME: Record<Speaker, string> = { host: 'Jason', guest: '來賓' };
const SRT_COLOR: Record<Speaker, string> = { host: '#6FD3DB', guest: '#FDBA8C' };
const nextSpeaker = (s?: Speaker | null): Speaker | undefined => (s == null ? 'host' : s === 'host' ? 'guest' : undefined);

const srtTime = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};
const toSrt = (c: Clip, colors: boolean) => c.subs.map(([a, b, t, sp], i) => {
  const text = colors && sp ? `<font color="${SRT_COLOR[sp]}">${t}</font>` : t;
  return `${i + 1}\n${srtTime(a)} --> ${srtTime(b)}\n${text}\n`;
}).join('\n');

function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/** Re-base a clip after lines are removed: start moves to the first kept line, subs shift to match. */
function rebase(c: Clip): Clip {
  if (!c.subs.length) return c;
  const d = c.subs[0][0];
  const subs = c.subs.map(([a, b, t, sp]) => [+(a - d).toFixed(2), +(b - d).toFixed(2), t, sp] as Sub);
  const start = Math.round(c.start + d);
  return { ...c, subs, start, end: Math.round(start + subs[subs.length - 1][1]) };
}

// Drafts live in this browser only (no server yet). Wrapped: storage can be blocked.
const draftKey = (ep: number) => `studio-draft-EP${ep}`;
function loadDraft(ep: number): Clip[] | null {
  try { const raw = localStorage.getItem(draftKey(ep)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveDraft(ep: number, clips: Clip[] | null) {
  try { if (clips) localStorage.setItem(draftKey(ep), JSON.stringify(clips)); else localStorage.removeItem(draftKey(ep)); } catch { /* ignore */ }
}

/** One subtitle line rendered in its speaker's colour. */
const Line = ({ sub, hook }: { sub: Sub; hook: string }) => {
  const [, , t, sp] = sub;
  const at = hook ? t.indexOf(hook) : -1;
  return (
    <span className={sp ? `sp-${sp}` : undefined}>
      {at < 0 ? t : <>{t.slice(0, at)}<mark>{hook}</mark>{t.slice(at + hook.length)}</>}{' '}
    </span>
  );
};

export default function Studio() {
  if (!Object.keys(clipSets).length) {
    return (
      <div className="tool studio">
        <Header tool="短影音工作台" />
        <section className="wrap studio-head">
          <div>
            <span className="studio-kicker">短影音工作台</span>
            <h1 className="studio-title">尚未有可用的候選片段</h1>
            <p className="studio-note">候選片段來自逐字稿（data/clips/）。逐字稿確定可公開或部署到內部環境後，這裡會顯示各集的片段。</p>
          </div>
        </section>
      </div>
    );
  }
  return <StudioWorkspace />;
}

function StudioWorkspace() {
  const eps = Object.keys(clipSets).map(Number).sort((a, b) => b - a);
  const [epNum, setEpNum] = useState(eps[0]);
  const [drafts, setDrafts] = useState<Record<number, Clip[] | null>>(() => ({ [eps[0]]: loadDraft(eps[0]) }));
  const original = clipSets[epNum] ?? [];
  const clips = drafts[epNum] ?? original;
  const edited = !!drafts[epNum];
  const ep = episodeByNumber(epNum)!;
  const total = ep.durationSec ?? 1;
  const [ci, setCi] = useState(0);
  const [fi, setFi] = useState(0);
  const [editing, setEditing] = useState(false);
  const [si, setSi] = useState(0);
  const [srtColors, setSrtColors] = useState(false);
  const [copied, setCopied] = useState(false);
  const clip = clips[ci];
  const fmt = FORMATS[fi];
  const hookMissing = !clip.subs.some(([, , t]) => t.includes(clip.hook));

  // Preview starts on the line that contains the hook.
  useEffect(() => {
    const i = clip.subs.findIndex(([, , t]) => t.includes(clip.hook.split(' ')[0]));
    setSi(Math.max(0, i));
  }, [epNum, ci]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickEp = (n: number) => {
    setEpNum(n); setCi(0); setEditing(false);
    setDrafts((d) => (n in d ? d : { ...d, [n]: loadDraft(n) }));
  };

  const update = (fn: (c: Clip) => Clip) => {
    const next = clips.map((c, i) => (i === ci ? fn(c) : c));
    setDrafts((d) => ({ ...d, [epNum]: next }));
    saveDraft(epNum, next);
  };
  const setSub = (j: number, patch: (s: Sub) => Sub) => update((c) => ({ ...c, subs: c.subs.map((s, k) => (k === j ? patch(s) : s)) }));
  const removeSub = (j: number) => update((c) => rebase({ ...c, subs: c.subs.filter((_, k) => k !== j) }));
  const setAll = (sp?: Speaker) => update((c) => ({ ...c, subs: c.subs.map(([a, b, t]) => [a, b, t, sp] as Sub) }));
  const resetClip = () => update(() => original[ci]);
  const resetAll = () => { setDrafts((d) => ({ ...d, [epNum]: null })); saveDraft(epNum, null); };

  const copy = async () => {
    try { await navigator.clipboard.writeText(`${clip.caption}\n${clip.hashtags.join(' ')}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const exportJson = () => {
    const doc = { ep: epNum, source: 'transcript', editedAt: new Date().toISOString(), clips: clips.map((c) => ({ ...c, quote: c.subs.map((s) => s[2]).join(' ') })) };
    download(`EP${epNum}.json`, JSON.stringify(doc, null, 1), 'application/json');
  };

  const sub = clip.subs[Math.min(si, clip.subs.length - 1)];

  return (
    <div className="tool studio">
      <Header tool="短影音工作台" />

      <nav className="studio-steps" aria-label="處理進度">
        <ol>
          {STEPS.map((step, i) => {
            const s = step.label === '分辨說話者' && clips.some((c) => c.subs.some((x) => x[3])) ? { ...step, state: 'done' as const } : step;
            return (
            <li key={s.label} className={`step-${s.state}`} aria-current={s.state === 'now' ? 'step' : undefined}>
              <span className="mono">{String(i + 1).padStart(2, '0')}</span>{s.label}
              {s.state === 'done' && <span className="step-mark" aria-label="完成">✓</span>}
            </li>
            );
          })}
        </ol>
      </nav>

      <section className="wrap studio-head">
        <div>
          <span className="studio-kicker">EP.{ep.ep} · {formatClock(total)} · {ep.guest}</span>
          <h1 className="studio-title">{ep.title}</h1>
        </div>
        <label className="studio-ep">
          <span className="visually-hidden">選擇集數</span>
          <select value={epNum} onChange={(e) => pickEp(Number(e.target.value))}>
            {transcriptEps.map((n) => (
              <option key={n} value={n} disabled={!clipSets[n]}>EP.{n}{clipSets[n] ? ` · ${clipSets[n].length} 段候選` : '（尚未挑選）'}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="wrap">
        <div className="studio-timeline" aria-label="整集時間軸">
          <div className="studio-track">
            {clips.map((c, i) => (
              <button key={i} type="button" className="studio-mark" aria-pressed={i === ci} aria-label={`片段 ${i + 1}：${c.title}`}
                onClick={() => { setCi(i); setEditing(false); }}
                style={{ left: `${(c.start / total) * 100}%`, width: `${Math.max(0.6, ((c.end - c.start) / total) * 100)}%` }}>
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="studio-ticks mono" aria-hidden="true">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{formatClock(Math.round(total * f))}</span>)}
          </div>
        </div>
        <div className="studio-bar">
          <p className="studio-warn">字幕取自 AI 逐字稿（原文照錄），說話者為自動分辨；可直接修正錯字與說話者，修改會即時套用到字幕與預覽。</p>
          <span className="studio-legend"><span className="sp-host">● Jason</span><span className="sp-guest">● 來賓</span><span className="muted">● 未標記</span></span>
        </div>
      </section>

      <section className="wrap studio-grid">
        <ol className="studio-list">
          {clips.map((c, i) => {
            const on = i === ci;
            const tagged = c.subs.filter((s) => s[3]).length;
            return (
              <li key={i} className={on ? 'is-on' : undefined}>
                <button type="button" className="studio-row" aria-pressed={on} onClick={() => { setCi(i); setEditing(false); }}>
                  <span className="studio-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="studio-row-main">
                    <span className="studio-row-meta mono">{formatClock(c.start)}–{formatClock(c.end)} · {c.end - c.start} 秒 · 說話者 {tagged}/{c.subs.length}</span>
                    <span className="studio-row-title">{c.title}</span>
                    <span className="studio-row-why">{c.why}</span>
                  </span>
                  <span className="studio-row-arrow" aria-hidden="true"><ArrowIcon /></span>
                </button>

                {on && !editing && (
                  <div className="studio-quote">
                    <div className="studio-quote-head">
                      <span className="studio-label">字幕原文</span>
                      <button type="button" className="link-btn" onClick={() => setEditing(true)}>編輯字幕與說話者 <span className="dot-icon"><ArrowIcon /></span></button>
                    </div>
                    <p>{c.subs.map((s, j) => <Line key={j} sub={s} hook={c.hook} />)}</p>
                  </div>
                )}

                {on && editing && (
                  <div className="studio-editor">
                    <div className="ed-fields">
                      <label>
                        <span className="studio-label">建議標題</span>
                        <input value={c.title} onChange={(e) => update((x) => ({ ...x, title: e.target.value }))} />
                      </label>
                      <label>
                        <span className="studio-label">標示金句（需與字幕原文一致）</span>
                        <input value={c.hook} onChange={(e) => update((x) => ({ ...x, hook: e.target.value }))} />
                      </label>
                      {hookMissing && <p className="ed-warn">這句金句目前不在字幕裡：修改字幕後記得同步更新。</p>}
                    </div>

                    <div className="ed-bulk">
                      <span className="studio-label">全部設為</span>
                      <button type="button" className="tag" onClick={() => setAll('host')}><span className="tag-dot sp-dot-host" />Jason</button>
                      <button type="button" className="tag" onClick={() => setAll('guest')}><span className="tag-dot sp-dot-guest" />來賓</button>
                      <button type="button" className="tag" onClick={() => setAll(undefined)}>清除</button>
                    </div>

                    <ol className="ed-lines">
                      {c.subs.map(([a, b, t, sp], j) => (
                        <li key={j} className={j === si ? 'is-preview' : undefined}>
                          <button type="button" className="ed-time mono" onClick={() => setSi(j)} aria-label={`在預覽中顯示第 ${j + 1} 行`}>
                            {formatClock(Math.round(c.start + a))}
                          </button>
                          <button type="button" className={`ed-speaker${sp ? ` is-${sp}` : ''}`}
                            aria-label={`說話者：${sp ? SPEAKER_NAME[sp] : '未標記'}，點一下切換`}
                            onClick={() => setSub(j, (s) => [s[0], s[1], s[2], nextSpeaker(s[3])])}>
                            {sp ? SPEAKER_NAME[sp] : '—'}
                          </button>
                          <input className={sp ? `sp-${sp}` : undefined} value={t} aria-label={`第 ${j + 1} 行字幕（${(b - a).toFixed(1)} 秒）`}
                            onFocus={() => setSi(j)} onChange={(e) => setSub(j, (s) => [s[0], s[1], e.target.value, s[3]])} />
                          <button type="button" className="ed-remove" aria-label={`把第 ${j + 1} 行剪掉`} title="從片段剪掉這行"
                            disabled={c.subs.length <= 1} onClick={() => removeSub(j)}>✕</button>
                        </li>
                      ))}
                    </ol>

                    <div className="ed-actions">
                      <button type="button" className="btn btn-ink" onClick={() => setEditing(false)}>完成</button>
                      <button type="button" className="btn btn-soft" onClick={resetClip}>還原這段</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <aside className="studio-side" aria-label="預覽與文案">
          <div role="group" aria-label="輸出格式" className="seg">
            {FORMATS.map((f, i) => (
              <button key={f.id} type="button" aria-pressed={i === fi} onClick={() => setFi(i)}>{f.name}</button>
            ))}
          </div>

          <div className={`studio-preview fmt-${fmt.id}`} style={{ width: fmt.w, height: fmt.h }} aria-label={`${fmt.name} 預覽`}>
            <div className="pv-top mono"><span>Jason好好聊 · EP.{ep.ep}</span><span>{fmt.id === 'card' ? '1 / 3' : `${formatClock(Math.round(sub[0]))} / ${formatClock(clip.end - clip.start)}`}</span></div>
            {fmt.id === 'card' ? (
              <div className="pv-card-quote">「{clip.hook}」</div>
            ) : (
              <>
                <div className="pv-title">{clip.title}</div>
                <div className="pv-wave" aria-hidden="true" />
                <div className={`pv-sub${sub[3] ? ` pv-${sub[3]}` : ''}`}>
                  {sub[3] && <span className="pv-who">{sub[3] === 'host' ? 'Jason' : ep.guest}</span>}
                  {sub[2]}
                </div>
              </>
            )}
            <div className="pv-foot">
              <span>{ep.guest}</span>
              <span className="pv-end mono">完整對談 EP.{ep.ep}</span>
            </div>
          </div>
          {fmt.id !== 'card' && (
            <label className="pv-scrub">
              <span className="studio-label">預覽字幕 {Math.min(si, clip.subs.length - 1) + 1} / {clip.subs.length}</span>
              <input type="range" min={0} max={clip.subs.length - 1} value={Math.min(si, clip.subs.length - 1)} onChange={(e) => setSi(Number(e.target.value))} />
            </label>
          )}
          <p className="studio-note">{fmt.note}</p>

          <label className="studio-label" htmlFor="cap">貼文文案（草稿，可編輯）</label>
          <textarea id="cap" className="studio-caption" rows={6} value={clip.caption}
            onChange={(e) => update((c) => ({ ...c, caption: e.target.value }))} />
          <p className="studio-note">{clip.hashtags.join(' ')}</p>

          <label className="ed-check">
            <input type="checkbox" checked={srtColors} onChange={(e) => setSrtColors(e.target.checked)} />
            字幕依說話者上色（SRT &lt;font&gt; 標籤，部分剪輯軟體支援）
          </label>
          <div className="studio-actions">
            <button type="button" className="btn btn-ink" onClick={() => download(`EP${ep.ep}-clip${ci + 1}.srt`, toSrt(clip, srtColors))}>下載字幕 .srt</button>
            <button type="button" className="btn btn-soft" onClick={copy}>{copied ? '已複製' : '複製文案'}</button>
            <button type="button" className="btn btn-soft" disabled title="需要影片母檔與剪輯流程">匯出影片</button>
          </div>

          <div className="studio-save">
            <span className="studio-label">{edited ? '有未匯出的修改：存在這台電腦的瀏覽器裡' : '尚未修改'}</span>
            <div className="studio-actions">
              <button type="button" className="btn btn-soft" disabled={!edited} onClick={exportJson}>匯出修正檔 EP{epNum}.json</button>
              <button type="button" className="btn btn-soft" disabled={!edited} onClick={resetAll}>全部還原</button>
            </div>
            <p className="studio-note">目前沒有伺服器：修正只存在你的瀏覽器。匯出檔可交回專案（data/clips/）；之後接上後台或 CMS 就能多人共用、直接儲存。</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
