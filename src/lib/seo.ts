import { about, curation, episodeByNumber, episodes, industryOf, themeById, type Episode } from './data';

/**
 * Per-route <head>: title, description, canonical URL, Open Graph and JSON-LD.
 * Used twice: by scripts/prerender.mjs to write it into each static page, and
 * by App on client-side navigation. Everything here comes from data/ (no
 * invented facts); a field we don't have is left out rather than guessed.
 */

export const SITE_URL = __SITE_URL__; // https://jasonstalk.com/ (set in vite.config.ts)
const SHOW = 'Jason好好聊';
const FEED = 'https://feeds.soundon.fm/podcasts/f1f2a53d-d42a-4752-a768-00a32b1ac9c5.xml';
const IMAGE = `${SITE_URL}jason-wide.jpg`;

export interface Head {
  title: string;
  description: string;
  url: string;
  type: 'website' | 'article';
  noindex?: boolean;
  /** Share image (og:image). Episodes get their own card from scripts/og-images.mjs. */
  image?: string;
  jsonLd?: object;
}

/** The episode's share card, written to dist/og/ at build time. */
export const episodeImage = (ep: number) => `${SITE_URL}og/EP${ep}.jpg`;

const abs = (path: string) => SITE_URL + path.replace(/^\//, '');

const series = {
  '@type': 'PodcastSeries',
  '@id': `${SITE_URL}#series`,
  name: `《${SHOW}》`,
  url: SITE_URL,
  webFeed: FEED,
  inLanguage: 'zh-Hant-TW',
  image: IMAGE,
  author: { '@type': 'Person', name: `${about.host.name} ${about.host.nameEn}`, jobTitle: about.host.title },
  publisher: { '@type': 'Organization', name: `${about.company.name} ${about.company.nameEn}`, url: about.company.website },
  sameAs: [about.show.apple, about.show.youtube, about.show.soundon, about.show.spotify].filter(Boolean),
};

/** ISO 8601 duration for schema.org timeRequired. */
const isoDuration = (sec: number) => `PT${Math.floor(sec / 60)}M${sec % 60}S`;

function episodeDescription(e: Episode) {
  const lead = `${e.guest}${e.org ? `（${e.org}）` : ''}和 Jason 聊「${e.title}」。`;
  // Whole takeaway lines only, as many as fit in ~160 characters.
  for (let n = Math.min(3, e.takeaways.length); n > 0; n--) {
    const text = `${lead}這集聊到：${e.takeaways.slice(0, n).join('、')}。`;
    if (text.length <= 160) return text;
  }
  return lead;
}

export function headFor(pathname: string): Head {
  const ep = pathname.match(/^\/episode\/(\d+)\/?$/);
  if (ep) {
    const e = episodeByNumber(Number(ep[1]));
    if (e) {
      const url = abs(`/episode/${e.ep}/`);
      return {
        title: `EP.${e.ep} ${e.title}｜${e.guest}｜${SHOW}`,
        description: episodeDescription(e),
        url,
        type: 'article',
        image: episodeImage(e.ep),
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'PodcastEpisode',
          url,
          name: e.title,
          episodeNumber: e.ep,
          datePublished: e.date,
          description: episodeDescription(e),
          ...(e.durationSec ? { timeRequired: isoDuration(e.durationSec) } : {}),
          inLanguage: 'zh-Hant-TW',
          image: IMAGE,
          actor: { '@type': 'Person', name: e.guest, ...(e.org ? { jobTitle: e.org } : {}) },
          sameAs: [e.appleUrl, e.soundonUrl, e.youtubeId && `https://www.youtube.com/watch?v=${e.youtubeId}`].filter(Boolean),
          ...(e.youtubeId ? {
            video: {
              '@type': 'VideoObject', name: e.title, uploadDate: e.date,
              thumbnailUrl: `https://i.ytimg.com/vi/${e.youtubeId}/hqdefault.jpg`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${e.youtubeId}`,
              contentUrl: `https://www.youtube.com/watch?v=${e.youtubeId}`,
              description: episodeDescription(e),
            },
          } : {}),
          partOfSeries: series,
        },
      };
    }
  }
  if (/^\/explorer\/?$/.test(pathname)) {
    return {
      title: `語錄室：${episodes.length} 集節目重點，一次搜尋｜${SHOW}`,
      description: `搜尋《${SHOW}》歷集節目重點與來賓語錄，找到聊過某個主題的那幾集。`,
      url: abs('/explorer/'),
      type: 'website',
      noindex: true, // internal tool; the episode pages carry the same content for search
    };
  }
  if (/^\/studio\/?$/.test(pathname)) {
    return { title: `短影音工作台｜${SHOW}`, description: '內部工具。', url: abs('/studio/'), type: 'website', noindex: true };
  }
  return {
    title: `${SHOW}｜${about.stats.episodes} 場對話，從哪一集開始聽`,
    description: `《${SHOW}》是${about.company.name}創辦人${about.host.name} Jason 主持的商業 Podcast，${about.stats.since} 年至今和 ${about.stats.guestsFloor} 多位創業家、經理人聊工作與人生。依主題、產業與收聽路線，找到你的第一集。`,
    url: SITE_URL,
    type: 'website',
    jsonLd: { '@context': 'https://schema.org', ...series, description: `${about.host.name} 主持的商業訪談 Podcast。` },
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The <head> tags for a prerendered page. JSON-LD has "<" escaped so it can't close the script tag. */
export function headHtml(h: Head) {
  return [
    `<title>${esc(h.title)}</title>`,
    `<meta name="description" content="${esc(h.description)}" />`,
    `<link rel="canonical" href="${h.url}" />`,
    h.noindex ? '<meta name="robots" content="noindex" />' : '',
    `<meta property="og:site_name" content="${SHOW}" />`,
    `<meta property="og:locale" content="zh_TW" />`,
    `<meta property="og:type" content="${h.type}" />`,
    `<meta property="og:title" content="${esc(h.title)}" />`,
    `<meta property="og:description" content="${esc(h.description)}" />`,
    `<meta property="og:url" content="${h.url}" />`,
    `<meta property="og:image" content="${h.image ?? IMAGE}" />`,
    h.image ? '<meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />' : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    h.jsonLd ? `<script type="application/ld+json" id="ld-json">${JSON.stringify(h.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n    ');
}

/** Keep document.head in step after a client-side route change. */
export function applyHead(h: Head) {
  document.title = h.title;
  const meta = (attr: 'name' | 'property', key: string, value: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.content = value;
  };
  meta('name', 'description', h.description);
  meta('property', 'og:title', h.title);
  meta('property', 'og:description', h.description);
  meta('property', 'og:url', h.url);
  meta('property', 'og:type', h.type);
  meta('property', 'og:image', h.image ?? IMAGE);
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
  canonical.href = h.url;
  document.head.querySelector('meta[name="robots"]')?.remove();
  if (h.noindex) meta('name', 'robots', 'noindex');
  document.getElementById('ld-json')?.remove();
  if (h.jsonLd) {
    const s = Object.assign(document.createElement('script'), { type: 'application/ld+json', id: 'ld-json', text: JSON.stringify(h.jsonLd) });
    document.head.appendChild(s);
  }
}

export function sitemapXml() {
  const urls = [
    { loc: SITE_URL, lastmod: episodes[0]?.date },
    ...episodes.map((e) => ({ loc: abs(`/episode/${e.ep}/`), lastmod: e.date })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

/**
 * llms.txt: a plain-Markdown map of the site for AI crawlers and answer engines
 * (https://llmstxt.org). llms-full.txt adds every episode's show-note points, so a model can
 * answer "which episode talks about X" from one file. Only facts from data/; nothing invented.
 */
const epLine = (e: Episode) =>
  `- [EP.${e.ep}｜${e.title}](${abs(`/episode/${e.ep}/`)}): 來賓 ${e.guest}${e.org ? `（${e.org}）` : ''}；${e.date}` +
  `${e.themes.length ? `；主題 ${e.themes.map((t) => themeById[t].name).join('、')}` : ''}；產業 ${industryOf(e).name}`;

function llmsHeader() {
  const h = about.host;
  return `# 《${SHOW}》

> ${about.company.name}（${about.company.nameEn}）創辦人${h.name} ${h.nameEn} 主持的繁體中文商業訪談 Podcast，${about.stats.since} 年至今 ${episodes.length} 集，每集訪問一位不同產業的創業家或經理人，約每兩週更新。

- 主持人：${h.name} ${h.nameEn}，${h.title}。${h.facts.join('；')}。
- 主持人著作：《${about.book.title}》（${about.book.publisher}，${about.book.date}）：${about.book.url}
- 製作：${about.company.name}，${about.company.website}；聯絡 ${about.company.email}
- 收聽：Apple Podcasts ${about.show.apple}；YouTube ${about.show.youtube}；SoundOn ${about.show.soundon}${about.show.spotify ? `；Spotify ${about.show.spotify}` : ''}
- RSS：${FEED}
- 每集頁面有標題、來賓、日期、主題、產業、節目重點與影片；重點取自節目說明原文。
`;
}

export function llmsTxt() {
  return `${llmsHeader()}
## 推薦從這裡開始

${curation.paths.map((p) => `- ${p.title}：${p.blurb} ${p.eps.map((n) => `[EP.${n}](${abs(`/episode/${n}/`)})`).join('、')}`).join('\n')}

## 全部集數（新到舊）

${episodes.map(epLine).join('\n')}

## 更多

- [完整版（含每集節目重點）](${abs('/llms-full.txt')})
- [網站地圖](${abs('/sitemap.xml')})
`;
}

export function llmsFullTxt() {
  return `${llmsHeader()}
## 全部集數與節目重點（新到舊）

${episodes.map((e) => `### EP.${e.ep}｜${e.title}

- 網址：${abs(`/episode/${e.ep}/`)}
- 來賓：${e.guest}${e.org ? `（${e.org}）` : ''}
- 日期：${e.date}
- 主題：${e.themes.map((t) => themeById[t].name).join('、') || '—'}；產業：${industryOf(e).name}
${e.takeaways.length ? `- 節目重點：\n${e.takeaways.map((t) => `  - ${t}`).join('\n')}` : ''}`).join('\n\n')}
`;
}
