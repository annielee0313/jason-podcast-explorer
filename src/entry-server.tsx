import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from './App';
import { episodes, themes } from './lib/data';

export { headFor, headHtml, sitemapXml } from './lib/seo';
export { episodes, themes };

/** Paths written as static HTML by scripts/prerender.mjs. The internal tools are not published. */
export const routes = ['/', ...episodes.map((e) => `/episode/${e.ep}`)];

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
