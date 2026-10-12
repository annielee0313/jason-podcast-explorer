import { episodes, themes, type Episode, type ThemeId } from '../lib/data';

/**
 * Ego-centric radial layout for the guest map.
 *
 * The selected guest sits at the origin. The guest–theme graph is walked
 * breadth-first from there: ring 1 holds that guest's themes, ring 2 the guests
 * who share them, ring 3 those guests' other themes, and so on. Each node gets
 * an angular wedge proportional to how many leaves hang below it, so branches
 * fan out from their parent instead of crossing the map.
 */

export type MapNode =
  | { id: string; kind: 'guest'; ep: Episode; depth: number; x: number; y: number }
  | { id: string; kind: 'theme'; theme: ThemeId; count: number; depth: number; x: number; y: number };

export interface MapEdge { key: string; guestEp: number; theme: ThemeId; from: string; to: string }

export const guestId = (ep: number) => `g:${ep}`;
export const themeId = (t: ThemeId) => `t:${t}`;

const RING_STEP = { theme: 170, guest: 180 }; // distance from the previous ring
const MIN_ARC = 150; // px of circumference per node on a ring before the ring grows

export function radialLayout(rootEp: number) {
  const byEp = new Map(episodes.map((e) => [e.ep, e]));
  const guestsByTheme = new Map<ThemeId, Episode[]>(
    themes.map((t) => [t.id, episodes.filter((e) => e.themes.includes(t.id))]),
  );
  const neighbours = (id: string): string[] =>
    id.startsWith('g:')
      ? byEp.get(Number(id.slice(2)))!.themes.map(themeId)
      : guestsByTheme.get(id.slice(2) as ThemeId)!.map((e) => guestId(e.ep));

  // Breadth-first spanning tree from the selected guest.
  const root = guestId(rootEp);
  const depth = new Map<string, number>([[root, 0]]);
  const children = new Map<string, string[]>([[root, []]]);
  const queue = [root];
  while (queue.length) {
    const id = queue.shift()!;
    for (const n of neighbours(id)) {
      if (depth.has(n)) continue;
      depth.set(n, depth.get(id)! + 1);
      children.set(n, []);
      children.get(id)!.push(n);
      queue.push(n);
    }
  }

  const weight = new Map<string, number>();
  const measure = (id: string): number => {
    const w = Math.max(1, children.get(id)!.reduce((s, c) => s + measure(c), 0));
    weight.set(id, w);
    return w;
  };
  measure(root);

  // Ring radii: a fixed step outwards, grown when a ring holds too many nodes.
  const perDepth: number[] = [];
  depth.forEach((d) => { perDepth[d] = (perDepth[d] ?? 0) + 1; });
  const radius = [0];
  for (let d = 1; d < perDepth.length; d++) {
    const step = d % 2 === 1 ? RING_STEP.theme : RING_STEP.guest;
    radius[d] = Math.max(radius[d - 1] + step, (perDepth[d] * MIN_ARC) / (2 * Math.PI));
  }

  const angle = new Map<string, number>();
  const assign = (id: string, a0: number, a1: number) => {
    angle.set(id, (a0 + a1) / 2);
    const kids = children.get(id)!;
    const total = kids.reduce((s, c) => s + weight.get(c)!, 0);
    let a = a0;
    for (const c of kids) {
      const span = ((a1 - a0) * weight.get(c)!) / total;
      assign(c, a, a + span);
      a += span;
    }
  };
  assign(root, -Math.PI / 2, (3 * Math.PI) / 2);

  const nodes: MapNode[] = [];
  const place = (id: string, d: number, a: number) => {
    const x = Math.cos(a) * radius[d];
    const y = Math.sin(a) * radius[d];
    if (id.startsWith('g:')) {
      nodes.push({ id, kind: 'guest', ep: byEp.get(Number(id.slice(2)))!, depth: d, x, y });
    } else {
      const t = id.slice(2) as ThemeId;
      nodes.push({ id, kind: 'theme', theme: t, count: guestsByTheme.get(t)!.length, depth: d, x, y });
    }
  };
  depth.forEach((d, id) => place(id, d, angle.get(id)!));

  // Guests with no path to the selected one (e.g. not yet tagged) go on an outer ring.
  const stray = episodes.filter((e) => !depth.has(guestId(e.ep)));
  if (stray.length) {
    const d = radius.length;
    radius[d] = Math.max(radius[d - 1] + RING_STEP.guest, (stray.length * MIN_ARC) / (2 * Math.PI));
    stray.forEach((e, i) => place(guestId(e.ep), d, -Math.PI / 2 + (2 * Math.PI * i) / stray.length));
  }

  const placed = new Set(nodes.map((n) => n.id));
  const edges: MapEdge[] = episodes.flatMap((e) =>
    e.themes
      .filter((t) => placed.has(themeId(t)))
      .map((t) => ({ key: `${e.ep}-${t}`, guestEp: e.ep, theme: t, from: guestId(e.ep), to: themeId(t) })),
  );

  return { nodes, edges };
}
