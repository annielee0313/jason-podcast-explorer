import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Footer, Header } from '../components/Header';
import { PlayIcon, ThemeChip } from '../components/ui';
import { TranscriptPanel } from '../components/TranscriptPanel';
import { about, episodeByNumber, formatDuration, relatedEpisodes, themeById, transcriptEps } from '../lib/data';

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
  const hasTranscript = transcriptEps.includes(ep.ep);

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
              {about.show.spotify && <a className="btn btn-light" href={about.show.spotify} target="_blank" rel="noreferrer"><PlayIcon />Spotify</a>}
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

            {/* Only what this episode actually has: no empty placeholders for missing data. */}
            {ep.takeaways.length > 0 && (
              <div className="card">
                <h2 style={{ fontSize: 20, marginBottom: 20 }}>這集在聊</h2>
                <ol className="ep-points">
                  {ep.takeaways.map((t) => {
                    const [head, ...rest] = t.split('：');
                    return <li key={t}>{rest.length ? <><strong>{head}</strong>：{rest.join('：')}</> : t}</li>;
                  })}
                </ol>
                <p className="muted" style={{ margin: '16px 0 0', fontSize: 13 }}>重點取自節目說明。</p>
              </div>
            )}

            {hasTranscript && (
              <div className="card" id="transcript">
                <h2 style={{ fontSize: 20, marginBottom: 16 }}>逐字稿</h2>
                <TranscriptPanel ep={ep.ep} />
              </div>
            )}
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
