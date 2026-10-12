import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Footer, Header, type NavState } from '../components/Header';
import { GuestMapModal } from '../components/GuestMap';
import { ArrowIcon, PlayIcon, ShuffleIcon, ThemeChip } from '../components/ui';
import {
  curation, episodes, findTerm, formatDuration, takeawayLines, themeById, themes, type ThemeId,
} from '../lib/data';

const LENGTHS = ['全部', '1 小時內', '1 小時以上'] as const;
type Length = (typeof LENGTHS)[number];

export default function Landing() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mapOpen, setMapOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId | 'all'>('all');
  const [length, setLength] = useState<Length>('全部');
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

  const filtered = episodes.filter((e) => {
    if (theme !== 'all' && !e.themes.includes(theme)) return false;
    const min = e.durationSec ? e.durationSec / 60 : null;
    if (length === '1 小時內' && !(min !== null && min <= 60)) return false;
    if (length === '1 小時以上' && !(min !== null && min > 60)) return false;
    return true;
  });

  const bars = themes
    .map((t) => ({ t, count: episodes.filter((e) => e.themes.includes(t.id)).length }))
    .sort((a, b) => b.count - a.count);

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

  return (
    <>
      <Header />

      <section className="hero" id="top">
        <div className="wrap row" style={{ gap: 48, alignItems: 'flex-end' }}>
          <div className="grow">
            <div className="host">
              <div className="host-photo"><img src="./host.jpg" alt="主持人 楊佳燊 Jason" /></div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>主持人 楊佳燊 Jason</div>
                <div className="kicker" style={{ marginTop: 4 }}>商業 PODCAST · 2020 年開播 · 傑思‧愛德威製作</div>
              </div>
            </div>
            <h1>249 場對話，<br /><span className="ribbon">從哪一場開始聽？</span></h1>
            <p style={{ margin: '24px 0 0', fontSize: 19, lineHeight: 1.75, color: 'var(--on-dark-muted)', maxWidth: 640 }}>
              傑思‧愛德威創辦人 楊佳燊 Jason，每一集邀請一位不同產業的來賓，聊他們怎麼做判斷、怎麼走過轉折。這裡沒有搜尋框，換個方式逛。
            </p>
            <div className="stats">
              {/* TODO: derive from the full episode list once all 249 are imported */}
              <div><div className="stat-n">249</div><div className="stat-l">集</div></div>
              <div><div className="stat-n">200+</div><div className="stat-l">位來賓</div></div>
              <div><div className="stat-n">6</div><div className="stat-l">年</div></div>
              <div><div className="stat-n">4.8</div><div className="stat-l">Apple Podcasts · 211 則評分</div></div>
            </div>
          </div>
          <aside aria-label="最新一集" className="latest side">
            <div className="kicker">最新一集 · EP.{latest.ep} · {latest.date} · {formatDuration(latest.durationSec)}</div>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.45, marginTop: 14 }}>{latest.title}</div>
            <div style={{ fontSize: 15, color: 'var(--on-dark-muted)', marginTop: 10 }}>{latest.guest} · {latest.org}</div>
            <div className="chips" style={{ gap: 10, marginTop: 24 }}>
              {latest.appleUrl && (
                <a className="btn btn-light" href={latest.appleUrl}><PlayIcon />Apple Podcasts 收聽</a>
              )}
              <Link className="btn btn-ghost-dark" to={`/episode/${latest.ep}`}>看本集重點</Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="section" id="paths" style={{ paddingTop: 72 }}>
        <div className="wrap">
          <h2 className="section-title">不知道從哪開始？挑一條路</h2>
          <p className="section-sub">依你現在的處境串好的收聽清單，按順序聽就好。</p>
          <div className="grid-auto" style={{ gap: 20 }}>
            {curation.paths.map((p) => {
              const t = themeById[p.theme];
              return (
                <button key={p.title} type="button" className="path-card" onClick={() => {
                  setTheme(p.theme);
                  document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' });
                }}>
                  <span className="path-bar" style={{ background: t.dot }} />
                  <span className="path-title">{p.title}</span>
                  <span className="muted" style={{ fontSize: 15, lineHeight: 1.7 }}>{p.blurb}</span>
                  <span className="mono" style={{ fontSize: 13, color: t.fg }}>{p.eps.length} 集 · EP.{p.eps.join(' ')}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap row">
          <div className="card grow" style={{ flex: '3 1 520px' }}>
            <h2 style={{ fontSize: 26 }}>Jason 親選</h2>
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
            <h2 style={{ fontSize: 26 }}>最多人重播</h2>
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
        <div className="wrap row">
          <div className="card" style={{ flex: '1 1 480px', minWidth: 0 }}>
            <h2 style={{ fontSize: 26 }}>最近在聊什麼</h2>
            <p className="muted" style={{ margin: '8px 0 24px', fontSize: 15 }}>最近 {episodes.length} 集，每個主題出現在幾集裡（主題為人工標記草稿）。</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {bars.map(({ t, count }) => (
                <div key={t.id} className="bar-row">
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{t.name}</span>
                  <span className="bar-track"><span className="bar-fill" style={{ display: 'block', width: `${(count / episodes.length) * 100}%`, background: t.dot }} /></span>
                  <span className="mono" style={{ fontSize: 14, textAlign: 'right' }}>{count} 集</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ flex: '1 1 480px', minWidth: 0 }}>
            <h2 style={{ fontSize: 26 }}>反覆出現的詞</h2>
            <p className="muted" style={{ margin: '8px 0 24px', fontSize: 15 }}>
              最近 {epsWithNotes} 集的節目說明裡，被說了好幾次的詞。點一個，看它出現在哪。
            </p>
            <div className="chips" style={{ gap: 10 }}>
              {words.map((w) => (
                <Link key={w.label} to={`/explorer?phrase=${encodeURIComponent(w.label)}`} className="toggle"
                  style={{ background: 'var(--ground)', border: 0, textDecoration: 'none', fontWeight: 700, fontSize: 15 + w.count * 2 }}>
                  {w.label}<span className="count muted" style={{ fontWeight: 400 }}>×{w.count}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap card row" style={{ padding: 40, gap: 40, alignItems: 'center', borderRadius: 20 }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <h2 style={{ fontSize: 30 }}>抽一句</h2>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 16, lineHeight: 1.7 }}>每集都有五個重點。隨手抽一句，有感覺就去聽那一集。</p>
            <div className="mono" style={{ fontSize: 13, color: 'var(--muted-2)', marginTop: 16 }}>{(card % deck.length) + 1} / {deck.length}</div>
          </div>
          <div className="deck grow" style={{ flex: '999 1 560px' }}>
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
            <h2 style={{ fontSize: 30 }}>200 多位來賓，怎麼連在一起？</h2>
            <p style={{ margin: '12px 0 20px', fontSize: 16, lineHeight: 1.7 }}>聊過同一個主題的來賓會被連起來。從一位你認識的人出發，找到下一位。</p>
            <div className="chips" style={{ gap: 8 }}>
              {episodes.map((e) => <span key={e.ep} className="pill">{e.guest}</span>)}
            </div>
          </div>
          <button type="button" className="btn btn-ink" aria-haspopup="dialog" onClick={() => setMapOpen(true)} style={{ minHeight: 48, padding: '0 24px', fontSize: 16 }}>
            打開來賓地圖 <ArrowIcon />
          </button>
        </div>
      </section>

      <section className="section" id="browse" style={{ paddingBottom: 80 }}>
        <div className="wrap">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <h2 className="section-title">所有單集</h2>
            <span className="mono muted" style={{ fontSize: 14 }}>共 {episodes.length} 集 · 顯示 {filtered.length} 集</span>
          </div>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div role="group" aria-label="依主題" className="chips" style={{ gap: 8, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 14, width: 48 }}>主題</span>
              <button type="button" className="toggle" aria-pressed={theme === 'all'} onClick={() => setTheme('all')}>
                全部<span className="count">{episodes.length}</span>
              </button>
              {themes.map((t) => (
                <button key={t.id} type="button" className="toggle" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
                  {t.name}<span className="count">{episodes.filter((e) => e.themes.includes(t.id)).length}</span>
                </button>
              ))}
            </div>
            <div role="group" aria-label="依長度" className="chips" style={{ gap: 8, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 14, width: 48 }}>長度</span>
              {LENGTHS.map((l) => (
                <button key={l} type="button" className="toggle" aria-pressed={length === l} onClick={() => setLength(l)}>{l}</button>
              ))}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>之後可加：產業 · 來賓身分（創辦人 / 二代接班 / 作者 / 醫師）· 職涯轉折 · 年份</p>
          </div>
          <div className="grid-auto" style={{ marginTop: 28, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {filtered.map((e) => (
              <Link key={e.ep} to={`/episode/${e.ep}`} className="ep-card">
                <span className="meta">EP.{e.ep} · {e.date} · {formatDuration(e.durationSec)}</span>
                <span className="title">{e.title}</span>
                <span className="muted" style={{ fontSize: 14 }}>{e.guest} · {e.org}</span>
                <span className="chips">{e.themes.map((t) => <ThemeChip key={t} id={t} />)}</span>
              </Link>
            ))}
          </div>
          {filtered.length === 0 && <p className="muted" style={{ marginTop: 24, fontSize: 16 }}>這個組合目前沒有單集，換一個主題或長度看看。</p>}
        </div>
      </section>

      <Footer />
      <GuestMapModal open={mapOpen} onClose={closeMap} />
    </>
  );
}
