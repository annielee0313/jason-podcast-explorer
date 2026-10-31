// Per-episode share images (1200×630 PNG, og:image) for LINE / FB / IG / Threads previews:
// the show's cover on the right; EP number, title, guest and theme tags on the left.
// Rendered at build time with Satori (layout → SVG) and resvg (SVG → PNG).
// Fonts: Noto Serif TC / Noto Sans TC from Google Fonts, subset per card to exactly the characters
// on it (Satori doesn't fall back across several files of the same family). Saved as JPEG.
// If anything fails (e.g. no network), it returns an empty set and pages keep the default image.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const COVER = 430;
const INK = '#1E2B33';
const MUTED = '#4E5460';
const TEAL = '#0E7C86';

/** One Google Fonts subset (TrueType via an old user agent) containing exactly `text`. */
async function fontSubset(family, weight, text) {
  const chars = [...new Set(text)].join('');
  const css = await (await fetch(
    `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(chars)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1)' } },
  )).text();
  const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
  if (urls.length !== 1) throw new Error(`expected one font file for ${family}, got ${urls.length}`);
  return { name: family, weight, style: 'normal', data: await (await fetch(urls[0])).arrayBuffer() };
}

/** Run `fn` over items, `n` at a time. */
async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()); }));
}

const h = (type, style, children) => ({ type, props: { style, children } });

/** Keep a title to about `max` characters so it fits in three lines. */
const clip = (s, max) => ([...s].length > max ? [...s].slice(0, max - 1).join('') + '…' : s);

function card(e, themes, cover) {
  const title = clip(e.title, 39);
  const org = clip(e.org || '', 26);
  const size = [...title].length <= 16 ? 56 : 46;
  return h('div', { width: W, height: H, display: 'flex', background: '#F2F5F6' }, [
    h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: W - COVER, padding: '64px 64px 60px 72px' }, [
      h('div', { display: 'flex', flexDirection: 'column', gap: 28 }, [
        h('div', { display: 'flex', alignItems: 'baseline', gap: 18, fontFamily: 'Noto Sans TC', fontSize: 24, color: TEAL, letterSpacing: 1 }, [
          `EP.${e.ep}`,
          h('span', { color: MUTED, fontSize: 22 }, 'Jason好好聊'),
        ]),
        h('div', { display: 'flex', fontFamily: 'Noto Serif TC', fontSize: size, fontWeight: 600, lineHeight: 1.35, color: INK }, title),
      ]),
      h('div', { display: 'flex', flexDirection: 'column', gap: 18 }, [
        h('div', { display: 'flex', flexDirection: 'column', gap: 4 }, [
          h('div', { display: 'flex', fontFamily: 'Noto Serif TC', fontSize: 32, fontWeight: 600, color: INK }, e.guest || ' '),
          org ? h('div', { display: 'flex', fontFamily: 'Noto Sans TC', fontSize: 22, color: MUTED }, org) : null,
        ].filter(Boolean)),
        h('div', { display: 'flex', gap: 10 }, e.themes.map((id) => {
          const t = themes.find((x) => x.id === id);
          return h('div', { display: 'flex', padding: '6px 14px', borderRadius: 4, background: t.bg, color: t.fg, fontFamily: 'Noto Sans TC', fontSize: 22 }, t.name);
        })),
      ]),
    ]),
    { type: 'img', props: { src: cover, width: COVER, height: H, style: { objectFit: 'cover' } } },
  ]);
}

/** Write dist/og/EP###.jpg for every episode. Returns the set of episode numbers written. */
export async function generateOgImages({ episodes, themes, publicDir, outDir }) {
  try {
    // The right-hand panel: a tall crop of jason-wide.jpg around Jason (he sits right of centre).
    const coverJpg = await sharp(join(publicDir, 'jason-wide.jpg'))
      .extract({ left: 600, top: 0, width: 393, height: 576 })
      .resize(COVER, H).jpeg({ quality: 86 }).toBuffer();
    const cover = `data:image/jpeg;base64,${coverJpg.toString('base64')}`;
    mkdirSync(outDir, { recursive: true });
    const done = new Set();
    await pool(episodes, 6, async (e) => {
      const tags = e.themes.map((id) => themes.find((t) => t.id === id)?.name ?? '').join('');
      const fonts = [
        await fontSubset('Noto Serif TC', 600, clip(e.title, 39) + (e.guest || '') + '…'),
        await fontSubset('Noto Sans TC', 400, `EP.${e.ep}Jason好好聊` + clip(e.org || '', 26) + tags + '…'),
      ];
      const svg = await satori(card(e, themes, cover), { width: W, height: H, fonts });
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
      writeFileSync(join(outDir, `EP${e.ep}.jpg`), await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toBuffer());
      done.add(e.ep);
    });
    return done;
  } catch (err) {
    console.warn(`share images skipped (${err.message}); pages keep the default image`);
    return new Set();
  }
}
