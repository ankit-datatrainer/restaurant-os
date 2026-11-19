'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Printer } from 'lucide-react';
import { useOnScreen } from '../hooks';
import { MOCK_ORDER_NUMBER, MOCK_RESTAURANT } from '../mock-data';

const ZIGZAG = `polygon(0 0, 100% 0, 100% calc(100% - 6px), ${Array.from({ length: 14 }, (_, i) => `${100 - (i + 1) * (100 / 14)}% ${i % 2 === 0 ? '100%' : 'calc(100% - 6px)'}`).join(', ')})`;

/** A kitchen order ticket feeding out of the printer slot. */
export function KotPrint() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className="flex h-full flex-col items-center justify-start" aria-hidden>
      <div className="relative z-10 flex h-9 w-[85%] items-center justify-between rounded-xl bg-ink-3 px-3 ring-1 ring-paper/10">
        <Printer className="h-4 w-4 text-muted" />
        <span className="h-1 w-2/3 rounded-full bg-ink" />
        <span className="relative flex h-1.5 w-1.5">
          {inView && !reduce && <span className="absolute inline-flex h-full w-full rounded-full bg-mint animate-pulse-ring" />}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint" />
        </span>
      </div>
      <div className="relative -mt-1 h-[132px] w-[70%] overflow-hidden">
        <motion.div
          className="absolute inset-x-0 top-0 bg-paper px-3 pb-4 pt-3 font-mono text-[10px] leading-relaxed text-ink"
          style={{ clipPath: ZIGZAG }}
          initial={reduce ? false : { y: '-100%' }}
          animate={inView ? { y: reduce ? 0 : ['-100%', '0%', '0%'] } : undefined}
          transition={{ duration: 3.2, times: [0, 0.45, 1], repeat: reduce ? 0 : Infinity, repeatDelay: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="flex justify-between font-bold">
            <span>KOT</span>
            <span className="tnum">#{MOCK_ORDER_NUMBER}</span>
          </p>
          <p className="border-b border-dashed border-ink/30 pb-1 text-ink/60">{MOCK_RESTAURANT.table} · 8:42 pm</p>
          <p className="mt-1">1 × Paneer Tikka</p>
          <p>2 × Garlic Naan</p>
          <p className="text-ink/60">· less spicy</p>
        </motion.div>
      </div>
    </div>
  );
}
