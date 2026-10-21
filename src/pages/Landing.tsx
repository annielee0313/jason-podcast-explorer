import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Footer, Header, type NavState } from '../components/Header';
import { EpisodeBrowser } from '../components/EpisodeBrowser';
import { GuestMap } from '../components/GuestMap';
import { HeroBackground } from '../components/HeroBackground';
import { PathIndex } from '../components/PathIndex';
import { ArrowIcon, ArrowUpRightIcon, PlayIcon, ShuffleIcon, ThemeChip } from '../components/ui';
import { useLandingMotion } from '../lib/motion';
import { CountUp } from '../components/CountUp';
import {
  about, curation, deckLines, episodeByNumber, episodes, findTerm, formatDuration, takeawayLines, themeById,
} from '../lib/data';

/**
 * Magazine-style section heading: a margin column with the index and a Latin
 * label, the serif title, and an optional note on the right.
 */
function SectionHead({ n, en, title, note }: { n: string; en: string; title: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div className="section-mark" aria-hidden="true">
        <span className="section-n">{n}</span>
        <span className="section-en">{en}</span>
      </div>
      <h2 className="section-title">{title}</h2>
      {note ? <p className="section-note">{note}</p> : <span />}
    </div>
  );
}

export default function Landing() {
  const location = useLocation();
  const navigate = useNavigate();
  const [card, setCard] = useState(0);
  const latest = episodes[0];
  const rootRef = useRef<HTMLDivElement>(null);
  useLandingMotion(rootRef);

  // Handle nav requests coming from the header (scroll to a section).
  useEffect(() => {
    const state = location.state as NavState | null;
    if (!state) return;
    if (state.scrollTo) document.getElementById(state.scrollTo)?.scrollIntoView({ behavior: 'smooth' });
    navigate('.', { replace: true, state: null });
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });


  const words = useMemo(
    () => curation.phrases
      .map((p) => ({ label: p.label, count: takeawayLines.filter((l) => findTerm(l.text, p.terms)).length }))
      .filter((w) => w.count > 0)
      .sort((a, b) => b.count - a.count),
    [],
  );
  const epsWithNotes = episodes.filter((e) => e.takeaways.length > 0).length;

  const deck = deckLines.length ? deckLines : takeawayLines;
  const current = deck[card % deck.length];
  // A random line from a different episode each draw. The prerendered page shows the first
  // line; the random pick happens after load so server and browser HTML match.
  const draw = () => setCard((c) => {
    for (let i = 0; i < 20; i++) {
      const n = Math.floor(Math.random() * deck.length);
      if (deck[n].ep !== deck[c % deck.length].ep) return n;
    }
    return (c + 1) % deck.length;
  });
  useEffect(draw, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { host, book, company, stats } = about;

  return (
    <div ref={rootRef}>
      <Header />

      <section className="hero" id="top">
        <HeroBackground />
        <div className="wrap hero-grid">
          <div>
            <h1 className="hero-title">
              <span className="hero-line"><span className="hero-text"><CountUp value={stats.episodes} /> 場對話</span></span>
              <span className="hero-line"><span className="hero-text">從哪一場開始聽？</span></span>
            </h1>
            <div className="hero-foot">
              <p className="hero-note">每一集，Jason 找一位不同產業的人坐下來好好聊：怎麼做決定、怎麼撐過難關。</p>
            </div>
          </div>

          <aside className="hero-rail" aria-label="主持人">
            <div className="host-photo"><img src={`${import.meta.env.BASE_URL}host.jpg`} alt="" /></div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>主持人 {host.name} Jason</div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>{host.title}</div>
            <button type="button" className="link-btn" onClick={() => scrollTo('about')}>
              認識 Jason <span className="dot-icon"><ArrowIcon /></span>
            </button>
          </aside>
        </div>

        <div className="bento">
          <div className="tile tile-dark tile-latest">
            <img className="tile-latest-art" src={`${import.meta.env.BASE_URL}host.jpg`} alt="《Jason好好聊》節目封面：主持人楊佳燊 Jason" />
            <div className="tile-latest-body">
              <div className="kicker">最新一集 · EP.{latest.ep} · {latest.date} · {formatDuration(latest.durationSec)}</div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.45 }}>{latest.title}</div>
            <div style={{ fontSize: 14, color: 'var(--on-dark-muted)' }}>{latest.guest} · {latest.org}</div>
            <div className="chips" style={{ gap: 10, marginTop: 'auto' }}>
              {latest.appleUrl && <a className="btn btn-light" href={latest.appleUrl}><PlayIcon />Apple Podcasts 收聽</a>}
              <Link className="btn btn-ghost-dark" to={`/episode/${latest.ep}`}>先看重點</Link>
            </div>
            </div>
          </div>
          <div className="tile tile-teal">
            <span className="stat-n">{stats.episodes}</span><span className="stat-l">集，從 {stats.since} 年聊到現在</span>
          </div>
          <div className="tile tile-white">
            <span className="stat-n">{stats.guestsFloor}+</span><span className="stat-l">位來賓</span>
          </div>
          <div className="tile tile-white">
            <span className="stat-n">{stats.rating}</span><span className="stat-l">Apple Podcasts · {stats.ratingCount} 則評分</span>
          </div>
          <a className="tile tile-dark tile-company" href="#company" onClick={(e) => { e.preventDefault(); scrollTo('company'); }}>
            <span className="kicker">節目製作</span>
            <span className="tile-company-name">{company.name}</span>
            <span className="tile-company-en">{company.nameEn}</span>
            <span className="dot-icon light tile-corner"><ArrowUpRightIcon /></span>
          </a>
        </div>
      </section>

      <section className="section section-white" id="paths">
        <div className="wrap">
          <SectionHead n="01" en="WHERE TO START" title={<>不知道先聽哪集？<br />從你現在的處境開始</>} note="我們照幾種常見的處境，把相關的集數串成一條路。點一條展開，從第一集往下聽就好。" />
          <PathIndex />
        </div>
      </section>

      <section className="section">
        <div className="wrap row">
          <div className="card grow" style={{ flex: '3 1 520px' }}>
            <div className="list-head">
              <h3 className="card-title">Jason 親選</h3>
              {curation.jasonPicks.some((p) => p.tentative) && <span className="list-flag">暫定，待 Jason 確認</span>}
            </div>
            <p className="muted" style={{ margin: '8px 0 20px', fontSize: 14 }}>如果只能推薦幾集給新朋友，Jason 會選這些。</p>
            {curation.jasonPicks.length ? (
              <ol className="pick-list">
                {curation.jasonPicks.map((p) => {
                  const e = episodeByNumber(p.ep);
                  if (!e) return null;
                  return (
                    <li key={p.ep}>
                      <Link to={`/episode/${e.ep}`} className="pick-row">
                        <span className="pick-ep mono">EP.{e.ep}</span>
                        <span className="pick-main">
                          <span className="pick-title">{e.title}</span>
                          <span className="pick-why">{p.reason || <span className="muted">推薦理由待補</span>}</span>
                        </span>
                        <span className="pick-guest">{e.guest}</span>
                        <span className="ep-line-arrow" aria-hidden="true"><ArrowIcon /></span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="placeholder">[ 親選：在 Google Sheet 的「Jason親選」分頁填入集數與推薦理由 ]</div>
            )}
          </div>
          <div className="card side" style={{ flex: '2 1 360px' }}>
            <h3 className="card-title">最多人收聽</h3>
            <p className="muted" style={{ margin: '8px 0 20px', fontSize: 14 }}>
              {curation.mostListened.length
                ? `依 ${[...new Set(curation.mostListened.map((t) => t.source).filter(Boolean))].join('、') || '收聽數'} 統計${curation.mostListened[0].period ? `（${curation.mostListened[0].period}）` : ''} · ${curation.mostListened[0].updated} 更新`
                : '大家最常聽的幾集。'}
            </p>
            {curation.mostListened.length ? (
              <ol className="rank-list">
                {curation.mostListened.map((t) => {
                  const e = episodeByNumber(t.ep);
                  if (!e) return null;
                  return (
                    <li key={t.rank}>
                      <Link to={`/episode/${e.ep}`} className="rank-row">
                        <span className="rank-n">{String(t.rank).padStart(2, '0')}</span>
                        <span className="pick-main">
                          <span className="pick-title">{e.title}</span>
                          <span className="pick-why mono">EP.{e.ep} · {e.guest}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="placeholder">[ 在 Google Sheet 的「最多人收聽」分頁填入排名 ]</div>
            )}
          </div>
        </div>
      </section>

      <section className="section" id="browse">
        <div className="wrap">
          <SectionHead n="02" en="ALL EPISODES" title="全部集數" note="用主題或來賓產業篩選，或一頁一頁往回翻。" />
          <EpisodeBrowser />
        </div>
      </section>

      <section className="section">
        <div className="wrap row">
          <div className="card" style={{ flex: '1 1 380px', minWidth: 0 }}>
            <h3 className="card-title">常被聊到的詞</h3>
            <p className="muted" style={{ margin: '8px 0 24px', fontSize: 14 }}>
              這幾個詞在 {epsWithNotes} 集的節目重點裡一再出現。點一個，看它出現在哪幾集。
            </p>
            <div className="chips" style={{ gap: 10 }}>
              {words.map((w) => (
                <Link key={w.label} to={`/explorer?phrase=${encodeURIComponent(w.label)}`} className="toggle soft"
                  style={{ textDecoration: 'none', fontWeight: 700, fontSize: 14 + Math.round((14 * w.count) / words[0].count) }}>
                  {w.label}<span className="count muted" style={{ fontWeight: 400 }}>×{w.count}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="deck" style={{ flex: '999 1 560px' }}>
            <span className="kicker">隨手抽一句</span>
            <blockquote>{current.text}</blockquote>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div className="deck-source">
                <span className="deck-ep"><span className="mono">EP.{current.ep}</span>　{current.title}</span>
                <span className="deck-guest">節目重點 · {current.guest}{current.org ? ` · ${current.org}` : ''}</span>
              </div>
              <div className="chips" style={{ gap: 10 }}>
                <button type="button" className="btn btn-ghost-dark" onClick={draw}><ShuffleIcon />再抽一張</button>
                <Link className="btn btn-light" to={`/episode/${current.ep}`}>看這一集</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="map">
        <div className="wrap">
          <SectionHead n="03" en="GUEST MAP" title={`${stats.guestsFloor} 多位來賓，怎麼連在一起？`}
            note="聊過同一個主題的來賓，會被線連在一起。點一位你認識的人，看看還有誰聊過一樣的主題。" />
          <GuestMap initialEp={latest.ep} />
        </div>
      </section>

      <section className="section" id="about">
        <div className="wrap">
          <SectionHead n="04" en="THE HOST" title="關於 Jason" />
          <div className="about-grid">
            <div className="card about-host">
              <div className="about-photo"><img src={`${import.meta.env.BASE_URL}host.jpg`} alt="主持人 楊佳燊 Jason" /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <div>
                  <div className="about-name">{host.name} <span className="latin">{host.nameEn}</span></div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal-strong)', marginTop: 6 }}>{host.title}</div>
                </div>
                <ul className="fact-list">
                  {host.facts.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <div className="chips" style={{ gap: 8 }}>
                  {host.awards.map((a) => <span key={a} className="chip soft">{a}</span>)}
                </div>
              </div>
            </div>
            <a className="book-card" href={book.url} target="_blank" rel="noreferrer">
              <span className="kicker">Jason 的書 · {book.publisher} · {book.date.slice(0, 4)}</span>
              <span className="book-title">{book.title}</span>
              <span className="book-sub">{book.subtitle}</span>
              <ul className="book-lessons">
                {book.lessons.map((l) => <li key={l}>{l}</li>)}
              </ul>
              <span className="book-foot">在博客來看這本書 <span className="dot-icon light"><ArrowUpRightIcon /></span></span>
            </a>
          </div>
        </div>
      </section>

      <section className="section section-white" id="company">
        <div className="wrap company">
          <div className="company-copy">
            <span className="kicker">本節目由 {company.name} 製作</span>
            <h2 className="company-title">{company.name}<br /><span className="latin">{company.nameEn}</span></h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75 }}>
              《Jason好好聊》由{company.name}製作。這是 Jason 創辦、{company.blurb}
            </p>
            <a className="btn btn-ink" href={`mailto:${company.email}`} style={{ alignSelf: 'flex-start', minHeight: 52, padding: '0 8px 0 24px', fontSize: 14 }}>
              聊聊合作 <span className="dot-icon light"><ArrowIcon /></span>
            </a>
          </div>
          <div className="company-links">
            <a className="company-link" href={company.website} target="_blank" rel="noreferrer">
              <span className="muted" style={{ fontSize: 12 }}>官網</span>
              <span className="company-link-label">{company.websiteLabel}</span>
              <span className="dot-icon"><ArrowUpRightIcon /></span>
            </a>
            <a className="company-link" href={company.facebook} target="_blank" rel="noreferrer">
              <span className="muted" style={{ fontSize: 12 }}>粉絲團</span>
              <span className="company-link-label">facebook.com/jsadways</span>
              <span className="dot-icon"><ArrowUpRightIcon /></span>
            </a>
            <a className="company-link" href={`mailto:${company.email}`}>
              <span className="muted" style={{ fontSize: 12 }}>聯絡我們</span>
              <span className="company-link-label">{company.email}</span>
              <span className="dot-icon"><ArrowUpRightIcon /></span>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
