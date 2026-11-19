'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { orderCode } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';
import { MOCK_ORDER_NUMBER, MOCK_RESTAURANT } from '../mock-data';

const ROUND_1 = ['Paneer Tikka ×1', 'Butter Chicken ×1'];
const ROUND_2 = ['Garlic Naan ×2', 'Masala Chai ×1'];

/** Same order, a second round: the added dishes are marked for the kitchen. */
export function AddRound() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const phase = useLoop(3, 1500, inView); // 0 original, 1 guest taps add, 2 round 2 lands
  return (
    <div ref={ref} className="flex h-full flex-col justify-end" aria-hidden>
      <div className="rounded-2xl bg-paper/[0.06] p-3.5">
        <p className="tnum font-mono text-[10px] text-muted">
          {orderCode(MOCK_ORDER_NUMBER)} · {MOCK_RESTAURANT.table}
        </p>
        <ul className="mt-2 space-y-1">
          {ROUND_1.map((l) => (
            <li key={l} className="text-[12px] text-fg/70">
              {l}
            </li>
          ))}
        </ul>
        <AnimatePresence initial={false}>
          {phase === 2 && (
            <motion.div
              key="r2"
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <p className="mt-2.5 flex items-center gap-2 border-t border-dashed border-ember/40 pt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-ember">
                Round 2 · added
              </p>
              <ul className="mt-1 space-y-1">
                {ROUND_2.map((l) => (
                  <li key={l} className="flex items-center gap-2 text-[12px] font-semibold text-fg">
                    <span className="rounded bg-ember px-1 font-mono text-[8px] uppercase tracking-wider text-white">New</span>
                    {l}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <motion.span
        className="mt-3 flex h-8 w-fit items-center gap-1.5 rounded-full border border-ember px-3 text-[11px] font-bold text-ember"
        animate={phase === 1 && !reduce ? { scale: [1, 0.92, 1] } : { scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <Plus className="h-3.5 w-3.5" /> Add to my order
      </motion.span>
    </div>
  );
}
