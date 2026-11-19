'use client';

import * as React from 'react';
import { ensureGsap, getLenis, type LenisLike } from './gsap';

/**
 * Keeps GSAP ScrollTrigger in step with Lenis. Mounted once in the marketing layout.
 * Lenis is created by the parent <SmoothScroll> effect, which runs after this one,
 * so we wait a few frames for window.__lenis to appear.
 */
export function ScrollSync() {
  React.useEffect(() => {
    const { ScrollTrigger } = ensureGsap();
    let attached: LenisLike | null = null;
    let raf = 0;
    let tries = 0;

    const attach = () => {
      const lenis = getLenis();
      if (lenis) {
        attached = lenis;
        lenis.on('scroll', ScrollTrigger.update);
        ScrollTrigger.refresh();
        return;
      }
      if (tries++ < 90) raf = requestAnimationFrame(attach);
      else ScrollTrigger.refresh();
    };
    attach();

    const onFonts = () => ScrollTrigger.refresh();
    if ('fonts' in document) document.fonts.ready.then(onFonts).catch(() => undefined);

    return () => {
      cancelAnimationFrame(raf);
      attached?.off('scroll', ScrollTrigger.update);
    };
  }, []);
  return null;
}
