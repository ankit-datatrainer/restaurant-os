'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { formatINR } from '@/lib/utils';
import { useOnScreen } from '../hooks';
import { MOCK_TAX_RATE, MOCK_TOTALS } from '../mock-data';

/** GST split, computed by the same helper the product uses. */
export function BillLines() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const half = MOCK_TAX_RATE / 2;
  const rows = [
    { k: 'Subtotal', v: MOCK_TOTALS.subtotal },
    { k: `CGST ${half}%`, v: MOCK_TOTALS.cgst },
    { k: `SGST ${half}%`, v: MOCK_TOTALS.sgst },
  ];
  return (
    <div ref={ref} className="flex h-full flex-col justify-end">
      <ul className="rounded-2xl bg-paper/[0.06] p-4 font-mono text-[13px]">
        {rows.map((r, i) => (
          <motion.li
            key={r.k}
            className="flex items-center justify-between py-1.5"
            initial={reduce ? false : { opacity: 0, x: -10 }}
            animate={inView ? { opacity: 1, x: 0 } : undefined}
            transition={{ delay: 0.1 + i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-muted">{r.k}</span>
            <span className="tnum">{formatINR(r.v)}</span>
          </motion.li>
        ))}
        <motion.li
          className="relative mt-1.5 flex items-center justify-between overflow-hidden border-t border-paper/10 pt-3 font-display text-lg font-bold"
          initial={reduce ? false : { opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ delay: 0.55 }}
        >
          <span>Total</span>
          <span className="tnum">{formatINR(MOCK_TOTALS.total)}</span>
          {!reduce && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-ember/20 to-transparent"
              animate={inView ? { x: ['-120%', '420%'] } : undefined}
              transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
            />
          )}
        </motion.li>
      </ul>
      <p className="mt-3 font-mono text-2xs uppercase tracking-[0.16em] text-muted">GSTIN printed on every bill</p>
    </div>
  );
}
