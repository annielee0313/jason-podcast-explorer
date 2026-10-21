// Write a static HTML page per route into dist/ so search engines and link
// previews see real content, titles and JSON-LD without running JavaScript.
// Runs after `vite build` (client) and `vite build --ssr src/entry-server.tsx`.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const ssrDir = join(root, 'dist-ssr');
const template = readFileSync(join(dist, 'index.html'), 'utf-8');
const { render, routes, headFor, headHtml, sitemapXml } = await import(pathToFileURL(join(ssrDir, 'entry-server.js')).href);

// renderToString warns that layout effects don't run on the server; that's expected here.
const warn = console.error;
console.error = (msg, ...rest) => { if (!String(msg).includes('useLayoutEffect does nothing on the server')) warn(msg, ...rest); };

const page = (head, body) => template
  .replace(/<!--head-->[\s\S]*?<!--\/head-->/, headHtml(head))
  .replace('<!--app-->', body);

const write = (file, html) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, html); };

for (const path of routes) {
  write(join(dist, path, 'index.html'), page(headFor(path), render(path)));
}
// Internal tool: no content in the HTML, not indexed.
write(join(dist, 'studio', 'index.html'), page(headFor('/studio'), ''));
// GitHub Pages serves this for unknown paths; the app renders client-side from there.
write(join(dist, '404.html'), page({ ...headFor('/'), noindex: true }, ''));

const sitemapUrl = new URL('sitemap.xml', headFor('/').url).href;
writeFileSync(join(dist, 'sitemap.xml'), sitemapXml());
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: ${new URL(headFor('/studio').url).pathname}\n\nSitemap: ${sitemapUrl}\n`);

rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerendered ${routes.length} pages, plus studio, 404.html, sitemap.xml and robots.txt`);
