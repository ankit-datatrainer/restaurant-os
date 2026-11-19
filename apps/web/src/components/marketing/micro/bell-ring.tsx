'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, Check } from 'lucide-react';
import { CALL_TYPE_LABEL } from '@restaurant-os/shared';
import { useLoop, useOnScreen } from '../hooks';

/** Waiter bell rings, the call lands on the board, a waiter acknowledges it and the guest sees it. */
export function BellRing() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const phase = useLoop(3, 1400, inView); // 0 ring, 1 call shown, 2 attended
  return (
    <div ref={ref} className="flex h-full items-center gap-5">
      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
        {!reduce && inView && phase === 0 && (
          <>
            <span className="absolute inset-0 rounded-full border border-ember/60 animate-pulse-ring" aria-hidden />
            <span className="absolute inset-2 rounded-full border border-ember/40 animate-pulse-ring [animation-delay:300ms]" aria-hidden />
          </>
        )}
        <motion.span
          className="relative flex h-16 w-16 items-center justify-center rounded-full bg-saffron text-ink"
          style={{ originY: 0.1 }}
          animate={phase === 0 && !reduce ? { rotate: [0, -18, 16, -12, 8, -4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
        >
          <Bell className="h-7 w-7" aria-hidden />
        </motion.span>
      </div>
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {phase === 0 ? (
            <motion.p key="tap" className="text-sm text-muted" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              Guest taps <span className="font-semibold text-fg">{CALL_TYPE_LABEL.waiter}</span>
            </motion.p>
          ) : (
            <motion.div
              key="card"
              className="rounded-xl border border-paper/10 bg-paper/[0.06] p-3"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">Table 4 · {CALL_TYPE_LABEL.waiter}</span>
                <motion.span
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.12em]"
                  animate={{ backgroundColor: phase === 2 ? 'rgba(47,184,122,0.18)' : 'rgba(255,92,42,0.18)', color: phase === 2 ? '#2FB87A' : '#FF5C2A' }}
                >
                  {phase === 2 ? (
                    <>
                      <Check className="h-3 w-3" /> Attended
                    </>
                  ) : (
                    'Open'
                  )}
                </motion.span>
              </div>
              <p className="mt-1 text-xs text-muted">{phase === 2 ? 'The guest’s phone now says someone is on the way.' : 'Rings on every staff phone.'}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
