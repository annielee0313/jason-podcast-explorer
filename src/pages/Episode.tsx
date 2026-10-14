import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Footer, Header } from '../components/Header';
import { PlayIcon, ThemeChip } from '../components/ui';
import { about, episodeByNumber, formatDuration, questions, relatedEpisodes, themeById } from '../lib/data';

export default function EpisodePage() {
  const { ep: epParam } = useParams();
  const ep = episodeByNumber(Number(epParam));

  useEffect(() => { window.scrollTo(0, 0); }, [epParam]);

  if (!ep) {
    return (
      <>
        <Header />
        <section className="section"><div className="wrap">
          <h1 style={{ fontSize: 32 }}>找不到這一集</h1>
          <p className="muted">EP.{epParam} 還沒匯入資料。<Link to="/">回首頁</Link></p>
        </div></section>
      </>
    );
  }

  const related = relatedEpisodes(ep);
  const askedHere = questions.filter((q) => q.answers.some((a) => a.ep === ep.ep));

  return (
    <>
      <Header />
      <section className="hero" style={{ paddingTop: 40, paddingBottom: 56 }}>
        <div className="wrap row" style={{ gap: 40, alignItems: 'flex-end' }}>
          <div className="grow" style={{ flex: '999 1 600px' }}>
            <p className="kicker" style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--teal-strong)' }}>EP.{ep.ep} · {ep.date} · {formatDuration(ep.durationSec)}</p>
            <h1 style={{ fontSize: 'clamp(30px, 4.4vw, 52px)' }}>{ep.title}</h1>
            <div className="chips" style={{ gap: 10, marginTop: 28 }}>
              {ep.appleUrl && <a className="btn btn-light" href={ep.appleUrl} target="_blank" rel="noreferrer"><PlayIcon />Apple Podcasts</a>}
              {/* Per-episode video links come later (YouTube Data API); until then this opens the channel. */}
              <a className="btn btn-light" href={about.show.youtube} target="_blank" rel="noreferrer"><PlayIcon />YouTube</a>
              <a className="btn btn-light" href={about.show.soundon} target="_blank" rel="noreferrer"><PlayIcon />SoundOn</a>
            </div>
          </div>
          <aside aria-label="來賓" className="ep-guest side">
            <div className="ep-guest-name">{ep.guest}</div>
            <div className="ep-guest-org">{ep.org}</div>
          </aside>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <div className="wrap row" style={{ gap: 32, alignItems: 'flex-start' }}>
          <div className="grow" style={{ flex: '999 1 640px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="chips" style={{ gap: 8 }}>{ep.themes.map((t) => <ThemeChip key={t} id={t} />)}</div>

            <div className="card">
              <h2 style={{ fontSize: 20, marginBottom: 20 }}>這集在聊</h2>
              {ep.takeaways.length ? (
                <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ep.takeaways.map((t) => {
                    const [head, ...rest] = t.split('：');
                    return (
                      <li key={t} style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 16, padding: '16px 18px', background: 'var(--ground)', borderRadius: 8 }}>
                        <span className="mono" style={{ fontSize: 14, color: 'var(--muted-2)' }}>--:--</span>
                        <span style={{ fontSize: 15, lineHeight: 1.65 }}>
                          {rest.length ? <><strong>{head}</strong>：{rest.join('：')}</> : t}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="placeholder">本集重點尚未匯入（執行 scripts/fetch_episodes.py）。</div>
              )}
              <p className="muted" style={{ margin: '16px 0 0', fontSize: 13 }}>重點取自節目說明。逐字稿完成後，每一點會配上時間碼，點了直接跳到那一段。</p>
            </div>

            <div className="card">
              <h2 style={{ fontSize: 20, marginBottom: 16 }}>原話</h2>
              <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                <div className="placeholder" style={{ minHeight: 120 }}>[ 逐字稿：來賓原話 ＋ 時間碼 ]</div>
                <div className="placeholder" style={{ minHeight: 120 }}>[ 逐字稿：來賓原話 ＋ 時間碼 ]</div>
              </div>
            </div>

            <div className="card">
              <h2 style={{ fontSize: 20 }}>Jason 這集問了什麼</h2>
              <p className="muted" style={{ margin: '6px 0 16px', fontSize: 14 }}>點一個問題，看其他來賓怎麼回答同一題。</p>
              <div className="chips" style={{ gap: 10 }}>
                {askedHere.map((q) => (
                  <Link key={q.text} to={`/explorer?q=${encodeURIComponent(q.text)}`} className="toggle" style={{ borderRadius: 8, background: 'var(--ground)', border: 0, textDecoration: 'none' }}>
                    {q.text}<span className="count muted">{q.answers.length} 位回答過</span>
                  </Link>
                ))}
                <span className="placeholder" style={{ padding: '10px 16px' }}>[ 其他問題：逐字稿說話者分離後擷取 ]</span>
              </div>
            </div>
          </div>

          <aside aria-label="也可以聽" className="side" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 18 }}>聽完這集，接著聽</h2>
            <p className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}>依共同主題推薦，不是依日期。</p>
            {related.map(({ e, shared }) => (
              <Link key={e.ep} to={`/episode/${e.ep}`} className="ep-card" style={{ padding: 18, gap: 8 }}>
                <span style={{ fontSize: 12, color: themeById[shared[0]].fg }}>同樣聊 {shared.map((s) => themeById[s].name).join(' · ')}</span>
                <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>{e.title}</span>
                <span className="meta">EP.{e.ep} · {e.guest}</span>
              </Link>
            ))}
          </aside>
        </div>
      </section>
      <Footer />
    </>
  );
}
