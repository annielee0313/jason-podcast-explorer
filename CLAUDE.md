# CLAUDE.md

Context for Claude Code working in this repo. Read README.md for the product overview.

## What this is
A static React (Vite + TypeScript) site that helps new listeners discover episodes of the Taiwanese business podcast 《Jason好好聊》 (host 楊佳燊 Jason, produced by 傑思‧愛德威 / JS-Adways). It also has two internal tools: 語錄室 (`/explorer`) and 短影音工作台 (`/studio`). All content comes from JSON in `data/`. Python scripts in `scripts/` build that data.

## Commands
- `npm run dev` runs the dev server.
- `npm run build` typechecks and builds. Run it before committing UI changes.
- `python scripts/fetch_episodes.py --limit 50` pulls episodes from the RSS feed.
- `python scripts/tag_episodes.py` uses Claude to suggest themes for untagged episodes.
- `python scripts/transcribe.py --eps 247` transcribes with faster-whisper.

## Layout
- `src/lib/data.ts`: every data import, the types, and helpers (`relatedEpisodes`, `findTerm`, `formatDuration`). Add new data sources here, not in components.
- `src/pages/`: Landing, Episode, Explorer, Studio.
- `src/components/`: Header/Footer, GuestMap (inline on the landing page; layout in `guestMapLayout.ts`), EpisodeBrowser (search, sort, 18-per-page pagination), and small UI pieces.
- `src/lib/motion.ts`: GSAP entrance/scroll motion for the landing page.
- `src/styles.css`: brand tokens (`:root`) and component classes.

## Conventions
- **UI copy is Traditional Chinese (zh-Hant, Taiwan usage).** Code, comments and commit messages are in English.
- **Never invent data.** If something isn't known yet (play counts, Jason's picks, timestamps, quotes), render a dashed `.placeholder` box naming the missing source. Mark paraphrases explicitly: `highlightIsSummary` in data, and a 摘要 label in the UI. Takeaways in `episodes.json` must be verbatim from the show notes.
- **Themes come from the fixed taxonomy** in `data/themes.json`. Use 1–2 per episode. Don't add free-form tags. Propose a taxonomy change instead.
- **Guest role and industry** come from the draft taxonomies in `data/facets.json` (one value each on every episode, `null` until confirmed). Same rule as themes: no free-form values. Role follows the guest's own title; authors are filed by their book's subject for industry.
- **Data scripts merge, they don't overwrite.** Hand-curated fields (`themes`, `arc`, `highlight`, `appleUrl`, `role`, `industry`) survive re-fetching.
- **Full-bleed sections.** Section backgrounds run edge to edge (`.section`, `.section-white`); content sits in `.wrap` (1200px column, 56px / 16px gutters). The hero bento is edge to edge with no gaps or radius.
- **No border strokes.** Separate surfaces with fills (`--ground`, `#fff`, `--soft`), radius and spacing. The only outline allowed is the dashed `.placeholder` for missing data.
- **Host, book and company facts** live in `data/about.json` (sources noted inside). Keep the 傑思‧愛德威 section and footer links: routing listeners to the company is a core goal of the site.
- **Brand colors:** turquoise `--teal` is only a fill, with slate text on it, because white on turquoise fails contrast. Links and white-text buttons use `--teal-strong`.
- **Accessibility:** use real buttons and links, keep touch targets at least 44px, set `aria-pressed` on toggles. The inline guest map only zooms on pinch or ⌘/Ctrl+wheel so a plain wheel still scrolls the page.
- **Hero background** is a Paper Shaders `MeshGradient` (`src/components/HeroBackground.tsx`, pinned `@paper-design/shaders-react@0.0.81`, pre-1.0 so upgrade deliberately). Keep its colours near `--ground`/`--teal-wash` so the ink headline keeps contrast; it pauses off-screen and is static under reduced motion.
- **Motion is subtle and optional:** GSAP only, small rises (≤28px) and fades, once per element, all inside `gsap.matchMedia('(prefers-reduced-motion: no-preference)')`, with `clearProps` so CSS hover states keep working.
- Routing uses `HashRouter` so the static build works on GitHub Pages.

## Known gaps / next tasks
- Only 12 episodes are in `data/episodes.json`. EP.238–241 have no takeaways yet; run the fetch script.
- The guest map is an infinite canvas (pan/zoom) with an ego-centric radial layout (`src/components/guestMapLayout.ts`): the selected guest is the origin, their themes ring 1, guests sharing them ring 2, and so on. `curation.mapLayout` and `themes[].hub` are no longer read by the map.
- `clips.sample.json` and `questions.sample.json` are demo data. Rebuild them from transcripts:
  - Use diarization to find Jason's turns.
  - Cluster his questions with embeddings.
  - Have an LLM propose 30–60s clips that make sense on their own.
- The hero stats (249 episodes, 200+ guests) are hard-coded. Derive them from the data once all episodes are imported.
- The Spotify episode links aren't known yet.
