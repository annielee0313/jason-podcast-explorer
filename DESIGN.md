# DESIGN.md

How 《Jason好好聊》's site looks and behaves, and why. Tokens live in `src/styles.css` (`:root`);
theme and industry colours live in `data/themes.json` and `data/facets.json`. When this file and
the code disagree, fix one of them. Product and data rules are in `CLAUDE.md`.

## Principles

1. **Quiet editorial, not app chrome.** Japanese-magazine feel: a restrained serif for display,
   small sans body, generous leading, lots of negative space. Content first; UI recedes.
2. **No border strokes.** Surfaces are separated by fill (`--ground`, `#fff`, `--soft`), radius and
   spacing. The only outline allowed is the dashed `.placeholder` (and it should be rare: see 6).
3. **Full-bleed sections, one content column.** Section backgrounds run edge to edge; content sits
   in `.wrap` (max 1312px incl. 56px gutters; 16px on phones).
4. **Turquoise is a fill, never under white text.** White on `--teal` fails contrast. Links and
   white-text buttons use `--teal-strong`.
5. **Stable layouts.** Things that change (a drawn quote, a counting number, filters) must not make
   the page jump: reserve space, clamp lines, keep widths fixed.
6. **Show only what exists.** No empty cards or "coming soon" boxes on public pages; a missing
   transcript, video or reason simply doesn't render. Never invent data (see `CLAUDE.md`).
7. **Younger, newcomer-friendly.** Every section answers "where do I start?" in one glance.

## Colour

| Token | Value | Use |
|---|---|---|
| `--ink` | #1E2B33 | Text, dark surfaces (deck, map labels, player) |
| `--ink-2` | #2A3A44 | Hover on ink |
| `--teal` | #2CB5C0 | Accent **fill** only (play buttons, progress), slate text on it |
| `--teal-strong` | #0E7C86 | Links, white-text buttons, kickers on light, active states |
| `--teal-light` | #6FD3DB | Accents on dark (kicker on ink, EP numbers in deck) |
| `--teal-wash` | #D8F1F3 | Soft highlight (active transcript line, `<mark>`, 同產業 tag) |
| `--ground` | #F2F5F6 | Page background, inset blocks on white |
| `#fff` / `--card` | | Cards, panels |
| `--soft` | #E7EDEF | Filled chips/toggles on white, hover |
| `--line` / `--line-soft` | | Map grid and pager dots only; never as borders |
| `--muted` / `--muted-2` | #4E5460 / #6A707B | Secondary / tertiary text (both ≥ 4.5:1 on white) |
| `--on-dark-muted` | #C9CDD4 | Secondary text on ink |

**Tag colours.** Each theme (`themes.json`) and industry (`facets.json`) has `bg` + `fg` for tags
(fg on bg ≥ 4.5:1; lowest is 餐飲／旅遊 at 5.5:1) and a mid-tone (`dot` / `color`) for squares,
map halos and dots. Mid-tones are never used as text on white.

**Speakers** (transcripts, studio): `--host` #0E7C86 / `--guest` #9A3412 on light;
`--host-on-dark` / `--guest-on-dark` on ink.

## Typography

Fonts: **Noto Serif TC** (`--serif`) for display and titles; **Manrope + Noto Sans TC** (`--font`)
for body and UI; **IBM Plex Mono** (`--mono`) for numbers, EP codes, labels.
Body: 14px, line-height 1.8, letter-spacing 0.02em.

### Hierarchy

Use the role, not a raw pixel value. Each level should look clearly different from the next:
change **two** of size / family / weight / colour, not just size by 1–2px.

| Role | Token | Size | Face | Where |
|---|---|---|---|---|
| Display | `--fs-display` | 34–60px | Serif 600 | Hero 「249 場對話」 |
| Page title | (episode `h1`) | 26–36px | Serif 600 | Episode title |
| Section title | `--fs-xl` | 22–28px | Serif 600 | 「全部集數」, section heads |
| Card title | `--fs-lg` | 20px | Serif 600 | Jason 親選, 最多人收聽, 這集在聊, guest name |
| Quote / feature line | — | 18–22px | Serif 500 | 抽一句 quote |
| List title | `--fs-md` | 15–16px | Serif 500–600 | Episode cards, 01–03 rows, path index lines |
| Body | `--fs-base` | 14px | Sans 400 | Paragraphs, list rows, buttons |
| UI small | (13px, no token yet) | 13px | Sans | Tags, secondary lines, guest org |
| Caption / kicker | `--fs-sm` | 12px | Mono or Sans, teal | Section kickers (隨手抽一句, 常被聊到的詞), meta, notes |
| Micro | `--fs-xs` | 11px | Mono | Counts, EP codes in tight spots, labels like 主題 / 產業 |

