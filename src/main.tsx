import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import EpisodePage from './pages/Episode';
import Explorer from './pages/Explorer';
import Studio from './pages/Studio';
import './styles.css';

// HashRouter so the static build works on GitHub Pages without server rewrites.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/episode/:ep" element={<EpisodePage />} />
        <Route path="/explorer" element={<Explorer />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
