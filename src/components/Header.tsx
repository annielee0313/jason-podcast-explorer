import { Link, useNavigate } from 'react-router-dom';
import { about } from '../lib/data';

/** Landing-page sections the nav can jump to; Landing reads `state.scrollTo` / `state.openMap`. */
export type NavState = { scrollTo?: string; openMap?: boolean };

export function Header({ tool }: { tool?: string }) {
  const navigate = useNavigate();
  const go = (state: NavState) => navigate('/', { state });

  return (
    <header className="site-header">
      <Link to="/" className="logo">
        <span className="logo-mark">J</span>
        <span className="logo-text">{tool ?? 'Jason好好聊'}</span>
        {tool && <span className="tool-badge">內部工具</span>}
      </Link>
      <nav className="nav" aria-label="主選單">
        <button type="button" onClick={() => go({ scrollTo: 'paths' })}>從哪開始</button>
        <button type="button" onClick={() => go({ scrollTo: 'topics' })}>依主題</button>
        <button type="button" aria-haspopup="dialog" onClick={() => go({ openMap: true })}>來賓地圖</button>
        <button type="button" onClick={() => go({ scrollTo: 'browse' })}>所有單集</button>
        <button type="button" onClick={() => go({ scrollTo: 'about' })}>關於 Jason</button>
      </nav>
      <div className="header-actions">
        <a className="btn btn-soft" href={about.show.apple}>Apple Podcasts</a>
        <button type="button" className="btn btn-ink" onClick={() => go({ scrollTo: 'company' })}>{about.company.name}</button>
      </div>
    </header>
  );
}

export function Footer() {
  const { company, show } = about;
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="footer-brand">Jason好好聊</span>
          <span>本節目由{company.name}製作</span>
        </div>
        <div className="footer-col">
          <span className="footer-h">{company.name}</span>
          <a href={company.website} target="_blank" rel="noreferrer">官網 · {company.websiteLabel}</a>
          <a href={company.facebook} target="_blank" rel="noreferrer">粉絲團</a>
          <a href={`mailto:${company.email}`}>聯絡我們 · {company.email}</a>
        </div>
        <div className="footer-col">
          <span className="footer-h">收聽</span>
          <a href={show.apple}>Apple Podcasts</a>
          <a href={show.soundon}>SoundOn</a>
          <span>Spotify [連結待補]</span>
        </div>
        <div className="footer-col">
          <span className="footer-h">內部工具</span>
          <Link to="/explorer">語錄室</Link>
          <Link to="/studio">短影音工作台</Link>
        </div>
      </div>
    </footer>
  );
}
