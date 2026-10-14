import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { curation, episodeByNumber, episodes, findTerm, questions, takeawayLines } from '../lib/data';

const WINDOWS = ['節目說明', '最近 20 集', '2026 全年', '全部 249 集'] as const;

export default function Explorer() {
  const [params] = useSearchParams();
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(WINDOWS[0]);
  const [phrase, setPhrase] = useState(params.get('phrase') ?? curation.phrases[0].label);
  const initialQ = Math.max(0, questions.findIndex((q) => q.text === params.get('q')));
  const [qi, setQi] = useState(initialQ);

  const counted = useMemo(
    () => curation.phrases.map((p) => ({ p, count: takeawayLines.filter((l) => findTerm(l.text, p.terms)).length })),
    [],
  );
  const max = Math.max(...counted.map((c) => c.count), 1);
  const cur = curation.phrases.find((p) => p.label === phrase) ?? curation.phrases[0];
  const hits = takeawayLines.flatMap((l) => {
    const f = findTerm(l.text, cur.terms);
    return f ? [{ ...l, pre: l.text.slice(0, f.at), hit: f.term, post: l.text.slice(f.at + f.term.length) }] : [];
  });
  const hitEps = new Set(hits.map((h) => h.ep)).size;
  const withNotes = episodes.filter((e) => e.takeaways.length);
  const range = withNotes.length ? `EP.${withNotes[withNotes.length - 1].ep}–${withNotes[0].ep}` : '—';

  return (
    <div className="tool">
      <Header tool="語錄室" />
      <div className="status-bar">
        <span>資料狀態</span>
        <span>單集資料 <strong>{episodes.length} / 249</strong></span>
        <span>主題標記 <strong>{episodes.length} / 249</strong>（草稿）</span>
        <span>節目重點 <strong>{takeawayLines.length} 句</strong>（{range}）</span>
        <span>逐字稿 <strong className="todo">0 / 249</strong></span>
      </div>

      <section className="section" style={{ paddingBottom: 24 }}>
        <div className="wrap" style={{ maxWidth: 1360 }}>
        <div className="card" style={{ padding: 32 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end' }}>
            <div>
              <h2 style={{ fontSize: 22 }}>反覆出現的詞</h2>
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>選一個詞，看它在哪幾集、哪一句出現。</p>
            </div>
            <div role="group" aria-label="範圍" className="chips" style={{ gap: 8 }}>
              {WINDOWS.map((w) => (
                <button key={w} type="button" className="toggle" style={{ borderRadius: 10, fontSize: 13 }} aria-pressed={win === w} onClick={() => setWin(w)}>{w}</button>
              ))}
            </div>
          </div>

          {win !== WINDOWS[0] ? (
            <div className="placeholder" style={{ marginTop: 24, padding: 28, fontSize: 14, lineHeight: 1.7 }}>
              「{win}」需要逐字稿才能計算。逐字稿完成後，這裡會用斷詞後的全文統計詞頻，每一筆結果都能跳到原音的時間點。
            </div>
          ) : (
            <div className="row" style={{ marginTop: 24, gap: 28 }}>
              <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                <div className="mono muted" style={{ fontSize: 12, marginBottom: 10 }}>來源：{range} 節目說明的 {takeawayLines.length} 句重點</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {counted.map(({ p, count }) => {
                    const on = p.label === cur.label;
                    return (
                      <button key={p.label} type="button" className="phrase-btn" aria-pressed={on} onClick={() => setPhrase(p.label)}>
                        <span style={{ fontWeight: 700 }}>{p.label}</span>
                        <span style={{ height: 8, borderRadius: 4, background: on ? '#3A4A54' : '#ECEDE9', overflow: 'hidden' }}>
                          <span style={{ display: 'block', height: '100%', width: `${(count / max) * 100}%`, background: on ? 'var(--teal-light)' : 'var(--teal)', borderRadius: 4 }} />
                        </span>
                        <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grow" style={{ flex: '999 1 560px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 18, fontWeight: 900 }}>「{cur.label}」</span>
                  <span className="muted" style={{ fontSize: 13 }}>出現在 {hits.length} 句、{hitEps} 集</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {hits.map((h) => (
                    <div key={h.text} className="hit">
                      <Link to={`/episode/${h.ep}`} className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>EP.{h.ep} · {h.guest}</Link>
                      <span style={{ fontSize: 15, lineHeight: 1.65 }}>{h.pre}<mark>{h.hit}</mark>{h.post}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0, paddingBottom: 32 }}>
        <div className="wrap" style={{ maxWidth: 1360 }}>
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 22 }}>同一個問題，不同的回答</h2>
          <p className="muted" style={{ margin: '8px 0 20px', fontSize: 14 }}>Jason 常問相近的問題。把不同來賓的回答並排看。</p>
          <div role="tablist" aria-label="問題" className="chips" style={{ gap: 8 }}>
            {questions.map((q, i) => (
              <button key={q.text} type="button" role="tab" className="toggle" style={{ borderRadius: 10, fontWeight: 700 }} aria-selected={i === qi} onClick={() => setQi(i)}>{q.text}</button>
            ))}
          </div>
          <div className="grid-auto" style={{ marginTop: 24, gap: 16 }}>
            {questions[qi].answers.map((a) => {
              const e = episodeByNumber(a.ep);
              return (
                <div key={a.ep} className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Link to={`/episode/${a.ep}`} className="mono muted" style={{ fontSize: 12 }}>EP.{a.ep}</Link>
                  <span style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.55 }}>{a.text}</span>
                  <span className="muted" style={{ fontSize: 13, marginTop: 'auto' }}>{e?.guest} · {e?.org}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--muted-2)' }}>
                    {a.source === 'summary' ? '摘要改寫 · ' : '節目說明 · '}[ 原話 ＋ 時間碼：逐字稿後 ]
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0, paddingBottom: 80 }}>
        <div className="wrap grid-auto" style={{ maxWidth: 1360, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          <div className="placeholder" style={{ padding: 24 }}><strong style={{ fontSize: 16, color: 'var(--ink)' }}>Jason 的口頭禪</strong><br />只統計主持人的發言，看他最常用的詞和提問方式。需逐字稿＋說話者分離。</div>
          <Link to="/studio" className="placeholder" style={{ padding: 24, textDecoration: 'none' }}><strong style={{ fontSize: 16, color: 'var(--ink)' }}>短影音片段挑選 →</strong><br />依關鍵詞找出 30–60 秒的段落，給社群小編直接剪。</Link>
          <div className="placeholder" style={{ padding: 24 }}><strong style={{ fontSize: 16, color: 'var(--ink)' }}>來賓缺口</strong><br />哪些產業或主題很久沒聊了，作為下一季邀約參考。只需主題標記。</div>
        </div>
      </section>
    </div>
  );
}
