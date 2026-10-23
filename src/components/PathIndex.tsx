import { useState } from 'react';
import { Link } from 'react-router-dom';
import { curation, episodes, themeById, type Episode } from '../lib/data';
import { ArrowIcon } from './ui';

const Chevron = ({ open }: { open: boolean }) => (
  <svg className={`index-chevron${open ? ' open' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/**
 * The listening paths as a large serif index. Each row toggles open its
 * episodes in listening order, one line each, linking to the episode page.
 */
export function PathIndex() {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <ol className="index-list">
      {curation.paths.map((p, i) => {
        const isOpen = open.has(i);
        const eps = p.eps.map((n) => episodes.find((e) => e.ep === n)).filter((e): e is Episode => !!e);
        const panelId = `path-${i}`;
        return (
          <li key={p.title} className={isOpen ? 'is-open' : undefined}>
            <button type="button" className="index-row" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(i)}>
              <span className="index-n">{String(i + 1).padStart(2, '0')} /</span>
              <span className="index-name">{p.title}</span>
              <span className="index-count">{eps.length} 集</span>
              <span className="index-dot" style={{ background: themeById[p.theme].dot }} aria-hidden="true" />
              <Chevron open={isOpen} />
            </button>
            {isOpen && (
              <div id={panelId} className="index-panel">
                <p className="index-blurb">{p.blurb}</p>
                <ol className="ep-lines">
                  {eps.map((e) => (
                    <li key={e.ep}>
                      <Link to={`/episode/${e.ep}`} className="ep-line" data-track="path_click" data-ep={e.ep}>
                        <span className="ep-line-n">EP.{e.ep}</span>
                        <span className="ep-line-title">{e.title}</span>
                        <span className="ep-line-guest">{e.guest}</span>
                        <span className="ep-line-arrow" aria-hidden="true"><ArrowIcon /></span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
