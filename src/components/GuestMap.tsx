import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { episodes, industryOf, themeById, type Episode } from '../lib/data';
import { CHIP, CLUSTER_MIN, chipGrid, focusLayout, smallOffsets, type Group } from './guestMapLayout';
import { ArrowIcon, ThemeChip } from './ui';
import { track } from '../lib/analytics';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;
const TWEEN_MS = 600;

type Pt = { x: number; y: number };
type Camera = { x: number; y: number; z: number }; // world origin's offset from the viewport centre (px), and zoom

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Soft halo: colour in the middle fading to nothing, like a heat spot. */
const halo = (color: string, strength = '55') =>
  `radial-gradient(circle closest-side, ${color}${strength} 0%, ${color}22 55%, ${color}00 100%)`;

const viaLabel = (g: Group) => (g.via === 'both' ? '兩個主題都聊過' : themeById[g.via].name);

/** Camera that fits a world-space box in the viewport. */
function fitBox(box: { x0: number; y0: number; x1: number; y1: number }, size: { w: number; h: number }, zMax: number): Camera {
  const pad = 32;
  // Never so far out that names become unreadable; the rest is a drag away.
  const z = clamp(Math.min((size.w - pad * 2) / (box.x1 - box.x0), (size.h - pad * 2) / (box.y1 - box.y0)), 0.62, zMax);
  return { x: -((box.x0 + box.x1) / 2) * z, y: -((box.y0 + box.y1) / 2) * z, z };
}

/**
 * Guest map: the selected guest pinned at the centre of a crosshair, their
 * themes either side, and everyone who shares a theme grouped by industry.
 * Clusters open to show names. Drag to pan; pinch or ⌘/Ctrl+wheel to zoom.
 */
