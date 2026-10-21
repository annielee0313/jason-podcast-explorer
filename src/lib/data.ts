import episodesJson from '../../data/episodes.json';
import themesJson from '../../data/themes.json';
import curationJson from '../../data/curation.json';
import questionsJson from '../../data/questions.sample.json';
import aboutJson from '../../data/about.json';
import facetsJson from '../../data/facets.json';

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
  /** Draft industry from data/facets.json; null until confirmed. */
  industry: string | null;
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
  /** From the team's Google Sheet (scripts/sync_sheets.py). tentative = placeholder until Jason confirms. */
  jasonPicks: { ep: number; reason: string; order: number; tentative: boolean }[];
  /** From the sheet; source says where the ranking comes from (e.g. SoundOn). */
  mostListened: { rank: number; ep: number; source: string; period: string; updated: string }[];
  phrases: Phrase[];
  mapLayout: Record<string, { x: number; y: number }>;
};

export interface Facet { id: string; name: string }
/** Industry taxonomy (draft, see data/facets.json). */
export const industries = facetsJson.industries as Facet[];

/** Host bio, book, production company and show links. Sources are noted in data/about.json. */
export const about = aboutJson;

export const questions = questionsJson.questions as {
  text: string;
  answers: { ep: number; text: string; source: 'show-notes' | 'summary' }[];
}[];

/** Who is speaking on a subtitle line; missing until diarization or an editor sets it. */
export type Speaker = 'host' | 'guest';
/** Subtitle line: [start, end] in seconds from the clip start, verbatim text, optional speaker. */
export type Sub = [number, number, string, Speaker?];

/** A reel candidate. hook/quote/subs are verbatim transcript text; title/why/tags/caption are editorial. */
export interface Clip {
  start: number; end: number; speaker: string; hook: string; title: string; why: string; tags: string[];
  quote: string; subs: Sub[]; caption: string; hashtags: string[];
}
const clipFiles = import.meta.glob<{ ep: number; clips: Clip[] }>('../../data/clips/EP*.json', { eager: true, import: 'default' });
/** Clip candidates per episode, from data/clips/EP###.json. */
export const clipSets: Record<number, Clip[]> = Object.fromEntries(Object.values(clipFiles).map((f) => [f.ep, f.clips]));

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
  e.takeaways.map((text) => ({ ep: e.ep, guest: e.guest, org: e.org, title: e.title, text })),
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

/** Cleaned transcript: paragraphs of [start second, text]. Built by scripts/clean_transcripts.py. */
export interface Transcript { ep: number; model: string | null; paragraphs: [number, string, Speaker?][] }

// Each transcript is its own lazily loaded chunk, so pages only download the ones they show.
const transcriptFiles = import.meta.glob<{ default: Transcript }>('../../data/transcripts-web/EP*.json');
const transcriptKey = (ep: number) => Object.keys(transcriptFiles).find((k) => k.endsWith(`EP${String(ep).padStart(3, '0')}.json`));
export const transcriptEps = episodes.map((e) => e.ep).filter((ep) => !!transcriptKey(ep));

export async function loadTranscript(ep: number): Promise<Transcript | null> {
  const key = transcriptKey(ep);
  return key ? (await transcriptFiles[key]()).default : null;
}
