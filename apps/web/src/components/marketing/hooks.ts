'use client';

import * as React from 'react';
import { useInView } from 'framer-motion';

/** Cycles 0..length-1 every `ms` while `active`. Used by the looping micro-animations. */
export function useLoop(length: number, ms: number, active = true): number {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    if (!active || length <= 1) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % length), ms);
    return () => window.clearInterval(id);
  }, [active, length, ms]);
  return i;
}

/** Ref + "is on screen" flag, so loops can pause when scrolled away. */
export function useOnScreen<T extends HTMLElement>(margin = '0px 0px -10% 0px') {
  const ref = React.useRef<T>(null);
  const inView = useInView(ref, { margin: margin as `${number}px ${number}px ${number}% ${number}px` });
  return { ref, inView };
}

/** Runs a list of timed phases once after mount (restarts when `key` changes). */
export function usePhases(timings: number[], key?: string | number): number {
  const [phase, setPhase] = React.useState(0);
  React.useEffect(() => {
    setPhase(0);
    const ids = timings.map((t, i) => window.setTimeout(() => setPhase(i + 1), t));
    return () => ids.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return phase;
}

/** True once the component has mounted on the client (avoids hydration mismatches for pointer checks). */
export function useMounted(): boolean {
  const [m, setM] = React.useState(false);
  React.useEffect(() => setM(true), []);
  return m;
}
