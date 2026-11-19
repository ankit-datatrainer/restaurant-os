'use client';

import * as React from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { Check } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';
import { MOCK_TOTALS } from '../mock-data';

/** The UPI amount fills in, the "I have paid" state lands, then it repeats. */
export function UpiFill() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const cycle = useLoop(2, 3200, inView);
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => formatINR(Math.round(v * 100) / 100));
  const paid = cycle === 1;

  React.useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(MOCK_TOTALS.total);
      return;
    }
    mv.set(0);
    const controls = animate(mv, MOCK_TOTALS.total, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [cycle, inView, reduce, mv]);

  return (
    <div ref={ref} className="flex h-full flex-col justify-between">
      <div className="rounded-2xl bg-paper/[0.06] p-4">
        <p className="font-mono text-2xs uppercase tracking-[0.18em] text-muted">upi://pay?am=</p>
        <motion.p className="tnum mt-1 font-display text-3xl font-bold">{text}</motion.p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper/10">
          <motion.span
            className="block h-full origin-left rounded-full bg-ember"
            animate={{ scaleX: paid ? 1 : 0.62 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">Amount pre-filled, reference set.</span>
        <motion.span
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.12em]"
          animate={{ backgroundColor: paid ? 'rgba(47,184,122,0.18)' : 'rgba(247,244,238,0.08)', color: paid ? '#2FB87A' : 'rgba(247,244,238,0.6)' }}
          transition={{ duration: 0.4 }}
        >
          {paid && <Check className="h-3 w-3" aria-hidden />}
          {paid ? 'Guest says paid' : 'Awaiting'}
        </motion.span>
      </div>
    </div>
  );
}
