import episodesJson from '../../data/episodes.json';
import themesJson from '../../data/themes.json';
import curationJson from '../../data/curation.json';
import questionsJson from '../../data/questions.sample.json';
import clipsJson from '../../data/clips.sample.json';

export type ThemeId = 'ai' | 'brand' | 'leadership' | 'resilience' | 'health' | 'money';

export interface Theme {
  id: ThemeId;
  name: string;
  bg: string;
  fg: string;
  dot: string;
  hub: { x: number; y: number };
}

export interface Episode {
  ep: number;
  date: string;
  durationSec: number | null;
  title: string;
  guest: string;
  org: string;
  appleUrl?: string;
  themes: ThemeId[];
  arc: string | null;
  /** Verbatim ☑️ lines from the show notes. Empty until scripts/fetch_episodes.py has run for this episode. */
  takeaways: string[];
  highlight: string;
  /** true when `highlight` is our paraphrase rather than the show's own wording */
  highlightIsSummary: boolean;
}

export interface Phrase { label: string; terms: string[] }
export interface Path { title: string; blurb: string; theme: ThemeId; eps: number[] }

export const episodes = (episodesJson as Episode[]).slice().sort((a, b) => b.ep - a.ep);
export const themes = themesJson as Theme[];
export const themeById = Object.fromEntries(themes.map((t) => [t.id, t])) as Record<ThemeId, Theme>;

export const curation = curationJson as unknown as {
  paths: Path[];
  jasonPicks: number[];
  mostReplayed: number[];
  phrases: Phrase[];
  mapLayout: Record<string, { x: number; y: number }>;
};

export const questions = questionsJson.questions as {
  text: string;
  answers: { ep: number; text: string; source: 'show-notes' | 'summary' }[];
}[];

export const clipsSample = clipsJson as {
  ep: number;
  clips: {
    start: number; end: number; speaker: string; title: string; hook: string;
    why: string; tags: string[]; caption: string; hashtags: string[];
  }[];
};

export const episodeByNumber = (n: number) => episodes.find((e) => e.ep === n);

export function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m} 分鐘`;
}

export function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Every takeaway line, flattened, for phrase counting and the takeaway deck. */
export const takeawayLines = episodes.flatMap((e) =>
  e.takeaways.map((text) => ({ ep: e.ep, guest: e.guest, text })),
);

export function findTerm(text: string, terms: string[]) {
  for (const term of terms) {
    const at = text.indexOf(term);
    if (at >= 0) return { at, term };
  }
  return null;
}

/** Episodes sharing at least one theme with `ep`, best match first. */
export function relatedEpisodes(ep: Episode, limit = 4) {
  return episodes
    .filter((e) => e.ep !== ep.ep)
    .map((e) => ({ e, shared: e.themes.filter((t) => ep.themes.includes(t)) }))
    .filter((x) => x.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length || b.e.ep - a.e.ep)
    .slice(0, limit);
}
