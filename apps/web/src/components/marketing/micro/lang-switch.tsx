'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn, formatINR } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';

const DISHES = [
  { en: 'Paneer Tikka', hi: 'पनीर टिक्का', price: 249 },
  { en: 'Dal Makhani', hi: 'दाल मखनी', price: 289 },
  { en: 'Butter Naan', hi: 'बटर नान', price: 60 },
];

/** The guest's EN / हिं switch flips the same menu between English and Hindi. */
export function LangSwitch() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const hindi = useLoop(2, 2200, inView) === 1;
  return (
    <div ref={ref} className="flex h-full flex-col justify-end gap-2.5" aria-hidden>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{hindi ? 'मुख्य व्यंजन' : 'Mains'}</p>
        <span className="relative inline-flex rounded-full bg-paper/[0.08] p-0.5 font-mono text-[11px]">
          {(['EN', 'हिं'] as const).map((l, i) => {
            const on = (i === 1) === hindi;
            return (
              <span key={l} className={cn('relative z-10 px-2.5 py-1 transition-colors duration-300', on ? 'text-white' : 'text-muted')}>
                {on && (
                  <motion.span
                    layoutId="lang-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-ember"
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 34 }}
                  />
                )}
                {l}
              </span>
            );
          })}
        </span>
      </div>
      <ul className="space-y-1.5">
        {DISHES.map((d) => (
          <li key={d.en} className="flex items-center gap-3 rounded-xl bg-paper/[0.04] px-3 py-2 text-sm">
            <span className="relative h-5 flex-1 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={hindi ? 'hi' : 'en'}
                  lang={hindi ? 'hi' : 'en'}
                  className="absolute inset-0 truncate"
                  initial={reduce ? false : { y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { y: '-100%', opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  {hindi ? d.hi : d.en}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="tnum font-mono text-xs text-muted">{formatINR(d.price)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
