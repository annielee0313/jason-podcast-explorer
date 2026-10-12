import { useState } from 'react';
import { Header } from '../components/Header';
import { clipsSample, episodeByNumber, formatClock } from '../lib/data';

const FORMATS = [
  { name: 'Reels 9:16', w: 300, h: 533, title: 20, sub: 19, card: false, note: '音訊 + 動態波形 + 逐字字幕（若有錄影則換成畫面）' },
  { name: '貼文 1:1', w: 340, h: 340, title: 16, sub: 16, card: false, note: '方形版，適合動態牆與 LinkedIn' },
  { name: '引言圖卡 4:5', w: 320, h: 400, title: 16, sub: 16, card: true, note: '不需要影片：金句輪播，可延伸 2–3 張' },
];

const STEPS = ['音檔匯入', '逐字稿', '分辨 Jason / 來賓', '精華候選', '剪輯與字幕', '匯出與排程'];
const CURRENT_STEP = 3;

export default function Studio() {
  const ep = episodeByNumber(clipsSample.ep)!;
  const total = ep.durationSec ?? 1;
  const [ci, setCi] = useState(0);
  const [fi, setFi] = useState(0);
  const [caption, setCaption] = useState(clipsSample.clips[0].caption);
  const clip = clipsSample.clips[ci];
  const fmt = FORMATS[fi];

  const pick = (i: number) => { setCi(i); setCaption(clipsSample.clips[i].caption); };

  return (
    <div className="tool">
      <Header tool="短影音工作台" />
      <div style={{ background: '#fff', padding: '12px 32px' }}>
        <ol aria-label="處理進度" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 14 }}>
          {STEPS.map((s, i) => (
            <li key={s} style={{
              padding: '6px 12px', borderRadius: 999,
              ...(i < CURRENT_STEP ? { background: '#DFF3E4', color: '#1E6B33' }
                : i === CURRENT_STEP ? { background: 'var(--ink)', color: '#fff' }
                : { background: 'var(--ground)', color: 'var(--muted)' }),
            }}>{i + 1} {s}{i === CURRENT_STEP && '（你在這）'}</li>
          ))}
          <li className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--teal-strong)' }}>時間碼為示意 · 接上逐字稿後換成真實數據</li>
        </ol>
      </div>

      <section style={{ padding: '24px 32px 0' }}>
        <div className="card" style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>EP.{ep.ep} {ep.guest} · 整集 {formatClock(total)}</span>
            <span className="muted" style={{ fontSize: 13 }}>色塊 = AI 建議的片段 · 點色塊選取</span>
          </div>
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <div className="timeline">
              <div className="wave" aria-hidden="true" />
              {clipsSample.clips.map((c, i) => (
                <button key={c.start} type="button" className="mark" aria-pressed={i === ci} aria-label={`片段 ${i + 1}：${c.hook}`}
                  onClick={() => pick(i)}
                  style={{ left: `${(c.start / total) * 100}%`, width: `${((c.end - c.start) / total) * 100}%` }} />
              ))}
              <div className="mono" style={{ position: 'absolute', left: 0, right: 0, top: 60, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted-2)' }}>
                {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{formatClock(Math.round(total * f))}</span>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '20px 32px 64px' }}>
        <div className="row" style={{ maxWidth: 1400, margin: '0 auto', gap: 20, alignItems: 'flex-start' }}>
          <div className="card grow" style={{ padding: 24 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
              <h2 style={{ fontSize: 22 }}>精華候選 · {clipsSample.clips.length} 段</h2>
              <span className="muted" style={{ fontSize: 13 }}>依「單獨看得懂、開頭 3 秒有鉤子、30–60 秒」挑選</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              {clipsSample.clips.map((c, i) => (
                <button key={c.start} type="button" className="clip-btn" aria-pressed={i === ci} onClick={() => pick(i)}>
                  <span className="mono muted" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12 }}>
                    <span>#{i + 1}</span><span>{formatClock(c.start)}–{formatClock(c.end)}</span><span>{c.end - c.start} 秒</span><span>{c.speaker}</span>
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5 }}>{c.hook}</span>
                  <span className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>{c.why}</span>
                  <span className="chips">{c.tags.map((t) => <span key={t} className="chip" style={{ background: '#DDF3F5', color: '#0B5966', fontSize: 12 }}>{t}</span>)}</span>
                </button>
              ))}
            </div>
            <div className="placeholder" style={{ marginTop: 16, fontSize: 14 }}>逐字稿選取：在逐字稿上拖選任一段文字 → 「加為片段」。AI 漏掉的好段落由人補上。</div>
          </div>

          <div className="side" style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 20 }}>
              <div role="group" aria-label="輸出格式" className="chips" style={{ gap: 8 }}>
                {FORMATS.map((f, i) => (
                  <button key={f.name} type="button" className="toggle" style={{ borderRadius: 10, fontSize: 14 }} aria-pressed={i === fi} onClick={() => setFi(i)}>{f.name}</button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                <div className="preview" aria-label="預覽" style={{ width: fmt.w, height: fmt.h }}>
                  <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--teal-light)' }}>
                    <span>Jason好好聊 · EP.{ep.ep}</span><span>{fmt.card ? '1 / 3' : `0:${String(clip.end - clip.start).padStart(2, '0')}`}</span>
                  </div>
                  {fmt.card ? (
                    <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.45 }}>「{clip.hook}」</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      <div style={{ fontSize: fmt.title, fontWeight: 900, lineHeight: 1.4, background: 'var(--teal)', color: 'var(--ink)', padding: '8px 12px', borderRadius: 8, alignSelf: 'flex-start' }}>{clip.title}</div>
                      <div aria-hidden="true" style={{ height: 64, borderRadius: 8, background: 'repeating-linear-gradient(90deg, var(--teal-light) 0 3px, transparent 3px 8px)', opacity: 0.85 }} />
                      <div style={{ fontSize: fmt.sub, fontWeight: 700, lineHeight: 1.55, textAlign: 'center' }}>{clip.hook}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#2F5BD3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15 }}>{ep.guest.charAt(0)}</span>
                      <span style={{ fontSize: 13, lineHeight: 1.35 }}><strong>{ep.guest}</strong><br />{ep.org}</span>
                    </div>
                    <div aria-hidden="true" style={{ height: 4, borderRadius: 2, background: '#3A4A54' }}><div style={{ width: '35%', height: '100%', borderRadius: 2, background: '#fff' }} /></div>
                  </div>
                </div>
              </div>
              <p className="muted" style={{ margin: '14px 0 0', fontSize: 13, textAlign: 'center' }}>{fmt.note}</p>
            </div>

            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label htmlFor="cap" style={{ fontSize: 15, fontWeight: 700 }}>貼文文案（AI 草稿，可編輯）</label>
              <textarea id="cap" rows={6} value={caption} onChange={(e) => setCaption(e.target.value)}
                style={{ font: 'inherit', fontSize: 15, lineHeight: 1.65, padding: 12, borderRadius: 10, border: '1px solid var(--dash)', resize: 'vertical' }} />
              <div className="chips">{clip.hashtags.map((h) => <span key={h} className="chip" style={{ background: '#E3EAFD', color: '#1D3FA0' }}>{h}</span>)}</div>
              <div className="chips" style={{ gap: 8, marginTop: 4 }}>
                {/* TODO: wire to the render pipeline (ffmpeg / Remotion) */}
                <button type="button" className="btn btn-primary">匯出 {fmt.name}</button>
                <button type="button" className="btn btn-outline">下載字幕 .srt</button>
                <button type="button" className="btn btn-outline">送給 Jason 審核</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
