import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { episodes, themeById } from '../lib/data';
import { guestId, radialLayout, themeId } from './guestMapLayout';
import { ArrowIcon } from './ui';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;
const TWEEN_MS = 650;

type Pt = { x: number; y: number };
type Camera = { x: number; y: number; z: number }; // pan offset from the viewport centre, and zoom

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Zoom that fits the selected guest's neighbourhood (their themes and the guests
 * who share them) in the viewport. Farther rings are a pan away.
 */
function fitZoom(nodes: { depth: number; x: number; y: number }[], size: { w: number; h: number }) {
  let ex = 1;
  let ey = 1;
  for (const p of nodes.filter((n) => n.depth <= 2)) {
    ex = Math.max(ex, Math.abs(p.x) + 90);
    ey = Math.max(ey, Math.abs(p.y) + 60);
  }
  return clamp(Math.min(size.w / (2 * ex), size.h / (2 * ey)), 0.5, 1);
}

/**
 * Infinite canvas: drag to pan, wheel / trackpad pinch / two-finger touch to zoom.
 * Selecting a guest re-runs the radial layout around them and animates both the
 * nodes and the camera so they end up in the middle of the viewport.
 */
export function GuestMap({ initialEp = 247 }: { initialEp?: number }) {
  const [selEp, setSelEp] = useState(initialEp);
  const sel = episodes.find((e) => e.ep === selEp) ?? episodes[0];
  const shares = (ep: number) => ep !== sel.ep && episodes.find((e) => e.ep === ep)!.themes.some((t) => sel.themes.includes(t));

  const layout = useMemo(() => radialLayout(sel.ep), [sel.ep]);
  const target = useMemo(() => Object.fromEntries(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y }])), [layout]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const camRef = useRef(cam);
  camRef.current = cam;
  const [pos, setPos] = useState<Record<string, Pt>>(target);
  const posRef = useRef(pos);
  posRef.current = pos;
  const fitted = useRef(false);

  useLayoutEffect(() => {
    const el = viewportRef.current!;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // First real size: fit the whole map.
  useEffect(() => {
    if (fitted.current || !size.w) return;
    fitted.current = true;
    setCam({ x: 0, y: 0, z: fitZoom(layout.nodes, size) });
  }, [size, layout]);

  // Selection changed: tween node positions to the new layout and the camera back to the origin.
  useEffect(() => {
    const from = posRef.current;
    const camFrom = camRef.current;
    if (prefersReducedMotion()) {
      setPos(target);
      setCam({ ...camFrom, x: 0, y: 0 });
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = ease(Math.min(1, (now - t0) / TWEEN_MS));
      const next: Record<string, Pt> = {};
      for (const [id, p] of Object.entries(target)) {
        const a = from[id] ?? { x: 0, y: 0 };
        next[id] = { x: a.x + (p.x - a.x) * k, y: a.y + (p.y - a.y) * k };
      }
      setPos(next);
      setCam((c) => ({ ...c, x: camFrom.x * (1 - k), y: camFrom.y * (1 - k) }));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  /** Zoom by `factor` keeping the point `at` (relative to the viewport centre) fixed on screen. */
  const zoomBy = useCallback((factor: number, at: Pt = { x: 0, y: 0 }) => {
    setCam((c) => {
      const z = clamp(c.z * factor, ZOOM_MIN, ZOOM_MAX);
      const r = z / c.z;
      return { z, x: at.x - (at.x - c.x) * r, y: at.y - (at.y - c.y) * r };
    });
  }, []);

  // Non-passive so a ⌘/Ctrl+wheel zoom can stop the page from scrolling.
  useEffect(() => {
    const el = viewportRef.current!;
    // The map sits inline in the page, so a plain wheel scrolls the page. Only a
    // trackpad pinch (reported as ctrl+wheel) or ⌘/Ctrl+wheel zooms the map.
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

  const recenter = () => setCam({ x: 0, y: 0, z: fitZoom(layout.nodes, size) });

  const selThemes = new Set(sel.themes);
  const related = episodes.filter((e) => e.themes.length > 0 && shares(e.ep));

  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
        <div className="map-stage-box grow">
          <div
            ref={viewportRef}
            className={`map-viewport${dragging ? ' is-dragging' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              backgroundSize: `${24 * cam.z}px ${24 * cam.z}px`,
              backgroundPosition: `${size.w / 2 + cam.x}px ${size.h / 2 + cam.y}px`,
            }}
          >
            <div
              className="map-world"
              style={{ transform: `translate(${size.w / 2 + cam.x}px, ${size.h / 2 + cam.y}px) scale(${cam.z})` }}
            >
              <svg className="map-lines" aria-hidden="true">
                {layout.edges.map((edge) => {
                  const a = pos[edge.from];
                  const b = pos[edge.to];
                  if (!a || !b) return null;
                  const active = edge.guestEp === sel.ep;
                  const near = selThemes.has(edge.theme);
                  const dot = themeById[edge.theme].dot;
                  return (
                    <line key={edge.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={active ? dot : near ? dot + '99' : '#D6D8D2'}
                      strokeWidth={active ? 4 : near ? 2 : 1.5} strokeLinecap="round" />
                  );
                })}
              </svg>
              {layout.nodes.map((n) => {
                const p = pos[n.id] ?? { x: 0, y: 0 };
                if (n.kind === 'theme') {
                  const t = themeById[n.theme];
                  const size = 84 + n.count * 6;
                  return (
                    <span key={n.id} className="map-hub" style={{
                      left: p.x, top: p.y, width: size, height: size,
                      background: t.bg, color: t.fg, boxShadow: `inset 0 0 0 6px ${t.dot}22`,
                      opacity: selThemes.has(n.theme) ? 1 : 0.75,
                    }}>
                      {t.name}<br />{n.count} 位
                    </span>
                  );
                }
                const isSel = n.ep.ep === sel.ep;
                const rel = shares(n.ep.ep);
                return (
                  <button key={n.id} type="button" className="map-node" aria-pressed={isSel}
                    onClick={() => setSelEp(n.ep.ep)}
                    style={{
                      left: p.x, top: p.y,
                      background: isSel ? 'var(--ink)' : rel ? 'var(--teal-wash)' : 'var(--ground)',
                      color: isSel ? '#fff' : rel ? 'var(--ink)' : 'var(--muted-2)',
                      border: 0,
                      fontWeight: rel ? 700 : undefined,
                      fontSize: isSel ? 17 : undefined,
                      zIndex: isSel ? 2 : 1,
                    }}>
                    <span style={{ fontSize: isSel ? 18 : 15, fontWeight: 700 }}>{n.ep.guest}</span>
                    <span className="mono" style={{ fontSize: 11 }}>EP.{n.ep.ep}</span>
                  </button>
                );
              })}
            </div>
            <div className="map-controls">
              <button type="button" className="icon-btn" aria-label="放大" onClick={() => zoomBy(1.25)}>＋</button>
              <button type="button" className="icon-btn" aria-label="縮小" onClick={() => zoomBy(0.8)}>－</button>
              <button type="button" className="icon-btn" aria-label="回到中心" onClick={recenter}>⌖</button>
            </div>
          </div>
        </div>

        <aside aria-label="來賓資料" className="card side map-panel">
          <span className="map-panel-meta">EP.{sel.ep} · {sel.date}</span>
          <div>
            <div className="map-panel-name">{sel.guest}</div>
            <div className="map-panel-org">{sel.org}</div>
          </div>
          <div className="map-panel-themes">
            {sel.themes.map((t) => (
              <span key={t}><i style={{ background: themeById[t].dot }} aria-hidden="true" />{themeById[t].name}</span>
            ))}
          </div>
          <p className="map-panel-quote">
            「{sel.highlight}」{sel.highlightIsSummary && <span className="muted">（摘要）</span>}
          </p>
          <Link to={`/episode/${sel.ep}`} className="link-btn">
            看這一集 <span className="dot-icon"><ArrowIcon /></span>
          </Link>
          {related.length > 0 && (
            <div className="map-panel-related">
              <span className="map-panel-label">也聊過這些主題</span>
              <ul>
                {related.map((r) => (
                  <li key={r.ep}>
                    <button type="button" onClick={() => setSelEp(r.ep)}>
                      <span>{r.guest}</span><span className="mono">EP.{r.ep}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
      <p className="muted" style={{ margin: '16px 0 0', fontSize: 12 }}>拖曳可以移動；按住 ⌘／Ctrl 再滾動，或用雙指捏合，可以縮放。</p>
    </div>
  );
}
