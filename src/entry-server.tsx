import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from './App';
import { episodes } from './lib/data';

export { headFor, headHtml, sitemapXml } from './lib/seo';

/** Paths written as static HTML by scripts/prerender.mjs. /studio is internal and stays an empty shell. */
export const routes = ['/', '/explorer', ...episodes.map((e) => `/episode/${e.ep}`)];

export function render(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';
  return renderToString(
    <React.StrictMode>
      <StaticRouter basename={base} location={base.replace(/\/$/, '') + path}>
        <App />
      </StaticRouter>
    </React.StrictMode>,
  );
}
