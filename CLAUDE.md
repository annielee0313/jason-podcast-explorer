# CLAUDE.md

Context for Claude Code working in this repo. Read README.md for the product overview and DESIGN.md for the visual system (tokens, type hierarchy, components, motion).

## What this is
A static React (Vite + TypeScript) site that helps new listeners discover episodes of the Taiwanese business podcast 《Jason好好聊》 (host 楊佳燊 Jason, produced by 傑思‧愛德威 / JS-Adways). It also has two internal tools: 語錄室 (`/explorer`) and 短影音工作台 (`/studio`). Since 2026-10-21 they are hidden from the public site (routes and footer links exist only under `npm run dev`). All content comes from JSON in `data/`. Python scripts in `scripts/` build that data.

## Direction (from the 2026-10-20 meeting with Jenny, the show's producer)
- **Audience goal:** today's listeners are mostly 30–40+; the push is to reach a younger audience. Weigh new features and copy against that.
- **Jenny already transcribes (NotebookLM → SRT, checked by hand), edits in Premiere from three unsynced cameras, and makes reels (Premiere / CapCut).** Don't rebuild her workflow. For new episodes, prefer her final SRT over our Whisper output; Whisper fills back-catalogue gaps only.
- **No links to guests' personal sites, courses or products.** The show must not look like it endorses them.
- **Cadence:** a new episode every other week, skipping holidays; the YouTube video follows the audio. Automation should not assume weekly.
- **Spotify:** add the show URL to `data/about.json` (`show.spotify`); the buttons appear when it's set. Don't guess the URL.
- **Ideas on the table:** a Q&A chatbot that answers only from transcripts (episode + timestamp + verified quote, says so when the show hasn't covered something) and recommends episodes; listener questions are collected **inside the chatbot** (「把這個問題留給 Jason」, optional email, consent) and may later feed a public question board; an email subscription that sends people to a monthly recap page (每月回顧).
- **抽一句** draws from `data/deck.json`: verbatim show-note lines, rule-filtered then selected (not rewritten) by `scripts/pick_deck.py`. Labelled 節目重點, no quotation marks, since the production team wrote them. Delete a line in deck.json to veto it.
- **Jason 親選 / 最多人收聽 come from the team's Google Sheet** (two tabs, published as CSV; links in `data/sheets.json`, local fallback CSVs in `data/sheets/`). `scripts/sync_sheets.py` validates and writes `curation.json`; it runs before every deploy and daily at 03:00 Taipei. Bad rows → keep last good lists. Setup guide for the team: `docs/google-sheet-setup.md`. The 5 current picks are random placeholders flagged 暫定.
- **All 248 feed episodes are imported** (EP.54 is missing from the feed). All are tagged with themes and an industry by `scripts/tag_episodes.py` (Claude Opus 5.5, 2026-10-21; reasons and confidence in `data/tag_report.json`, low-confidence rows worth a human look). EP.20 (Jason solo) and EP.28 (Elynn, part 2 of EP.27) have hand-entered guests. Older titles (EP.1–147, 「EP.n 職稱 姓名｜標題」) are trimmed to the part after ｜ by the fetch script.
- **Stats** live in `data/about.json` → `stats`. Only the headline episode count animates (count-up on arrival); guests (`200+`, a safe floor) and the Apple rating are static.

## Commands
- `npm run dev` runs the dev server.
- `npm run build` typechecks and builds. Run it before committing UI changes.
- `python scripts/fetch_episodes.py --limit 50` pulls episodes from the RSS feed.
- `python scripts/tag_episodes.py` uses Claude to suggest themes for untagged episodes.
- `python scripts/transcribe.py --eps 247` transcribes (mlx-whisper on Apple Silicon, else faster-whisper) into raw `data/transcripts/`.
- `python scripts/clean_transcripts.py` removes Whisper hallucinations (YouTube sign-offs over music, loops) and writes the compact `data/transcripts-web/` files the site lazy-loads. Run it after every transcribe.

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
- **Guest industry** comes from the draft taxonomy in `data/facets.json` (one value per episode, `null` until confirmed). Same rule as themes: no free-form values. Authors are filed by their book's subject. There is no role/title (身分) filter: the team asked to categorise by industry only.
- **Data scripts merge, they don't overwrite.** Hand-curated fields (`themes`, `arc`, `highlight`, `appleUrl`, `industry`, `youtubeId`, and `guest`/`org` once imported) survive re-fetching. The guest-line split is a heuristic: check new names (e.g. two-word English names, nicknames) and fix them in episodes.json.
- **Episode links:** listen buttons open the episode itself: `appleUrl` (Apple's public lookup, newest 200 episodes), `soundonUrl` (feed `<link>`, all episodes), `youtubeId`. Missing ones fall back to the show page.
- **Full-bleed sections.** Section backgrounds run edge to edge (`.section`, `.section-white`); content sits in `.wrap` (1200px column, 56px / 16px gutters). The hero bento is edge to edge with no gaps or radius.
- **No border strokes.** Separate surfaces with fills (`--ground`, `#fff`, `--soft`), radius and spacing. The only outline allowed is the dashed `.placeholder` for missing data.
- **Host, book and company facts** live in `data/about.json` (sources noted inside). Keep the 傑思‧愛德威 section and footer links: routing listeners to the company is a core goal of the site.
- **Brand colors:** turquoise `--teal` is only a fill, with slate text on it, because white on turquoise fails contrast. Links and white-text buttons use `--teal-strong`.
- **Accessibility:** use real buttons and links, keep touch targets at least 44px, set `aria-pressed` on toggles. The inline guest map only zooms on pinch or ⌘/Ctrl+wheel so a plain wheel still scrolls the page.
- **Hero background** is a Paper Shaders `MeshGradient` (`src/components/HeroBackground.tsx`, pinned `@paper-design/shaders-react@0.0.81`, pre-1.0 so upgrade deliberately). Keep its colours near `--ground`/`--teal-wash` so the ink headline keeps contrast; it pauses off-screen and is static under reduced motion.
- **Motion is subtle and optional:** GSAP only, small rises (≤28px) and fades, once per element, all inside `gsap.matchMedia('(prefers-reduced-motion: no-preference)')`, with `clearProps` so CSS hover states keep working.
- Routing uses `BrowserRouter` with real paths (`/episode/247/`). `npm run build` also prerenders every route to static HTML (`src/entry-server.tsx` + `scripts/prerender.mjs`) with per-page title, description, canonical, Open Graph and JSON-LD from `src/lib/seo.ts`, plus `sitemap.xml`, `robots.txt` and `404.html`. Old `#/` links redirect in `main.tsx`.
- **SSR-safe components:** no `window`/`document`/`localStorage` during render or in `useState` initialisers; read them in effects. Asset paths use `import.meta.env.BASE_URL`. The public URL comes from `SITE_URL` (vite.config.ts); set it when the site moves to the company domain.
- `/explorer` and `/studio` are internal and dev-only: not routed, prerendered or linked in production builds.
- **Transcripts:** the cleaned `data/transcripts-web/` files for EP.238–249 are public (approved 2026-10-21) and shown on episode pages. Raw `data/transcripts/` and `data/clips/` stay local. Episode pages show only what exists: no placeholder cards for missing transcripts or takeaways. Episodes with a transcript also get an audio player (RSS enclosure from `data/audio_urls.json`, streamed from SoundOn) and click-to-play paragraphs with the spoken one highlighted. **Hidden for now** (`SHOW_TRANSCRIPT = false` in `src/pages/Episode.tsx`, 2026-10-21).
- **YouTube:** `scripts/fetch_youtube.py` matches channel videos to episodes by the 「EP###」 in their titles and stores `youtubeId` (a curated field: never overwritten). It reads the public feed (latest 15) before every deploy; a one-time `--all` backfill needs `YOUTUBE_API_KEY`. Episode pages embed the video (thumbnail first, youtube-nocookie player on click) and add it to the JSON-LD.

## Known gaps / next tasks
- The guest map is a focus view (`src/components/guestMapLayout.ts`): the selected guest pinned at the centre of a crosshair, their 1–2 themes either side, and every guest sharing a theme grouped into industry clusters (soft halos, count; click to open into name chips). Same-industry groups are highlighted. The side panel matches the map's height; the related list is paged (dots), not scrolled.
- 短影音工作台 has a subtitle editor: fix words, tag each line Jason (`host`) or guest (`guest`), trim lines; edits update the preview and `.srt` live. Drafts are saved only in the editor's browser (localStorage) and exported as `EP###.json` to drop into `data/clips/`. A shared save needs a backend/CMS (open decision). Speaker colours: `--host` / `--guest` tokens.
- Transcripts exist for EP.238–249 (machine, unreviewed, no speaker labels). The episode page and 語錄室 search use them.
- `questions.sample.json` is demo data. Reel candidates live in `data/clips/EP###.json` (EP.247 done by hand from its transcript: hook/quote/subs verbatim, titles/captions editorial, speakers unconfirmed). Automate the rest from transcripts:
  - Use diarization to find Jason's turns.
  - Cluster his questions with embeddings.
  - Have an LLM propose 30–60s clips that make sense on their own.
- The hero stats (249 episodes, 200+ guests) are hard-coded. Derive them from the data once all episodes are imported.
- The Spotify episode links aren't known yet.
