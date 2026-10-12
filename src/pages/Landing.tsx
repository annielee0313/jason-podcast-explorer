import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Footer, Header, type NavState } from '../components/Header';
import { GuestMapModal } from '../components/GuestMap';
import { ArrowIcon, ArrowUpRightIcon, PlayIcon, ShuffleIcon, ThemeChip } from '../components/ui';
import {
  about, curation, episodes, findTerm, formatDuration, takeawayLines, themeById, themes, type ThemeId,
} from '../lib/data';

/** Numbered section heading: small index, big title, optional side note. */
function SectionHead({ n, title, note }: { n: string; title: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="section-head">
      <h2 className="section-title"><span className="section-n">{n}</span>{title}</h2>
      {note && <p className="section-note">{note}</p>}
    </div>
  );
}

export default function Landing() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mapOpen, setMapOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId | 'all'>('all');
  const [card, setCard] = useState(0);
  const latest = episodes[0];

  // Handle nav requests coming from the header (scroll to a section / open the guest map).
  useEffect(() => {
    const state = location.state as NavState | null;
    if (!state) return;
    if (state.openMap) setMapOpen(true);
    if (state.scrollTo) document.getElementById(state.scrollTo)?.scrollIntoView({ behavior: 'smooth' });
    navigate('.', { replace: true, state: null });
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeMap = useCallback(() => setMapOpen(false), []);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const browseTheme = (t: ThemeId | 'all') => { setTheme(t); scrollTo('browse'); };

  const filtered = episodes.filter((e) => theme === 'all' || e.themes.includes(theme));
  const countFor = (t: ThemeId) => episodes.filter((e) => e.themes.includes(t)).length;
  const topics = themes.map((t) => ({ t, count: countFor(t.id) })).sort((a, b) => b.count - a.count);

  const words = useMemo(
    () => curation.phrases
      .map((p) => ({ label: p.label, count: takeawayLines.filter((l) => findTerm(l.text, p.terms)).length }))
      .filter((w) => w.count > 0)
      .sort((a, b) => b.count - a.count),
    [],
  );
  const epsWithNotes = episodes.filter((e) => e.takeaways.length > 0).length;

  const deck = takeawayLines;
  const current = deck[card % deck.length];
  const { host, book, company } = about;

  return (
    <>
      <Header />

      <section className="hero" id="top">
        <div className="wrap hero-grid">
          <aside className="hero-rail" aria-label="主持人">
            <div className="host-photo"><img src="./host.jpg" alt="" /></div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>主持人 {host.name} Jason</div>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>{host.title}</div>
            <button type="button" className="link-btn" onClick={() => scrollTo('about')}>
              認識 Jason <span className="dot-icon"><ArrowIcon /></span>
            </button>
          </aside>

          <div>
            {/* TODO: derive 249 from the full episode list once all episodes are imported */}
            <h1 className="hero-title">
              <span className="hero-line">249 場對話
                <span className="hero-note">每集一位不同產業的來賓，聊他們怎麼做判斷、怎麼走過轉折。</span>
              </span>
              <span className="hero-line indent">從哪<span className="hl">一場</span></span>
              <span className="hero-line">開始聽？
                <button type="button" className="btn btn-ink hero-cta" onClick={() => scrollTo('paths')}>
                  <span className="dot-icon light"><ArrowIcon /></span>挑一條路
                </button>
              </span>
            </h1>
          </div>
        </div>

        <div className="wrap bento">
          <div className="tile tile-dark tile-latest">
            <div className="kicker">最新一集 · EP.{latest.ep} · {latest.date} · {formatDuration(latest.durationSec)}</div>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.45 }}>{latest.title}</div>
            <div style={{ fontSize: 15, color: 'var(--on-dark-muted)' }}>{latest.guest} · {latest.org}</div>
            <div className="chips" style={{ gap: 10, marginTop: 'auto' }}>
              {latest.appleUrl && <a className="btn btn-light" href={latest.appleUrl}><PlayIcon />Apple Podcasts 收聽</a>}
              <Link className="btn btn-ghost-dark" to={`/episode/${latest.ep}`}>看本集重點</Link>
            </div>
          </div>
          <div className="tile tile-cover"><img src="./host.jpg" alt="《Jason好好聊》節目封面：主持人楊佳燊 Jason" /></div>
          <div className="tile tile-teal">
            <span className="stat-n">249</span><span className="stat-l">集對話，2020 年開播</span>
          </div>
          <div className="tile tile-white">
            <span className="stat-n">200+</span><span className="stat-l">位來賓</span>
          </div>
          <div className="tile tile-white">
            <span className="stat-n">4.8</span><span className="stat-l">Apple Podcasts · 211 則評分</span>
          </div>
          <a className="tile tile-dark tile-company" href="#company" onClick={(e) => { e.preventDefault(); scrollTo('company'); }}>
            <span className="kicker">製作</span>
            <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5 }}>{company.name}<br />{company.nameEn}</span>
            <span className="dot-icon light" style={{ marginTop: 'auto' }}><ArrowUpRightIcon /></span>
          </a>
        </div>
      </section>

      <section className="section" id="paths">
        <div className="wrap panel">
          <SectionHead n="01" title={<>不知道從哪開始？<br />挑一條路</>} note="依你現在的處境串好的收聽清單，按順序聽就好。" />
          <div className="path-grid">
            {curation.paths.map((p, i) => {
              const t = themeById[p.theme];
              return (
                <button key={p.title} type="button" className={`path-card${i === 1 ? ' featured' : ''}`} onClick={() => browseTheme(p.theme)}>
                  <span className="chip" style={{ background: i === 1 ? 'rgba(255,255,255,.55)' : t.bg, color: t.fg, alignSelf: 'flex-start' }}>{t.name}</span>
                  <span className="path-title">{p.title}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.7, opacity: 0.85 }}>{p.blurb}</span>
                  <span className="path-foot">
                    <span className="mono" style={{ fontSize: 13 }}>{p.eps.length} 集 · EP.{p.eps.join(' ')}</span>
                    <span className="dot-icon"><ArrowUpRightIcon /></span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap row">
          <div className="card grow" style={{ flex: '3 1 520px' }}>
            <h3 className="card-title">Jason 親選</h3>
            <p className="muted" style={{ margin: '8px 0 20px', fontSize: 15 }}>主持人自己最想讓新聽眾先聽的幾集。</p>
            {curation.jasonPicks.length === 0 ? (
              <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                {[1, 2, 3].map((n) => (
                  <div key={n} className="placeholder" style={{ minHeight: 140 }}>[ 親選 #{n} ]<br />單集 + Jason 一句推薦理由</div>
                ))}
              </div>
            ) : null /* TODO: render picks from curation.jasonPicks */}
          </div>
          <div className="card side" style={{ flex: '2 1 360px' }}>
            <h3 className="card-title">最多人重播</h3>
            <p className="muted" style={{ margin: '8px 0 20px', fontSize: 15 }}>聽眾一聽再聽的集數。</p>
            {[1, 2, 3].map((n) => (
              <div key={n} className="placeholder" style={{ padding: '12px 16px', marginBottom: 10, fontSize: 14 }}>
                <span className="mono" style={{ fontSize: 20, marginRight: 14 }}>0{n}</span>[ SoundOn / Spotify 後台播放數據 ]
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="topics">
        <div className="wrap">
          <SectionHead n="02" title="依主題逛" note={`最近 ${episodes.length} 集，每個主題出現在幾集裡。主題為人工標記草稿。`} />
          <ol className="topic-list">
            {topics.map(({ t, count }, i) => (
              <li key={t.id}>
                <button type="button" className="topic-row" onClick={() => browseTheme(t.id)}>
                  <span className="topic-n">{String(i + 1).padStart(2, '0')} /</span>
                  <span className="topic-name">{t.name}</span>
                  <span className="topic-count">{count} 集</span>
                  <span className="topic-dot" style={{ background: t.dot }} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" id="browse">
        <div className="wrap">
          <SectionHead n="03" title="所有單集" note={`共 ${episodes.length} 集 · 顯示 ${filtered.length} 集`} />
          <div className="browse">
            <div role="group" aria-label="依主題篩選" className="theme-rail">
              <button type="button" className="rail-btn" aria-pressed={theme === 'all'} onClick={() => setTheme('all')}>
                <span className="rail-dot" style={{ background: 'var(--ink)' }} />全部<span className="count">{episodes.length}</span>
              </button>
              {themes.map((t) => (
                <button key={t.id} type="button" className="rail-btn" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
                  <span className="rail-dot" style={{ background: t.dot }} />{t.name}<span className="count">{countFor(t.id)}</span>
                </button>
              ))}
            </div>
            <div>
              <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {filtered.map((e) => (
                  <Link key={e.ep} to={`/episode/${e.ep}`} className="ep-card">
                    <span className="meta">EP.{e.ep} · {e.date} · {formatDuration(e.durationSec)}</span>
                    <span className="title">{e.title}</span>
                    <span className="muted" style={{ fontSize: 14 }}>{e.guest} · {e.org}</span>
                    <span className="ep-foot">
                      <span className="chips">{e.themes.map((t) => <ThemeChip key={t} id={t} />)}</span>
                      <span className="dot-icon"><ArrowUpRightIcon /></span>
                    </span>
                  </Link>
                ))}
              </div>
              {filtered.length === 0 && <p className="muted" style={{ marginTop: 24, fontSize: 16 }}>這個主題目前沒有單集，換一個看看。</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap row">
          <div className="card" style={{ flex: '1 1 380px', minWidth: 0 }}>
            <h3 className="card-title">反覆出現的詞</h3>
            <p className="muted" style={{ margin: '8px 0 24px', fontSize: 15 }}>
              最近 {epsWithNotes} 集的節目說明裡，被說了好幾次的詞。點一個，看它出現在哪。
            </p>
            <div className="chips" style={{ gap: 10 }}>
              {words.map((w) => (
                <Link key={w.label} to={`/explorer?phrase=${encodeURIComponent(w.label)}`} className="toggle soft"
                  style={{ textDecoration: 'none', fontWeight: 700, fontSize: 15 + w.count * 2 }}>
                  {w.label}<span className="count muted" style={{ fontWeight: 400 }}>×{w.count}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="deck" style={{ flex: '999 1 560px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span className="kicker">抽一句 · 每集的五個重點</span>
              <span className="mono" style={{ fontSize: 13, color: 'var(--on-dark-muted)' }}>{(card % deck.length) + 1} / {deck.length}</span>
            </div>
            <blockquote>「{current.text}」</blockquote>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ fontSize: 15, color: 'var(--on-dark-muted)' }}>
                <span className="mono" style={{ color: 'var(--teal-light)' }}>EP.{current.ep}</span> · {current.guest}
              </div>
              <div className="chips" style={{ gap: 10 }}>
                <button type="button" className="btn btn-ghost-dark" onClick={() => setCard((c) => c + 1)}><ShuffleIcon />再抽一張</button>
                <Link className="btn btn-light" to={`/episode/${current.ep}`}>聽這一集</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap band">
          <div style={{ flex: '999 1 520px', minWidth: 0 }}>
            <h2 className="band-title">200 多位來賓，怎麼連在一起？</h2>
            <p style={{ margin: '12px 0 20px', fontSize: 16, lineHeight: 1.7 }}>聊過同一個主題的來賓會被連起來。從一位你認識的人出發，找到下一位。</p>
            <div className="chips" style={{ gap: 8 }}>
              {episodes.map((e) => <span key={e.ep} className="pill">{e.guest}</span>)}
            </div>
          </div>
          <button type="button" className="btn btn-ink" aria-haspopup="dialog" onClick={() => setMapOpen(true)} style={{ minHeight: 52, padding: '0 8px 0 24px', fontSize: 16 }}>
            打開來賓地圖 <span className="dot-icon light"><ArrowIcon /></span>
          </button>
        </div>
      </section>

      <section className="section" id="about">
        <div className="wrap">
          <SectionHead n="04" title="關於 Jason" />
          <div className="about-grid">
            <div className="card about-host">
              <div className="about-photo"><img src="./host.jpg" alt="主持人 楊佳燊 Jason" /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <div>
                  <div className="about-name">{host.name} <span className="latin">{host.nameEn}</span></div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--teal-strong)', marginTop: 6 }}>{host.title}</div>
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
              <span style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--on-dark-muted)' }}>{book.subtitle}</span>
              <ul className="book-lessons">
                {book.lessons.map((l) => <li key={l}>{l}</li>)}
              </ul>
              <span className="book-foot">在博客來看這本書 <span className="dot-icon light"><ArrowUpRightIcon /></span></span>
            </a>
          </div>
        </div>
      </section>

      <section className="section" id="company" style={{ paddingBottom: 80 }}>
        <div className="wrap company">
          <div className="company-copy">
            <span className="kicker">本節目由 {company.name} 製作</span>
            <h2 className="company-title">{company.name}<br /><span className="latin">{company.nameEn}</span></h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.75 }}>
              {company.blurb}由 Jason 創辦，《Jason好好聊》也是他們的原創節目。
            </p>
            <a className="btn btn-ink" href={`mailto:${company.email}`} style={{ alignSelf: 'flex-start', minHeight: 52, padding: '0 8px 0 24px', fontSize: 16 }}>
              合作洽詢 <span className="dot-icon light"><ArrowIcon /></span>
            </a>
          </div>
          <div className="company-links">
            <a className="company-link" href={company.website} target="_blank" rel="noreferrer">
              <span className="muted" style={{ fontSize: 13 }}>官網</span>
              <span className="company-link-label">{company.websiteLabel}</span>
              <span className="dot-icon"><ArrowUpRightIcon /></span>
            </a>
            <a className="company-link" href={company.facebook} target="_blank" rel="noreferrer">
              <span className="muted" style={{ fontSize: 13 }}>粉絲團</span>
              <span className="company-link-label">facebook.com/jsadways</span>
              <span className="dot-icon"><ArrowUpRightIcon /></span>
            </a>
            <a className="company-link" href={`mailto:${company.email}`}>
              <span className="muted" style={{ fontSize: 13 }}>聯絡我們</span>
              <span className="company-link-label">{company.email}</span>
              <span className="dot-icon"><ArrowUpRightIcon /></span>
            </a>
          </div>
        </div>
      </section>

      <Footer />
      <GuestMapModal open={mapOpen} onClose={closeMap} />
    </>
  );
}
