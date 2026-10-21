import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * A number that counts up from 0 the first time it scrolls into view.
 * The real value is always in the DOM (visually hidden copy for screen readers
 * and crawlers); the animated copy is aria-hidden. Skipped under reduced motion.
 */
export function CountUp({ value, decimals = 0, suffix = '', duration = 1.6 }: {
  value: number; decimals?: number; suffix?: string; duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = `${value.toFixed(decimals)}${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const counter = { n: 0 };
    let tween: gsap.core.Tween | null = null;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      tween = gsap.to(counter, {
        n: value, duration, ease: 'power2.out',
        onUpdate: () => { el.textContent = `${counter.n.toFixed(decimals)}${suffix}`; },
        onComplete: () => { el.textContent = final; },
      });
    }, { threshold: 0.4 });
    el.textContent = `${(0).toFixed(decimals)}${suffix}`;
    io.observe(el);
    return () => { io.disconnect(); tween?.kill(); el.textContent = final; };
  }, [value, decimals, suffix, duration, final]);

  return (
    <>
      <span ref={ref} aria-hidden="true" style={{ fontVariantNumeric: 'tabular-nums' }}>{final}</span>
      <span className="visually-hidden">{final}</span>
    </>
  );
}
