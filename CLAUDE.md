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
- `src/components/`: Header/Footer, GuestMap plus GuestMapModal (layout in `guestMapLayout.ts`), and small UI pieces.
- `src/styles.css`: brand tokens (`:root`) and component classes.

## Conventions
- **UI copy is Traditional Chinese (zh-Hant, Taiwan usage).** Code, comments and commit messages are in English.
- **Never invent data.** If something isn't known yet (play counts, Jason's picks, timestamps, quotes), render a dashed `.placeholder` box naming the missing source. Mark paraphrases explicitly: `highlightIsSummary` in data, and a 摘要 label in the UI. Takeaways in `episodes.json` must be verbatim from the show notes.
- **Themes come from the fixed taxonomy** in `data/themes.json`. Use 1–2 per episode. Don't add free-form tags. Propose a taxonomy change instead.
- **Data scripts merge, they don't overwrite.** Hand-curated fields (`themes`, `arc`, `highlight`, `appleUrl`) survive re-fetching.
- **Brand colors:** turquoise `--teal` is only a fill, with slate text on it, because white on turquoise fails contrast. Links and white-text buttons use `--teal-strong`.
- **Accessibility:** use real buttons and links, keep touch targets at least 44px, set `aria-pressed` on toggles. The modal handles Escape, focus and scroll lock. Keep it that way.
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
