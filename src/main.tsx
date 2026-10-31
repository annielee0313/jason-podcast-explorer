import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

const base = import.meta.env.BASE_URL;

// Page transitions manage scroll themselves (top for new pages, the old position when going back);
// the browser's own restoration would jump the outgoing page before the transition covers it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// Old links used hash routing (…/#/episode/247). Move them to the real path; the
// prerendered HTML is then for a different page, so render fresh instead of hydrating.
const fromHash = location.hash.startsWith('#/');
if (fromHash) {
  history.replaceState(null, '', base.replace(/\/$/, '') + location.hash.slice(1));
}

const root = document.getElementById('root')!;
const app = (
  <React.StrictMode>
    <BrowserRouter basename={base.replace(/\/$/, '') || '/'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Prerendered pages (scripts/prerender.mjs) hydrate; the bare shell (404.html, or dev, where #root
// only holds the <!--app--> placeholder comment) renders fresh.
if (root.firstElementChild && !fromHash) ReactDOM.hydrateRoot(root, app);
else ReactDOM.createRoot(root).render(app);