**Kickers.** Small labels that name a block rather than say something: `.kicker` (teal-light, on
ink) and `.kicker kicker-light` (teal-strong, on white/ground). Paired blocks use the same level:
常被聊到的詞 and 隨手抽一句 are both kickers. Blocks that *are* the content's headline
(Jason 親選, 最多人收聽) use the card title.

**Numbers** are mono (EP.247, 01:43, counts) except display numbers (hero count, 01–03 ranks),
which use the serif.

### Cleanup to do (as of 2026-10-21)

- 13px is used ~28 times without a token → add `--fs-ui: 13px` and use it.
- One-off sizes to fold into the scale: 15 → `--fs-md`; 17/18/19 → `--fs-md` or `--fs-lg`;
  22/24/26 → `--fs-xl`; 10px → `--fs-xs` (10px is below our minimum).
- Inline `fontSize` in `Episode.tsx`, `Explorer.tsx`, `Studio.tsx`, `Landing.tsx` → classes.

## Space, radius, layout

- **Sections:** 112px top padding (64px on phones); `.section-white` adds the same at the bottom.
- **Cards:** 32px padding; gaps between cards 20px. Inside a card, 8px between title and its note,
  20–24px before the content.
- **Radius** is small and quiet: `--r-xs` 2px (tags, chips, marks), `--r-sm` 4px (buttons, toggles,
  small boxes), `--r-md` 8px (cards, panels). Circles only for icon buttons and dots.
- **Touch targets** ≥ 44px (tags are 40px tall with full-width hit areas; keep it there or above).
- **Breakpoints:** 860px (two columns → one), 640px (phone: 16px gutters, sheets from the bottom).

## Components

- **Buttons.** `.btn` 44px, 4px radius. `btn-light` (white), `btn-ghost-dark` (on ink),
  `btn-primary` (teal-strong, white text), `link-btn` (text + round arrow). Primary actions on a
  dark card sit on their **own row** below the content (抽一句).
- **Tags.** Theme and industry tags are small squares of colour: `bg`/`fg` from the data files,
  2px radius. Filters (compact: 12px text, 34px tall): white with a colour square; selected = the tag's own
  colours, square keeps its colour, same weight (width never shifts). Rows stay on one line: `+N` expands on desktop, × folds
  back; phones scroll the row sideways with a right-edge fade.
- **Top lists** (Jason 親選 / 最多人收聽): two identical cards, 1:1, three rows each, serif
  01–03 numerals in teal-strong, title / EP · guest / arrow.
- **Episode cards:** mono meta, serif title, guest line, theme tags, round arrow.
- **Pagination:** mono numbers with a teal underline (episode grid); dots with a sliding window of
  7, current page a short teal bar (guest map list).
- **Pop-up / sheet** (`Modal`): white, 8px radius, 680px max; bottom sheet on phones. Escape,
  backdrop and × close it; focus is trapped and returned; page scroll locks; body scrolls inside.
- **Episode page:** one left-aligned header column (meta → title → theme tags → 「來賓 name」 with
  the company below → listen buttons), then the YouTube video (no card, thumbnail until played),
  這集在聊, and 接著聽 on the right.
- **Guest map:** focus view. Centre guest = dark label with a crosshair through it; themes = tag-
  coloured labels with a soft halo sized by guest count; related guests = industry clusters (soft
  colour halos, dark count chip, teal when same industry). Faint grid, hairline links. Side panel
  matches the map's height; its list pages instead of scrolling.

## Motion

GSAP only, subtle and optional: rises ≤ 28px and fades, once per element, inside
`gsap.matchMedia('(prefers-reduced-motion: no-preference)')`, with `clearProps`. The hero count
rolls like an odometer (~1.2s, ones digit spins most); width is reserved so the text after it
never moves. The hero shader drifts slowly and pauses off-screen. Under reduced motion everything
is static.

## Copy

Traditional Chinese, Taiwan usage; warm and plain, not corporate. Label what things are honestly:
show-note lines are 「節目重點」 without quotation marks (the production team wrote them, not the
guest); machine transcripts say so. Don't name missing sources on public pages; just leave the
block out.