export function GuestMap({ initialEp = 247 }: { initialEp?: number }) {
  const [selEp, setSelEp] = useState(initialEp);
  const sel = episodes.find((e) => e.ep === selEp) ?? episodes[0];
  const [openKey, setOpenKey] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const tall = size.h > size.w * 1.1;
  const layout = useMemo(() => focusLayout(sel, tall), [sel, tall]);
  const open = layout.groups.find((g) => g.key === openKey) ?? null;
  // Name grid for an opened cluster: as many columns as fit the viewport at full size.
  const maxCols = clamp(Math.floor((size.w - 48) / (CHIP.w + CHIP.gap)), 1, 5);
  const chips = useMemo(() => (open ? chipGrid(open.guests.length, maxCols) : null), [open, maxCols]);
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const camRef = useRef(cam);
  camRef.current = cam;

  useLayoutEffect(() => {
    const el = viewportRef.current!;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const select = (ep: number) => { setOpenKey(null); setSelEp(ep); track('map_select_guest', { ep }); };

  // Where the camera should be: the whole neighbourhood, or the opened cluster.
  const goal = useMemo((): Camera | null => {
    if (!size.w) return null;
    if (open) {
      const grid = chips!;
      return fitBox({ x0: open.x - grid.w / 2 - 20, x1: open.x + grid.w / 2 + 20, y0: open.y - grid.h / 2 - 20, y1: open.y + grid.h / 2 + 20 }, size, 1.2);
    }
    const box = { x0: -90, x1: 90, y0: -40, y1: 40 };
    for (const n of [...layout.themes, ...layout.groups]) {
      box.x0 = Math.min(box.x0, n.x - n.r); box.x1 = Math.max(box.x1, n.x + n.r);
      box.y0 = Math.min(box.y0, n.y - n.r); box.y1 = Math.max(box.y1, n.y + n.r);
    }
    return fitBox(box, size, 1);
  }, [layout, open, chips, size]);

  // Ease the camera to the goal whenever it changes (new guest, cluster opened or closed, resize).
  const first = useRef(true);
  useEffect(() => {
    if (!goal) return;
    const from = camRef.current;
    if (first.current || prefersReducedMotion()) { first.current = false; setCam(goal); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = ease(Math.min(1, (now - t0) / TWEEN_MS));
      setCam({ x: from.x + (goal.x - from.x) * k, y: from.y + (goal.y - from.y) * k, z: from.z + (goal.z - from.z) * k });
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [goal]);


  // Escape closes an opened cluster.
  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenKey(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openKey]);

  /** Zoom by `factor` keeping the point `at` (relative to the viewport centre) fixed on screen. */
  const zoomBy = useCallback((factor: number, at: Pt = { x: 0, y: 0 }) => {
    setCam((c) => {
      const z = clamp(c.z * factor, ZOOM_MIN, ZOOM_MAX);
      const r = z / c.z;
      return { z, x: at.x - (at.x - c.x) * r, y: at.y - (at.y - c.y) * r };
    });
  }, []);

  // The map sits inline in the page, so a plain wheel scrolls the page. Only a
  // trackpad pinch (reported as ctrl+wheel) or ⌘/Ctrl+wheel zooms the map.
  useEffect(() => {
    const el = viewportRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
      zoomBy(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), at);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  // Pointer panning (one pointer) and pinch zoom (two pointers).
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ dist: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 1) {
      setCam((c) => ({ ...c, x: c.x + now.x - prev.x, y: c.y + now.y - prev.y }));
      return;
    }
    const [a, b] = [...pointers.current.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2 - rect.left - rect.width / 2, y: (a.y + b.y) / 2 - rect.top - rect.height / 2 };
      zoomBy(dist / pinch.current.dist, mid);
    }
    pinch.current = { dist };
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    if (!pointers.current.size) setDragging(false);
  };

  const recenter = () => { if (goal) setCam(goal); };

  const selIndustry = industryOf(sel);
  const themePos = Object.fromEntries(layout.themes.map((t) => [t.theme, t]));
  // Closest matches: same industry as the centre guest *and* a shared theme. They lead the
  // panel list and stay vivid on the map while the other groups recede.
  const isClose = (g: Group) => sel.industry != null && g.industry.id === sel.industry;
  const closeCount = layout.groups.filter(isClose).reduce((n, g) => n + g.guests.length, 0);
  const rank = (g: Group) => (isClose(g) ? 0 : 2) + (g.via === 'both' ? 0 : 1);
  const groupsSorted = [...layout.groups].sort((a, b) => rank(a) - rank(b) || b.guests.length - a.guests.length);
  const grid = 48 * cam.z;

  const guestChip = (e: Episode, p: Pt, key: string) => (
    <button key={key} type="button" className="map-guest" style={{ left: p.x, top: p.y }} onClick={() => select(e.ep)}
      aria-label={`${e.guest}，EP.${e.ep}，設為中心`}>
      <i style={{ background: industryOf(e).color }} aria-hidden="true" />
      <span>{e.guest}</span>
    </button>
  );

  return (
    <div>
      <div className="map-layout">
        <div
          ref={viewportRef}
          className={`map-viewport${dragging ? ' is-dragging' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            backgroundSize: `${grid}px ${grid}px`,
            backgroundPosition: `${size.w / 2 + cam.x}px ${size.h / 2 + cam.y}px`,
          }}
        >
          <div className="map-world" key={sel.ep}
            style={{ transform: `translate(${size.w / 2 + cam.x}px, ${size.h / 2 + cam.y}px) scale(${cam.z})` }}>
            <svg className="map-lines" aria-hidden="true">
              {/* Crosshair through the selected guest. */}
              <line x1={-8000} y1={0} x2={8000} y2={0} className="map-axis" />
              <line x1={0} y1={-8000} x2={0} y2={8000} className="map-axis" />
              {layout.themes.map((t) => <line key={t.id} x1={0} y1={0} x2={t.x} y2={t.y} className="map-link-strong" />)}
              {layout.groups.flatMap((g) => (g.via === 'both' ? layout.themes : [themePos[g.via]]).map((t) => (
                <line key={`${g.key}-${t.id}`} x1={t.x} y1={t.y} x2={g.x} y2={g.y} className="map-link" />
              )))}
            </svg>

            {layout.themes.map((t) => {
              const th = themeById[t.theme];
              return (
                <div key={t.id} className="map-theme" style={{ left: t.x, top: t.y }}>
                  <span className="map-halo" style={{ width: t.r * 3, height: t.r * 3, background: halo(th.dot, '66') }} />
                  {/* A single theme shares the centre with the guest, so its label sits just below them. */}
                  <span className="map-label" style={{ background: th.bg, color: th.fg, top: t.x === 0 && t.y === 0 ? 54 : 0 }}>{th.name}<b>{t.count}</b></span>
                </div>
              );
            })}

            {layout.groups.map((g) => {
              const dim = open && open !== g;
              const recede = !open && closeCount > 0 && !isClose(g);
              if (g.guests.length < CLUSTER_MIN) {
                const offs = smallOffsets(g.guests.length);
                return (
                  <div key={g.key} className={`map-group${dim ? ' is-dim' : ''}${recede ? ' is-recede' : ''}`}>
                    {g.guests.map((e, i) => guestChip(e, { x: g.x + offs[i].x, y: g.y + offs[i].y }, `${g.key}-${e.ep}`))}
                  </div>
                );
              }
              const isOpen = open === g;
              return (
                <div key={g.key} className={`map-group${dim ? ' is-dim' : ''}${recede ? ' is-recede' : ''}${isOpen ? ' is-open' : ''}${isClose(g) ? ' is-close' : ''}`}>
                  <span className="map-halo" style={{
                    left: g.x, top: g.y,
                    width: isOpen ? Math.max(chips!.w, chips!.h) * 1.5 : g.r * 3,
                    height: isOpen ? Math.max(chips!.w, chips!.h) * 1.5 : g.r * 3,
                    background: halo(g.industry.color, isOpen ? '30' : '99'),
                  }} />
                  {isOpen
                    ? g.guests.map((e, i) => { const p = chips!.at(i); return guestChip(e, { x: g.x + p.x, y: g.y + p.y }, `${g.key}-${e.ep}`); })
                    : (
                      <button type="button" className="map-cluster" style={{ left: g.x, top: g.y }} aria-expanded={false}
                        aria-label={`${g.industry.name}${isClose(g) ? '（同產業）' : ''}，${viaLabel(g)}，${g.guests.length} 位來賓，展開`}
                        onClick={() => { setOpenKey(g.key); track('map_open_cluster', { industry: g.industry.id }); }}>
                        <b>{g.guests.length}</b>
                        <span>{g.industry.name}</span>
                      </button>
                    )}
                </div>
              );
            })}

            <div className="map-center" style={{ left: 0, top: 0 }}>
              <span className="map-halo" style={{ width: 180, height: 180, background: halo(selIndustry.color, '55') }} />
              <span className="map-center-chip">{sel.guest}<small>EP.{sel.ep}</small></span>
            </div>
          </div>

          <div className="map-controls">
            {open && <button type="button" className="icon-btn map-back" onClick={() => setOpenKey(null)}>收合</button>}
            <button type="button" className="icon-btn" aria-label="放大" onClick={() => zoomBy(1.25)}>＋</button>
            <button type="button" className="icon-btn" aria-label="縮小" onClick={() => zoomBy(0.8)}>－</button>
            <button type="button" className="icon-btn" aria-label="回到中心" onClick={recenter}>⌖</button>
          </div>
        </div>

        <aside aria-label="來賓資料" className="map-panel">
          <div className="map-panel-head">
            <span className="map-panel-meta">EP.{sel.ep} · {sel.date}</span>
            <div>
              <div className="map-panel-name">{sel.guest}</div>
              <div className="map-panel-org">{sel.org}</div>
            </div>
            <div className="map-panel-themes">
              {sel.themes.map((t) => <ThemeChip key={t} id={t} />)}
            </div>
            {sel.highlight && (
              <p className="map-panel-quote">「{sel.highlight}」{sel.highlightIsSummary && <span className="muted">（摘要）</span>}</p>
            )}
            <Link to={`/episode/${sel.ep}`} className="link-btn">看這一集 <span className="dot-icon"><ArrowIcon /></span></Link>
          </div>

          <RelatedList
            key={`${sel.ep}-${openKey ?? ''}`}
            groups={open ? [open] : groupsSorted}
            total={open ? open.guests.length : layout.related.length}
            closeCount={open ? 0 : closeCount}
            isClose={isClose}
            open={open}
            onOpen={setOpenKey}
            onClose={() => setOpenKey(null)}
            onPick={select}
          />
        </aside>
      </div>

      <p className="muted" style={{ margin: '14px 0 0', fontSize: 12 }}>點色塊看這群來賓；點名字，換他當中心。拖曳可以移動，按住 ⌘／Ctrl 滾動或雙指捏合可以縮放。</p>
    </div>
  );
}

/** At most 7 dots: a window that follows the current page; the outer dots shrink when more pages lie beyond. */
function dotWindow(current: number, total: number, size = 7) {
  const start = Math.max(0, Math.min(current - Math.floor(size / 2), total - size));
  const end = Math.min(total, start + size);
  return Array.from({ length: end - start }, (_, k) => {
    const i = start + k;
    return { i, edge: (i === start && start > 0) || (i === end - 1 && end < total) };
  });
}

type Row = { kind: 'head'; g: Group; cont?: boolean } | { kind: 'guest'; g: Group; e: Episode };
const ROW_H = 40; // px; keep in sync with .map-row

/** Split rows into pages of `cap`; a page that starts mid-group repeats that group's heading. */
function paginate(rows: Row[], cap: number) {
  const pages: Row[][] = [];
  let cur: Row[] = [];
  for (const row of rows) {
    if (cur.length === cap || (row.kind === 'head' && cur.length === cap - 1)) { pages.push(cur); cur = []; }
    if (!cur.length && row.kind === 'guest') cur.push({ kind: 'head', g: row.g, cont: true });
    cur.push(row);
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/**
 * Related guests, grouped by industry, paged to fit the panel (no inner scroll).
 * Rows per page come from the list's measured height, so desktop fills the map's
 * height and phones get the fixed height set in CSS.
 */
function RelatedList({ groups, total, closeCount, isClose, open, onOpen, onClose, onPick }: {
  groups: Group[]; total: number; closeCount: number; isClose: (g: Group) => boolean; open: Group | null;
  onOpen: (key: string) => void; onClose: () => void; onPick: (ep: number) => void;
}) {
  const boxRef = useRef<HTMLUListElement>(null);
  const [cap, setCap] = useState(7);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current!;
    const ro = new ResizeObserver(([entry]) => setCap(Math.max(3, Math.floor(entry.contentRect.height / ROW_H))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows: Row[] = groups.flatMap((g) => [{ kind: 'head', g } as Row, ...g.guests.map((e) => ({ kind: 'guest', g, e }) as Row)]);
  const pages = paginate(rows, cap);
  const current = Math.min(page, pages.length - 1);

  return (
    <div className="map-panel-related">
      {open ? (
        <button type="button" className="map-panel-back" onClick={onClose}>← 所有相關來賓</button>
      ) : (
        <span className="map-panel-label">聊過相同主題的來賓 · {total} 位{closeCount > 0 && `，其中 ${closeCount} 位同產業`}</span>
      )}
      <ul ref={boxRef} className="map-rows">
        {pages[current]?.map((r) => r.kind === 'head' ? (
          <li key={`h-${r.g.key}`} className="map-row">
            <button type="button" className="map-panel-ghead" onClick={() => onOpen(r.g.key)}
              disabled={!!open || r.g.guests.length < CLUSTER_MIN}>
              <i style={{ background: r.g.industry.color }} aria-hidden="true" />
              <span className="map-ghead-name">{r.g.industry.name}{r.cont && <small>（續）</small>}</span>
              {isClose(r.g) && <span className="map-close-tag">同產業</span>}
              <span className="mono">{r.g.via === 'both' ? '兩個主題' : viaLabel(r.g)} · {r.g.guests.length}</span>
            </button>
          </li>
        ) : (
          <li key={`g-${r.e.ep}`} className="map-row">
            <button type="button" className="map-panel-guest" onClick={() => onPick(r.e.ep)}>
              <span>{r.e.guest}</span><span className="mono">EP.{r.e.ep}</span>
            </button>
          </li>
        ))}
      </ul>
      {pages.length > 1 && (
        <nav className="map-pager" aria-label="相關來賓分頁">
          <button type="button" className="map-pager-arrow" aria-label="上一頁" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><ArrowIcon /></span>
          </button>
          <span className="map-pager-dots">
            {dotWindow(current, pages.length).map(({ i, edge }) => (
              <button key={i} type="button" className={edge ? 'is-edge' : undefined} aria-label={`第 ${i + 1} 頁，共 ${pages.length} 頁`}
                aria-current={i === current ? 'page' : undefined} onClick={() => setPage(i)}>
                <i />
              </button>
            ))}
          </span>
          <button type="button" className="map-pager-arrow" aria-label="下一頁" disabled={current === pages.length - 1} onClick={() => setPage(current + 1)}>
            <ArrowIcon />
          </button>
        </nav>
      )}
    </div>
  );
}
