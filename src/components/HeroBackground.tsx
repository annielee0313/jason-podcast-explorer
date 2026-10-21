import { useEffect, useRef, useState } from 'react';
import { MeshGradient } from '@paper-design/shaders-react';

// Pale ground and soft teals from the brand palette: low contrast, so the ink
// headline on top keeps full contrast (well above 4.5:1 everywhere).
const COLORS = ['#F2F5F6', '#D8F1F3', '#E7EDEF', '#BEE7EB', '#F7F9FA'];
const SPEED = 0.12; // one slow drift, not a light show

/**
 * Slow mesh-gradient shader behind the hero. Pauses when scrolled out of view
 * and renders one still frame under prefers-reduced-motion. If WebGL2 is not
 * available the canvas stays empty and the plain ground shows through.
 */
export function HeroBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  // The canvas only exists in the browser: the prerendered HTML ships the plain ground.
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    setReduced(mq?.matches ?? false);
    const onChange = () => setReduced(mq.matches);
    mq?.addEventListener('change', onChange);
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(ref.current!);
    return () => { mq?.removeEventListener('change', onChange); io.disconnect(); };
  }, []);

  return (
    <div ref={ref} className="hero-bg" aria-hidden="true">
      {mounted && <MeshGradient
        colors={COLORS}
        distortion={0.8}
        swirl={0.15}
        grainMixer={0}
        grainOverlay={0.12}
        speed={visible && !reduced ? SPEED : 0}
        maxPixelCount={1600 * 900}
        style={{ width: '100%', height: '100%' }}
      />}
    </div>
  );
}
