import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { about } from '../lib/data';
import { ArrowIcon, ArrowUpRightIcon, CloseIcon } from './ui';

/** Landing-page sections the nav can jump to; Landing reads `state.scrollTo`. */
export type NavState = { scrollTo?: string };

const SECTIONS = [
  { id: 'paths', label: '從哪開始' },
  { id: 'browse', label: '全部集數' },
  { id: 'map', label: '來賓地圖' },
  { id: 'about', label: '關於 Jason' },
];

const PLATFORMS = [
  { label: 'Apple Podcasts', href: about.show.apple },
  { label: 'YouTube', href: about.show.youtube },
  { label: 'SoundOn', href: about.show.soundon },
];

const MenuIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
  </svg>
);

/** Close on Escape and on a click outside `ref`, while `open`. */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [open, close, ref]);
}

/** 「收聽節目」 with a small list of the platforms; the site itself never plays audio. */
function ListenMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div className="listen" ref={ref}>
      <button type="button" className="btn btn-ink" aria-expanded={open} aria-controls="listen-list" onClick={() => setOpen((o) => !o)}>
        收聽節目 <ArrowUpRightIcon />
      </button>
      {open && (
        <ul id="listen-list" className="listen-list">
          {PLATFORMS.map((p) => (
            <li key={p.label}><a href={p.href} target="_blank" rel="noreferrer">{p.label}<ArrowUpRightIcon /></a></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Serif wordmark, four text links and one 收聽節目 button; turns white once the
 * page scrolls. On phones: wordmark, 收聽, and a full-screen menu laid out like
 * a magazine contents page.
 */
export function Header({ tool }: { tool?: string }) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const go = (state: NavState) => { setMenuOpen(false); navigate('/', { state }); };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Full-screen menu: lock page scroll, move focus in, Escape closes, focus returns to the menu button.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    const btn = menuBtn.current;
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); btn?.focus(); };
  }, [menuOpen]);

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
      <Link to="/" className="wordmark">
        {tool ?? 'Jason好好聊'}
        {tool && <span className="tool-badge">內部工具</span>}
      </Link>

      <nav className="nav" aria-label="主選單">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className="nav-link" onClick={() => go({ scrollTo: s.id })}>{s.label}</button>
        ))}
        <ListenMenu />
      </nav>

      <div className="nav-mobile">
        <a className="btn btn-ink btn-sm" href={about.show.apple} target="_blank" rel="noreferrer">收聽</a>
        <button ref={menuBtn} type="button" className="icon-btn ghost" aria-label="開啟選單" aria-expanded={menuOpen} aria-controls="site-menu" onClick={() => setMenuOpen(true)}>
          <MenuIcon />
        </button>
      </div>

      {/* Portalled to <body>: the scrolled header's backdrop-filter would otherwise trap a fixed child in its box. */}
      {menuOpen && createPortal(
        <div id="site-menu" className="menu-sheet" role="dialog" aria-modal="true" aria-label="選單">
          <div className="menu-sheet-head">
            <span className="wordmark">Jason好好聊</span>
            <button ref={closeBtn} type="button" className="icon-btn ghost" aria-label="關閉選單" onClick={() => setMenuOpen(false)}><CloseIcon /></button>
          </div>
          <ol className="menu-sheet-list">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => go({ scrollTo: s.id })}>
                  <span className="menu-n">{String(i + 1).padStart(2, '0')}</span>{s.label}
                </button>
              </li>
            ))}
          </ol>
          <div className="menu-sheet-links">
            {PLATFORMS.slice(0, 2).map((p, i) => (
              <a key={p.label} className={i === 0 ? 'ink' : ''} href={p.href} target="_blank" rel="noreferrer">{p.label}<ArrowUpRightIcon /></a>
            ))}
            <button type="button" onClick={() => go({ scrollTo: 'company' })}>{about.company.name}<ArrowIcon /></button>
          </div>
        </div>,
        document.body,
      )}
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
          <span>主題分類由編輯整理，會持續調整。</span>
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
          <a href={show.youtube}>YouTube</a>
          <a href={show.soundon}>SoundOn</a>
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
