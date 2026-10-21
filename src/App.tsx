import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import EpisodePage from './pages/Episode';
import Explorer from './pages/Explorer';
import Studio from './pages/Studio';
import { applyHead, headFor } from './lib/seo';

/** Routes shared by the browser entry (main.tsx) and the prerenderer (entry-server.tsx). */
export default function App() {
  const { pathname } = useLocation();
  // Prerendered pages already ship the right <head>; this keeps it in step on client-side navigation.
  useEffect(() => { applyHead(headFor(pathname)); }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/episode/:ep" element={<EpisodePage />} />
      <Route path="/explorer" element={<Explorer />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
