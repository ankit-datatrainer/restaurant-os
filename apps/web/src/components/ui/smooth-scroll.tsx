'use client';

import * as React from 'react';
import Lenis from 'lenis';

/**
 * Lenis smooth scrolling for the marketing site. Not used on the guest menu or admin
 * (native scrolling is better for app-like surfaces).
 *
 * No scroll reset on route change on purpose: the App Router already scrolls to the top on
 * push navigations, jumps to `#fragment` targets and restores the position on back/forward,
 * and Lenis re-syncs from the native scroll event. A forced `scrollTo(0)` here would undo all three.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = React.useRef<Lenis | null>(null);

  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.95, smoothWheel: true });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // Let GSAP ScrollTrigger (if present) sync with Lenis.
    const w = window as unknown as { __lenis?: Lenis };
    w.__lenis = lenis;
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
      delete w.__lenis;
    };
  }, []);

  return <>{children}</>;
}

/** Scroll to an in-page anchor through Lenis when available. */
export function scrollToId(id: string, offset = -80) {
  const el = document.getElementById(id);
  if (!el) return;
  const w = window as unknown as { __lenis?: Lenis };
  if (w.__lenis) w.__lenis.scrollTo(el, { offset });
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
