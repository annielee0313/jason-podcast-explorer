import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { episodes, formatDuration, industries, themes, type Episode } from '../lib/data';
import { ArrowIcon, ArrowUpRightIcon, ThemeChip } from './ui';
import { FacetRow } from './FacetRow';

const PAGE_SIZE = 8; // 4 columns × 2 rows on desktop

/** Page numbers to show: first, last, current ±1, with null for an ellipsis gap. */
function pageList(current: number, total: number): (number | null)[] {
  const keep = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

/**
 * The full, growing episode list: filter rows (theme, guest industry),
 * sort, the card grid and pagination. Filters combine; each tag's count shows
 * how many episodes it would leave given the other active filters.
 */
type Filters = { theme: string; industry: string }; // 'all' or an id
const ALL: Filters = { theme: 'all', industry: 'all' };
const matches = (e: Episode, f: Filters) =>
  (f.theme === 'all' || e.themes.includes(f.theme as Episode['themes'][number])) &&
  (f.industry === 'all' || e.industry === f.industry);

/** Biggest first, by episodes over the whole catalogue (fixed, so tags never reorder while filtering). */
function byTotal<T extends { id: string }>(opts: T[], key: keyof Filters) {
  const total = (id: string) => episodes.filter((e) => matches(e, { ...ALL, [key]: id })).length;
  return opts.slice().sort((a, b) => total(b.id) - total(a.id));
}

// Each option carries its tag colours: a selected filter looks like the tag it filters by.
const FACETS: { key: keyof Filters; label: string; options: { id: string; name: string; dot: string; bg: string; fg: string }[] }[] = [
  { key: 'theme', label: '主題', options: byTotal(themes.map((t) => ({ id: t.id, name: t.name, dot: t.dot, bg: t.bg, fg: t.fg })), 'theme') },
  { key: 'industry', label: '產業', options: byTotal(industries.map((i) => ({ id: i.id, name: i.name, dot: i.color, bg: i.bg, fg: i.fg })), 'industry') },
];

export function EpisodeBrowser() {
  const [filters, setFilters] = useState<Filters>(ALL);
  const [order, setOrder] = useState<'new' | 'old'>('new');
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const list = episodes.filter((e) => matches(e, filters));
    return order === 'new' ? list : list.slice().reverse();
  }, [filters, order]);

  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const countFor = (key: keyof Filters, id: string) => episodes.filter((e) => matches(e, { ...filters, [key]: id })).length;

  // Any filter change starts again from page 1; a second click on a tag clears it.
  const pick = (key: keyof Filters, id: string) => {
    setFilters((f) => ({ ...f, [key]: f[key] === id ? 'all' : id }));
    setPage(1);
  };
  const active = FACETS.flatMap((f) => f.options.filter((o) => o.id === filters[f.key]).map((o) => o.name));

  // Page changes slide like a carousel: forward moves the cards out to the left
  // and the next set in from the right; back does the reverse.
  const dir = useRef(0);
  const busy = useRef(false);
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const goTo = (p: number) => {
    if (busy.current || p === current) return;
    dir.current = p > current ? 1 : -1;
    // Only scroll if the top of the list has gone off-screen.
    if ((topRef.current?.getBoundingClientRect().top ?? 0) < 0) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (reduced()) { setPage(p); return; }
    busy.current = true;
    gsap.to(gridRef.current, {
      x: -dir.current * 80, autoAlpha: 0, duration: 0.25, ease: 'power2.in',
      onComplete: () => setPage(p),
    });
  };

  useLayoutEffect(() => {
    const grid = gridRef.current!;
    const d = dir.current;
    dir.current = 0;
    busy.current = false;
    if (reduced()) { gsap.set(grid, { clearProps: 'transform,opacity,visibility' }); return; }
    // A context so cleanup (including React's dev double-run) fully reverts the tweens.
    const ctx = gsap.context(() => {
      if (d !== 0) {
        // Incoming page: slide in from the side we are moving towards.
        gsap.fromTo(grid, { x: d * 80, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.4, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
        gsap.from(grid.children, { x: d * 24, duration: 0.5, stagger: 0.03, ease: 'power3.out', clearProps: 'transform' });
        return;
      }
      // Filter or sort change: a quiet rise.
      gsap.from(grid.children, { y: 14, autoAlpha: 0, duration: 0.45, stagger: 0.03, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    }, grid);
    return () => ctx.revert();
  }, [filters, order, current]);

  const from = results.length ? (current - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(current * PAGE_SIZE, results.length);

  return (
    <div ref={topRef}>
      <div className="browse-body">
        <div className="browse-tools">
          <div className="facets">
            {FACETS.map((f) => (
              <FacetRow key={f.key} label={f.label} options={f.options} selected={filters[f.key]}
                countFor={(id) => countFor(f.key, id)} onPick={(id) => pick(f.key, id)} />
            ))}
          </div>
          <div role="group" aria-label="排序" className="seg">
            <button type="button" aria-pressed={order === 'new'} onClick={() => { setOrder('new'); setPage(1); }}>最新</button>
            <button type="button" aria-pressed={order === 'old'} onClick={() => { setOrder('old'); setPage(1); }}>最早</button>
          </div>
        </div>
        <p className="browse-status" aria-live="polite">
          {active.length > 0 && <>{active.join(' · ')} · </>}
          {results.length ? <>第 {from}–{to} 集，共 {results.length} 集</> : '沒有符合的集數'}
          {active.length > 0 && (
            <button type="button" className="clear-filters" onClick={() => { setFilters(ALL); setPage(1); }}>清除篩選</button>
          )}
        </p>

        <div className="ep-grid-clip">
        <div ref={gridRef} className="ep-grid">
          {shown.map((e) => (
            <Link key={e.ep} to={`/episode/${e.ep}`} className="ep-card" data-track="episode_card_click" data-ep={e.ep}>
              <span className="meta">EP.{e.ep} · {e.date} · {formatDuration(e.durationSec)}</span>
              <span className="title">{e.title}</span>
              <span className="muted" style={{ fontSize: 13 }}>{e.guest} · {e.org}</span>
              <span className="ep-foot">
                <span className="chips">{e.themes.map((t) => <ThemeChip key={t} id={t} />)}</span>
                <span className="dot-icon"><ArrowUpRightIcon /></span>
              </span>
            </Link>
          ))}
        </div>
        </div>

        {results.length === 0 && <p className="muted" style={{ marginTop: 24 }}>這個組合還沒有收錄的集數，換一個篩選看看。</p>}

        {pages > 1 && (
          <nav className="pager" aria-label="分頁">
            <button type="button" className="pager-arrow prev" aria-label="上一頁" disabled={current === 1} onClick={() => goTo(current - 1)}><ArrowIcon /></button>
            <ol>
              {pageList(current, pages).map((p, i) => (
                <li key={p ?? `gap-${i}`}>
                  {p === null ? <span className="pager-gap" aria-hidden="true">…</span> : (
                    <button type="button" aria-current={p === current ? 'page' : undefined} aria-label={`第 ${p} 頁`} onClick={() => goTo(p)}>{String(p).padStart(2, '0')}</button>
                  )}
                </li>
              ))}
            </ol>
            <button type="button" className="pager-arrow" aria-label="下一頁" disabled={current === pages} onClick={() => goTo(current + 1)}><ArrowIcon /></button>
          </nav>
        )}
      </div>
    </div>
  );
}
