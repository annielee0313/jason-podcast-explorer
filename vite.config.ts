import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Public address of the site. Set SITE_URL when moving to the company domain
// (e.g. SITE_URL=https://podcast.js-adways.com.tw/); paths, canonicals and the sitemap follow it.
const SITE_URL = (process.env.SITE_URL ?? 'https://annielee0313.github.io/jason-podcast-explorer/').replace(/\/?$/, '/');

export default defineConfig({
  plugins: [react()],
  base: new URL(SITE_URL).pathname,
  define: { __SITE_URL__: JSON.stringify(SITE_URL) },
  // Bundle these into the prerender build; their Node entry points are CommonJS.
  ssr: { noExternal: ['gsap', /^@paper-design\//] },
});
