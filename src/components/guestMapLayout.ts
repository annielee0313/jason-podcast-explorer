import { episodes as allEpisodes, industryOf, type Episode, type Facet, type ThemeId } from '../lib/data';

/**
 * Focus layout for the guest map.
 *
 * The selected guest is pinned at the origin. Their 1–2 themes sit on either
 * side. Every guest who shares a theme is grouped by industry around that
 * theme; guests who share *both* themes (the closest matches) sit between
 * the two. A group of 3+ guests is drawn as one soft cluster with a count and
 * opens on click; smaller groups show their guests directly. Nothing else on
 * the show is drawn, so the map stays readable at 250 guests.
 */

const episodes = allEpisodes.filter((e) => e.themes.length > 0);

export const CLUSTER_MIN = 3; // groups smaller than this show names instead of a cluster
const THEME_DIST = { one: 0, two: 270 };
const GAP = 18;

export const themeHalo = (count: number) => 56 + 7 * Math.sqrt(count);
export const clusterRadius = (n: number) => (n < CLUSTER_MIN ? 34 * n : 16 + 8 * Math.sqrt(n));

export interface ThemeNode { id: string; theme: ThemeId; count: number; x: number; y: number; r: number }
export interface Group {
  key: string;
  /** The theme this group hangs off, or 'both' for guests sharing every theme with the selected one. */
  via: ThemeId | 'both';
  industry: Facet;
  guests: Episode[];
  x: number; y: number; r: number;
}

/** Lay circles (radius r) on arcs around (cx, cy) inside [a0, a1], ring after ring, each ring centred in the sector. */
function fan<T extends { r: number; x: number; y: number }>(items: T[], cx: number, cy: number, r0: number, a0: number, a1: number) {
  let i = 0;
  let R = r0;
  while (i < items.length) {
    const ring: T[] = [];
    let used = 0;
    let maxR = 0;
    R += items[i].r;
    while (i < items.length) {
      const span = (2 * items[i].r + GAP) / R;
      if (ring.length && used + span > a1 - a0) break;
      ring.push(items[i]);
      used += span;
      maxR = Math.max(maxR, items[i].r);
      i++;
    }
    // Biggest in the middle of the sector, then alternate outwards.
    const order = ring.map((_, k) => k).sort((a, b) => a - b);
    const placed: T[] = [];
    order.forEach((k) => (k % 2 ? placed.push(ring[k]) : placed.unshift(ring[k])));
    let a = (a0 + a1) / 2 - used / 2;
    for (const it of placed) {
      const span = (2 * it.r + GAP) / R;
      it.x = cx + Math.cos(a + span / 2) * R;
      it.y = cy + Math.sin(a + span / 2) * R;
      a += span;
    }
    R += maxR + GAP;
  }
}

/** `tall`: portrait viewport (phones), so the two themes stack above and below instead of left and right. */
export function focusLayout(sel: Episode, tall = false) {
  const selThemes = sel.themes;
  const two = selThemes.length > 1;
  const angles = two ? (tall ? [-Math.PI / 2, Math.PI / 2] : [Math.PI, 0]) : [-Math.PI / 2];
  const dist = two ? THEME_DIST.two : THEME_DIST.one;

  const themes: ThemeNode[] = selThemes.map((t, i) => {
    const count = episodes.filter((e) => e.themes.includes(t)).length;
    return { id: `t:${t}`, theme: t, count, r: themeHalo(count), x: Math.cos(angles[i]) * dist, y: Math.sin(angles[i]) * dist };
  });

  const related = episodes.filter((e) => e.ep !== sel.ep && e.themes.some((t) => selThemes.includes(t)));
  const viaOf = (e: Episode): ThemeId | 'both' => {
    const shared = selThemes.filter((t) => e.themes.includes(t));
    return two && shared.length === selThemes.length ? 'both' : shared[0];
  };

  const byKey = new Map<string, Group>();
  for (const e of related) {
    const via = viaOf(e);
    const industry = industryOf(e);
    const key = `${via}:${industry.id}`;
    if (!byKey.has(key)) byKey.set(key, { key, via, industry, guests: [], x: 0, y: 0, r: 0 });
    byKey.get(key)!.guests.push(e);
  }
  const groups = [...byKey.values()];
  for (const g of groups) {
    g.guests.sort((a, b) => b.ep - a.ep);
    // Small groups show names, so they need room for their longest name, not just a dot.
    g.r = g.guests.length < CLUSTER_MIN
      ? Math.max(clusterRadius(g.guests.length), Math.max(...g.guests.map((e) => labelWidth(e.guest))) / 2)
      : clusterRadius(g.guests.length);
  }
  const bySize = (a: Group, b: Group) => b.guests.length - a.guests.length;

  themes.forEach((t, i) => {
    const mine = groups.filter((g) => g.via === t.theme).sort(bySize);
    const out = angles[i];
    const half = two ? 1.25 : Math.PI; // a single theme gets the whole circle
    fan(mine, t.x, t.y, t.r + 40, out - half, out + half);
  });
  if (two) {
    // Closest matches: beside the selected guest, between the two themes.
    const both = groups.filter((g) => g.via === 'both').sort(bySize);
    const side = tall ? 0 : -Math.PI / 2;
    fan(both, 0, 0, tall ? 110 : 60, side - 0.75, side + 0.75); // clear of the centre label
  }

  return { themes, groups, related };
}

/** Name chips for an opened cluster: a tidy grid centred on the cluster. */
export const CHIP = { w: 116, h: 40, gap: 8 };
export function chipGrid(n: number, maxCols = 5) {
  const cols = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(n * 1.6))));
  const rows = Math.ceil(n / cols);
  const w = cols * CHIP.w + (cols - 1) * CHIP.gap;
  const h = rows * CHIP.h + (rows - 1) * CHIP.gap;
  const at = (i: number) => ({
    x: -w / 2 + (i % cols) * (CHIP.w + CHIP.gap) + CHIP.w / 2,
    y: -h / 2 + Math.floor(i / cols) * (CHIP.h + CHIP.gap) + CHIP.h / 2,
  });
  return { w, h, at };
}

/** Rough on-screen width of a guest name chip (13px text): CJK ≈ 13.5px, Latin ≈ 7.5px, plus dot and padding. */
export const labelWidth = (name: string) => 34 + [...name].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x2e80 ? 7.5 : 13.5), 0);

/** Offsets for the 1–2 guests of a small group, shown by name. */
export const smallOffsets = (n: number) => (n === 1 ? [{ x: 0, y: 0 }] : [{ x: 0, y: -22 }, { x: 0, y: 22 }]);
