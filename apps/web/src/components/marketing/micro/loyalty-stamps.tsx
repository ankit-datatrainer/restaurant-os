'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';

const EVERY = 5;

/** Visits fill up; the 5th unlocks a reward code on the guest's phone. Illustrative rule and code. */
export function LoyaltyStamps() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const step = useLoop(EVERY + 2, 850, inView && !reduce);
  const filled = reduce ? EVERY : Math.min(step, EVERY);
  const unlocked = filled >= EVERY;
  return (
    <div ref={ref} className="flex h-full flex-col justify-end gap-3" aria-hidden>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Every {EVERY}th visit · free dessert</p>
      <div className="flex gap-2">
        {Array.from({ length: EVERY }, (_, i) => (
          <span
            key={i}
            className={cn(
              'flex h-9 flex-1 items-center justify-center rounded-xl border font-mono text-xs transition-colors duration-300',
              i < filled ? 'border-ember bg-ember/15 text-ember' : 'border-paper/10 text-muted',
            )}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div className="h-11">
        <AnimatePresence initial={false}>
          {unlocked && (
            <motion.div
              className="flex items-center gap-2.5 rounded-xl border border-dashed border-mint/50 bg-mint/[0.08] px-3 py-2"
              initial={reduce ? false : { opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <Gift className="h-4 w-4 shrink-0 text-mint" />
              <span className="flex-1 text-[12px] text-fg/90">Reward unlocked</span>
              <span className="tnum font-mono text-[11px] tracking-[0.12em] text-mint">SL-7Q4K</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
