import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigationType, type Location } from 'react-router-dom';
import { gsap } from 'gsap';

const OUT = 0.38; // seconds: the old page slides away
const IN = 0.5; // seconds: the new page slides in

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Page transitions: when the path changes, the current page slides out and the new one slides in.
 * Going deeper (into an episode) pages move right → left; going back (browser back, or to the
 * home page) left → right. `children(location)` renders the *shown* location, which lags the live
 * one until the old page is off-screen. Scroll: new pages start at the top; going back restores
 * where you were. Off under reduced motion; same-page changes (state, search, hash) never animate.
 */
export function PageTransition({ children }: { children: (location: Location) => ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType();
  const [shown, setShown] = useState(location);
  const pageRef = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const scrolls = useRef(new Map<string, number>());
  const restoreTo = useRef<number | null>(null);
  const enterFrom = useRef<number | null>(null); // xPercent the next page starts at

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // per history entry: keep it set
    if (location.pathname === shown.pathname) {
      if (location !== shown) setShown(location);
      return;
    }
    const back = navType === 'POP' || location.pathname === '/';
    const swap = () => {
      scrolls.current.set(shown.key, window.scrollY);
      restoreTo.current = back && navType === 'POP' ? scrolls.current.get(location.key) ?? 0 : 0;
      setShown(location);
    };
    const el = pageRef.current;
    if (reduced() || !el) { swap(); return; }

    tl.current?.kill();
    document.documentElement.style.overflowX = 'hidden'; // no sideways scrollbar mid-slide
    tl.current = gsap.timeline()
      .to(el, { xPercent: back ? 100 : -100, duration: OUT, ease: 'power3.in' })
      .call(() => { enterFrom.current = back ? -100 : 100; swap(); });
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  // After the new page renders: set its scroll, then slide it in from the entry side.
  useLayoutEffect(() => {
    if (restoreTo.current !== null) { window.scrollTo(0, restoreTo.current); restoreTo.current = null; }
    const el = pageRef.current;
    if (enterFrom.current === null || !el) return;
    const from = enterFrom.current;
    enterFrom.current = null;
    tl.current = gsap.timeline({ onComplete: () => { document.documentElement.style.overflowX = ''; } })
      .fromTo(el, { xPercent: from }, { xPercent: 0, duration: IN, ease: 'power3.out', clearProps: 'transform' });
  }, [shown]);

  return <div ref={pageRef} className="pt-page">{children(shown)}</div>;
}
