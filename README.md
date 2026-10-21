# Jason好好聊 Explorer

A discovery site for the podcast **《Jason好好聊》**, plus internal tools built on the same data. The goal is to give new listeners ways in that don't depend on a search box: listening paths, themes, recurring phrases, a guest map and a takeaway deck. Every route ends in a link out to the episode on Apple Podcasts, Spotify or SoundOn.

| Route | What it is | Audience |
|---|---|---|
| `/` | Landing page: hero, listening paths, Jason's picks, recurring themes and words, the 抽一句 takeaway deck, the guest map (pop-up), and a filterable episode grid | Public |
| `/episode/:ep` | Episode page: guest, career arc, takeaways (timestamps to come), and related episodes by shared theme | Public |
| `/explorer` | 語錄室: recurring words with highlighted matches, and "same question, different answers" | Internal |
| `/studio` | 短影音工作台: suggested clips on a timeline, 9:16 / 1:1 / quote-card preview, caption draft | Internal |

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

The build is static and uses hash routing, so `dist/` can be deployed to GitHub Pages, Netlify or Vercel as-is.

## Data

Everything the site shows comes from `data/`. No backend.

| File | Contents | Maintained by |
|---|---|---|
| `episodes.json` | One row per episode: number, date, duration, title, guest, org, takeaways, themes, arc, highlight | `scripts/fetch_episodes.py` + `scripts/tag_episodes.py`, then human review |
| `themes.json` | The fixed theme taxonomy, with colors and hub positions on the guest map | Hand-edited |
| `curation.json` | Listening paths, Jason's picks, most-replayed, the phrase list, and guest-map positions | Hand-edited |
| `questions.sample.json` | Demo data for "same question, different answers" | Replace once transcripts exist |
| `clips/EP###.json` | Reel candidates. EP.247: picked from the transcript; quotes and subtitles verbatim, speakers unconfirmed | Add more per episode |
| `transcripts/EP###.json` | Whisper output: segments with timestamps and optional speaker labels | `scripts/transcribe.py` |

**Current state:** 12 episodes (EP.238–249).
- EP.242–249 have their verbatim ☑️ takeaways from the show notes.
- EP.238–241 have only a paraphrased `highlight` (`highlightIsSummary: true`) until the fetch script runs.
- The theme tags are a first draft.

## Pipeline

```bash
pip install -r scripts/requirements.txt

python scripts/fetch_episodes.py --limit 50     # RSS → data/episodes.json (+ data/audio_urls.json)
python scripts/tag_episodes.py                  # Claude suggests themes/arc for untagged rows (needs ANTHROPIC_API_KEY)
python scripts/transcribe.py --latest 3         # faster-whisper → data/transcripts/
python scripts/transcribe.py --eps 247 --diarize   # + speaker labels (needs HF_TOKEN + pyannote.audio)
```

`fetch_episodes.py` merges rather than overwrites. Hand-curated fields (`themes`, `arc`, `highlight`, `appleUrl`) are kept. If your network blocks the feed, save it in a browser and use `--from-file feed.xml`.

Feed: `https://feeds.soundon.fm/podcasts/f1f2a53d-d42a-4752-a768-00a32b1ac9c5.xml`

## Roadmap

1. **Data:** import 50 episodes, then all 249. Review the tags. Add `industry` and `role` facets to the grid.
2. **Transcripts:** transcribe and diarize. Then:
   - real timestamps on episode pages
   - pull-quotes
   - Jason's questions clustered into "same question" groups
   - phrase stats over any time window (needs Chinese word segmentation, e.g. CKIP or jieba with a custom dictionary of guest and company names)
3. **Guest map at scale:** a force layout plus zoom and pan for 200+ guests, and grouping by industry or career arc.
4. **Studio:**
   - an LLM proposes clips from the transcript
   - a person trims them
   - ffmpeg or Remotion renders branded audiograms and quote cards with burned-in subtitles
5. **Analytics:** most-replayed data from the SoundOn or Spotify dashboards. Jason's picks from the team.

## Brand

The colors come from the show's cover art:
- slate `#1E2B33`
- turquoise `#2CB5C0` (used as a fill only, with slate text on it)
- dark teal `#0E7C86` (links, and buttons with white text)

The theme colors in `themes.json` are categorical on purpose. They're there to tell themes apart, not to carry the brand. The tokens are defined in `src/styles.css`.
