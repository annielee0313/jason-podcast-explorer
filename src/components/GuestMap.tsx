import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { curation, episodes, themeById, themes, type Episode } from '../lib/data';
import { CloseIcon, ThemeChip } from './ui';

const STAGE = { w: 1100, h: 680 };

/**
 * Node position: hand-placed from curation.mapLayout when present, otherwise the
 * centroid of the guest's theme hubs nudged outward so nodes don't stack.
 * TODO(50+ episodes): replace with a force layout (e.g. d3-force) and zoom/pan.
 */
function positionFor(e: Episode, i: number) {
  const fixed = curation.mapLayout[String(e.ep)];
  if (fixed) return fixed;
  const hubs = e.themes.map((t) => themeById[t].hub);
  const cx = hubs.reduce((s, h) => s + h.x, 0) / hubs.length;
  const cy = hubs.reduce((s, h) => s + h.y, 0) / hubs.length;
  const angle = i * 2.399; // golden angle
  const r = 70 + (i % 5) * 18;
  return {
    x: Math.min(STAGE.w - 70, Math.max(70, cx + Math.cos(angle) * r)),
    y: Math.min(STAGE.h - 30, Math.max(30, cy + Math.sin(angle) * r)),
  };
}

export function GuestMap({ initialEp = 247, onNavigate }: { initialEp?: number; onNavigate?: () => void }) {
  const [selEp, setSelEp] = useState(initialEp);
  const sel = episodes.find((e) => e.ep === selEp) ?? episodes[0];
  const shares = (e: Episode) => e.ep !== sel.ep && e.themes.some((t) => sel.themes.includes(t));

  const nodes = useMemo(() => episodes.map((e, i) => ({ e, pos: positionFor(e, i) })), []);

  const lines = nodes.flatMap(({ e, pos }) =>
    e.themes.map((t) => {
      const hub = themeById[t].hub;
      const dx = hub.x - pos.x;
      const dy = hub.y - pos.y;
      const active = e.ep === sel.ep;
      const near = shares(e) && sel.themes.includes(t);
      return {
        key: `${e.ep}-${t}`,
        left: pos.x, top: pos.y,
        width: Math.hypot(dx, dy),
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        height: active ? 4 : near ? 2 : 1.5,
        color: active ? themeById[t].dot : near ? themeById[t].dot + '88' : '#D6D8D2',
      };
    }),
  );

  const related = episodes.filter(shares);

  return (
    <div style={{ padding: '4px 28px 28px' }}>
      <p className="muted" style={{ margin: 0, fontSize: 16, lineHeight: 1.7 }}>
        每條線代表來賓聊過那個主題。點一位來賓，看他和誰聊過同樣的事。
      </p>
      <div className="row" style={{ marginTop: 20, alignItems: 'flex-start', gap: 20 }}>
        <div className="map-stage-box grow">
          <div className="map-stage">
            {lines.map((l) => (
              <span key={l.key} aria-hidden="true" className="map-line" style={{
                left: l.left, top: l.top, width: l.width, height: l.height, background: l.color,
                transform: `rotate(${l.angle}deg)`,
              }} />
            ))}
            {themes.map((t) => {
              const count = episodes.filter((e) => e.themes.includes(t.id)).length;
              const size = 92 + count * 6;
              return (
                <span key={t.id} className="map-hub" style={{
                  left: t.hub.x, top: t.hub.y, width: size, height: size,
                  background: t.bg, color: t.fg, border: `3px solid ${t.dot}`,
                }}>
                  {t.name}<br />{count} 位
                </span>
              );
            })}
            {nodes.map(({ e, pos }) => {
              const isSel = e.ep === sel.ep;
              const rel = shares(e);
              return (
                <button key={e.ep} type="button" className="map-node" aria-pressed={isSel}
                  onClick={() => setSelEp(e.ep)}
                  style={{
                    left: pos.x, top: pos.y,
                    background: isSel ? 'var(--ink)' : '#fff',
                    color: isSel ? '#fff' : rel ? 'var(--ink)' : 'var(--muted-2)',
                    border: isSel || rel ? '2px solid var(--ink)' : '1px solid var(--dash)',
                  }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{e.guest}</span>
                  <span className="mono" style={{ fontSize: 11 }}>EP.{e.ep}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside aria-label="來賓資料" className="card side" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 24 }}>
          <span className="mono muted" style={{ fontSize: 13 }}>EP.{sel.ep} · {sel.date}</span>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{sel.guest}</div>
            <div className="muted" style={{ fontSize: 15, marginTop: 4 }}>{sel.org}</div>
          </div>
          {sel.arc && (
            <span style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 999, background: 'var(--ink)', color: '#fff', fontSize: 14 }}>
              {sel.arc}
            </span>
          )}
          <div className="chips">{sel.themes.map((t) => <ThemeChip key={t} id={t} />)}</div>
          <blockquote style={{ margin: 0, padding: '16px 18px', background: 'var(--ground)', borderRadius: 12, fontSize: 17, fontWeight: 700, lineHeight: 1.6 }}>
            {sel.highlight}{sel.highlightIsSummary && <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>（摘要）</span>}
          </blockquote>
          <Link to={`/episode/${sel.ep}`} className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={onNavigate}>
            看這一集
          </Link>
          <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>聊過同樣主題的來賓 · {related.length} 位</div>
            <div className="chips" style={{ gap: 8 }}>
              {related.map((r) => (
                <button key={r.ep} type="button" className="toggle" style={{ fontSize: 14 }} onClick={() => setSelEp(r.ep)}>
                  {r.guest}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <p className="muted" style={{ margin: '16px 0 0', fontSize: 13 }}>主題為人工標記草稿。</p>
    </div>
  );
}

export function GuestMapModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      prevFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="map-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="map-title" style={{ fontSize: 30 }}>來賓地圖</h2>
          <button ref={closeRef} type="button" className="icon-btn" aria-label="關閉來賓地圖" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <GuestMap onNavigate={onClose} />
      </div>
    </div>
  );
}
