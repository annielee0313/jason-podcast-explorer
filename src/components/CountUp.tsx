import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * Odometer-style number: each digit is a column of 0–9 that rolls up and stops on
 * its digit, the first time the number scrolls into view. Rightmost digits spin
 * more, like a real counter.
 *
 * Layout never shifts: each column holds an invisible copy of its final digit, which
 * sets the width and the baseline; the rolling strip sits on top, clipped to it.
 * The real value is always in the DOM (visually hidden copy for screen readers and
 * crawlers); the animated copy is aria-hidden. Static under reduced motion.
 */
export function CountUp({ value, decimals = 0, suffix = '', duration = 1.2 }: {
  value: number; decimals?: number; suffix?: string; duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = `${value.toFixed(decimals)}${suffix}`;
  const chars = [...final];

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const strips = [...el.querySelectorAll<HTMLElement>('.roll-strip')];
    // Start every strip on its first "0" (the prerendered HTML shows the final value via an
    // inline transform; replace it rather than letting GSAP add to it).
    gsap.set(strips, { y: 0, yPercent: 0 });
    let tween: gsap.core.Tween | null = null;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      tween = gsap.to(strips, {
        yPercent: (_, s: HTMLElement) => -100 * (1 - 1 / s.childElementCount),
        duration, ease: 'power3.out', stagger: { each: 0.08, from: 'end' },
      });
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); tween?.kill(); gsap.set(strips, { clearProps: 'transform' }); };
  }, [final, duration]);

  let seen = 0;
  return (
    <>
      <span ref={ref} className="roll" aria-hidden="true">
        {chars.map((c, i) => {
          if (!/\d/.test(c)) return <span key={i}>{c}</span>;
          const spins = seen++; // the ones digit spins most, like an odometer
          const d = Number(c);
          const strip = Array.from({ length: spins * 10 + d + 1 }, (_, k) => k % 10);
          return (
            <span key={i} className="roll-col">
              <span className="roll-size">{c}</span>
              {/* Ends on the final digit, so with no JS (or before it runs) the strip shows it. */}
              <span className="roll-strip" style={{ transform: `translateY(${-100 * (1 - 1 / strip.length)}%)` }}>
                {strip.map((n, k) => <span key={k}>{n}</span>)}
              </span>
            </span>
          );
        })}
      </span>
      <span className="visually-hidden">{final}</span>
    </>
  );
}
