import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CloseIcon } from './ui';
import { track } from '../lib/analytics';

export interface FacetOption { id: string; name: string; dot: string; bg: string; fg: string }

const GAP = 8; // px, matches .filter-tags gap

/**
 * One filter row (主題 or 產業) kept to a single line.
 * Wider screens: 全部, as many tags as fit, then 「+N」, which expands the row in place
 * (× folds it back). The selected tag is always on the line. Widths are measured from
 * a hidden copy of the row, so it adapts to any width.
 * Phones (CSS, ≤640px): every tag in one horizontally scrolling line; no +N.
 */
export function FacetRow({ label, options, selected, countFor, onPick }: {
  label: string;
  options: FacetOption[];
  selected: string; // 'all' or an option id
  countFor: (id: string) => number;
  onPick: (id: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(6); // before measuring (and in the prerendered HTML): the top 6
  const [expanded, setExpanded] = useState(false);
  const counts = options.map((o) => countFor(o.id));

  useLayoutEffect(() => {
    const row = rowRef.current!;
    const measure = () => {
      const kids = [...measureRef.current!.children] as HTMLElement[];
      const [all, ...rest] = kids;
      const more = rest.pop()!; // last child: a +NN button at its widest
      const tags = rest;
      const width = row.clientWidth;
      let used = all.offsetWidth;
      let n = 0;
      for (const t of tags) {
        const next = used + GAP + t.offsetWidth;
        const remaining = tags.length - (n + 1);
        if (next + (remaining ? GAP + more.offsetWidth : 0) > width) break;
        used = next;
        n++;
      }
      setFit(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [counts.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phones: keep the selected tag scrolled into view in the horizontal line.
  useEffect(() => {
    const row = rowRef.current!;
    const el = row.querySelector<HTMLElement>('.tag[aria-pressed="true"]');
    if (el && row.scrollWidth > row.clientWidth) row.scrollTo({ left: Math.max(0, el.offsetLeft - 16), behavior: 'smooth' });
  }, [selected]);

  const tag = (o: FacetOption, i: number, overflow: boolean) => {
    const on = selected === o.id;
    const n = counts[i];
    return (
      <button key={o.id} type="button" className={`tag${overflow ? ' is-overflow' : ''}`} aria-pressed={on}
        style={on ? { background: o.bg, color: o.fg } : undefined}
        disabled={n === 0 && !on} onClick={() => { if (!on) track('filter_select', { facet: label, value: o.id }); onPick(o.id); }}>
        <span className="tag-dot" style={{ background: on ? '#fff' : o.dot }} aria-hidden="true" />{o.name}<span className="count">{n}</span>
      </button>
    );
  };

  // Which tags sit on the collapsed line: the first `fit`, with the selected one swapped in if needed.
  const order = options.map((_, i) => i);
  let shown = order.slice(0, fit);
  const selIdx = options.findIndex((o) => o.id === selected);
  if (selIdx >= fit && fit > 0) shown = [...shown.slice(0, fit - 1), selIdx];
  const hidden = options.length - shown.length;
  // Every tag is rendered (phones scroll through all of them); on wider screens the ones
  // past the line are hidden with CSS until the row is expanded.
  const onLine = new Set(shown);

  return (
    <div role="group" aria-label={`依${label}篩選`} className="facet-row">
      <span className="facet-label">{label}</span>
      <div ref={rowRef} className={`filter-tags${expanded ? ' is-expanded' : ''}`}>
        <button type="button" className="tag" aria-pressed={selected === 'all'} onClick={() => onPick('all')}>全部</button>
        {order.map((i) => tag(options[i], i, !expanded && !onLine.has(i)))}
        {!expanded && hidden > 0 && (
          <button type="button" className="tag tag-more" aria-expanded={false} aria-label={`顯示其他 ${hidden} 個${label}`} onClick={() => setExpanded(true)}>
            +{hidden}
          </button>
        )}
        {expanded && (
          <button type="button" className="tag tag-more tag-close" aria-expanded aria-label={`收起${label}`} onClick={() => setExpanded(false)}>
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Hidden copy of the full row, used only to measure tag widths. */}
      <div ref={measureRef} className="filter-measure" aria-hidden="true">
        <span className="tag">全部</span>
        {options.map((o, i) => (
          <span key={o.id} className="tag"><span className="tag-dot" />{o.name}<span className="count">{counts[i]}</span></span>
        ))}
        <span className="tag tag-more">+{options.length}</span>
      </div>

    </div>
  );
}
