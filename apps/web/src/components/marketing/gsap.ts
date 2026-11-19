import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let registered = false;

/**
 * Registers ScrollTrigger exactly once (client only) and returns the gsap handles.
 * Call inside useEffect; never at module top level (SSR).
 */
export function ensureGsap() {
  if (!registered && typeof window !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    registered = true;
  }
  return { gsap, ScrollTrigger };
}

export type LenisLike = {
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
  scrollTo: (target: number | string | HTMLElement, opts?: { offset?: number; immediate?: boolean }) => void;
  stop: () => void;
  start: () => void;
};

/** The Lenis instance SmoothScroll exposes on window (undefined under reduced motion). */
export function getLenis(): LenisLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __lenis?: LenisLike }).__lenis;
}
