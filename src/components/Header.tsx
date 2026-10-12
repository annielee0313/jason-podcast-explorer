import { Link, useNavigate } from 'react-router-dom';

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
        <button type="button" onClick={() => go({ scrollTo: 'topics' })}>最近在聊</button>
        <button type="button" aria-haspopup="dialog" onClick={() => go({ openMap: true })}>來賓地圖</button>
        <button type="button" onClick={() => go({ scrollTo: 'browse' })}>所有單集</button>
        <Link to="/explorer">語錄室</Link>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between' }}>
        <span>
          《Jason好好聊》由傑思‧愛德威製播 · 聯絡{' '}
          <a href="mailto:sales-service@js-adways.com.tw">sales-service@js-adways.com.tw</a>
        </span>
        <span style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <a href="https://podcasts.apple.com/tw/podcast/id1532218131">Apple Podcasts</a>
          <a href="https://player.soundon.fm/p/f1f2a53d-d42a-4752-a768-00a32b1ac9c5">SoundOn</a>
          <span>Spotify [連結待補]</span>
          <Link to="/explorer">語錄室</Link>
          <Link to="/studio">短影音工作台</Link>
        </span>
      </div>
    </footer>
  );
}
