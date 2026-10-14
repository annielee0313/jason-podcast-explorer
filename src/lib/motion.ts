import { useLayoutEffect, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
// Animations always finish on time, even on a slow or throttled device that drops
// frames; otherwise content could sit hidden while GSAP "catches up".
gsap.ticker.lagSmoothing(0);

// Whatever GSAP sets inline is cleared afterwards, so CSS hover states keep working.
const CLEAR = 'transform,opacity,visibility';

/**
 * Subtle entrance motion for the landing page: the hero settles in line by line,
 * then each section's heading and content rise a few pixels as they scroll into
 * view, once. Nothing runs under prefers-reduced-motion.
 */
export function useLandingMotion(root: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const mm = gsap.matchMedia(root.current!);
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const ease = 'power3.out';

      gsap.timeline({ defaults: { ease, duration: 0.8 } })
        .from('.hero-text', { y: 24, autoAlpha: 0, stagger: 0.1, clearProps: CLEAR })
        .from('.hero-note, .hero-rail', { y: 12, autoAlpha: 0, stagger: 0.08, duration: 0.7, clearProps: CLEAR }, '-=0.5')
        .from('.bento > *', { y: 24, autoAlpha: 0, stagger: 0.06, duration: 0.8, clearProps: CLEAR }, '-=0.5');

      gsap.utils.toArray<HTMLElement>('.section-head').forEach((el) => {
        gsap.from(el.children, {
          y: 18, autoAlpha: 0, duration: 0.8, stagger: 0.08, ease, clearProps: CLEAR,
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        });
      });

      const blocks = '.index-list > li, .browse-tools, .row > .card, .deck, .map-stage-box, .about-grid > *, .company';
      gsap.set(blocks, { y: 24, autoAlpha: 0 });
      ScrollTrigger.batch(blocks, {
        start: 'top 88%',
        once: true,
        onEnter: (els) => gsap.to(els, { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.08, ease, clearProps: CLEAR }),
      });

      // Fonts and images shift the layout after first paint; re-measure once they settle.
      document.fonts?.ready.then(() => ScrollTrigger.refresh());
    });
    return () => mm.revert();
  }, [root]);
}
