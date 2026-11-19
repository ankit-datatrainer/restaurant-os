'use client';

import * as React from 'react';

/**
 * Tracks which section (by element id) currently sits under the sticky header.
 * Uses an IntersectionObserver whose root margin shrinks the viewport to a one-pixel
 * band just below the header, so an entry fires exactly when a section crosses it.
 */
export function useScrollSpy(ids: string[], offset: number, reduceMotion: boolean) {
  const [active, setActive] = React.useState<string | null>(null);
  const lockRef = React.useRef<{ id: string; until: number } | null>(null);

  React.useEffect(() => {
    if (ids.length === 0) return;
    let io: IntersectionObserver | null = null;
    const build = () => {
      io?.disconnect();
      const band = Math.max(1, window.innerHeight - offset - 1);
      io = new IntersectionObserver(
        (entries) => {
          const lock = lockRef.current;
          if (lock && Date.now() < lock.until) return;
          lockRef.current = null;
          const hit = entries.find((e) => e.isIntersecting);
          if (hit) setActive(hit.target.id);
        },
        { rootMargin: `-${offset}px 0px -${band}px 0px`, threshold: 0 },
      );
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) io.observe(el);
      }
    };
    build();
    window.addEventListener('resize', build);
    return () => {
      io?.disconnect();
      window.removeEventListener('resize', build);
    };
  }, [ids, offset]);

  // Default to the first section until the user scrolls.
  React.useEffect(() => {
    setActive((cur) => (cur && ids.includes(cur) ? cur : (ids[0] ?? null)));
  }, [ids]);

  const scrollTo = React.useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      lockRef.current = { id, until: Date.now() + (reduceMotion ? 150 : 900) };
      setActive(id);
      const top = window.scrollY + el.getBoundingClientRect().top - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
    },
    [offset, reduceMotion],
  );

  return { active, scrollTo };
}
