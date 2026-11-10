import { Link, useParams } from 'react-router-dom';
import { Footer, Header } from '../components/Header';
import { ArrowUpRightIcon } from '../components/ui';
import { themeById, themes, topicFacts, type ThemeId } from '../lib/data';

/**
 * Topic pages for search and AI answers: one page per theme with a factual intro (counts,
 * industries, date range, all computed from data/), the matching 從哪裡開始 path, and every
 * episode in that theme with its guest and show-note points as plain text.
 */
export function TopicIndex() {
  return (
    <>
      <Header />
      <section className="section">
        <div className="wrap">
          <p className="kicker kicker-light">TOPICS</p>
          <h1 className="ep-title">依主題找集數</h1>
          <ul className="topic-index">
            {themes.map((t) => {
              const f = topicFacts(t.id as ThemeId);
              return (
                <li key={t.id}>
                  <Link to={`/topics/${t.id}/`} className="topic-index-link" data-track="topic_click" data-topic={t.id}>
                    <span className="index-dot" style={{ background: t.dot }} aria-hidden="true" />
                    <span className="topic-index-name">{t.name}</span>
                    <span className="topic-index-count mono">{f.eps.length} 集</span>
                    <span className="dot-icon"><ArrowUpRightIcon /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
      <Footer />
    </>
  );
}

export default function TopicPage() {
  const { id } = useParams();
  const theme = themeById[id as ThemeId];
  if (!theme) return <TopicIndex />;
  const f = topicFacts(theme.id as ThemeId);

  return (
    <>
      <Header />
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="wrap topic-head">
          <nav aria-label="麵包屑" className="crumbs"><Link to="/">首頁</Link> / <Link to="/topics/">主題</Link> / {theme.name}</nav>
          <h1 className="ep-title">{theme.name}：{f.eps.length} 集相關對話</h1>
          <p className="topic-intro">
            《Jason好好聊》聊到「{theme.name}」的有 {f.eps.length} 集
            {f.topIndustries.length > 0 && <>，來賓多來自{f.topIndustries.join('、')}等產業</>}
            {f.first && f.latest && <>，從 {f.first.date.slice(0, 4)} 年的 EP.{f.first.ep} 到最新的 EP.{f.latest.ep}（{f.latest.date}）</>}。
            每集都附上節目說明裡的重點，點進去可以看影片和收聽連結。
          </p>
          {f.paths.map((p) => (
            <div key={p.title} className="topic-path">
              <span className="kicker kicker-light">推薦先聽</span>
              <strong>{p.title}</strong>
              <span className="muted">{p.blurb}</span>
              <span className="topic-path-eps">{p.eps.map((n) => <Link key={n} to={`/episode/${n}/`}>EP.{n}</Link>)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <ol className="topic-list">
            {f.eps.map((e) => (
              <li key={e.ep}>
                <Link to={`/episode/${e.ep}/`} className="topic-ep" data-track="topic_episode_click" data-ep={e.ep}>
                  <span className="meta mono">EP.{e.ep} · {e.date}</span>
                  <span className="topic-ep-title">{e.title}</span>
                  <span className="muted">{e.guest}{e.org ? ` · ${e.org}` : ''}</span>
                </Link>
                {e.takeaways.length > 0 && (
                  <ul className="topic-ep-points">{e.takeaways.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul>
                )}
              </li>
            ))}
          </ol>
          <nav aria-label="其他主題" className="topic-others">
            <span className="kicker kicker-light">其他主題</span>
            {themes.filter((t) => t.id !== theme.id).map((t) => (
              <Link key={t.id} to={`/topics/${t.id}/`} className="chip" style={{ background: t.bg, color: t.fg }}>{t.name}</Link>
            ))}
          </nav>
        </div>
      </section>
      <Footer />
    </>
  );
}
