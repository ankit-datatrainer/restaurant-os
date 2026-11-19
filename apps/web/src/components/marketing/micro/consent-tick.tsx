'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ShieldCheck } from 'lucide-react';
import { marketingConsentText } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';
import { MOCK_RESTAURANT } from '../mock-data';

/**
 * Optional number, then a separate box that starts unticked. The guest ticks it; the exact wording and time are saved.
 * Phases: 0 empty, 1 number typed, 2 guest ticks the box, 3 consent recorded.
 */
export function ConsentTick() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const phase = useLoop(4, 1500, inView);
  const ticked = phase >= 2;
  return (
    <div ref={ref} className="flex h-full flex-col justify-end gap-2.5" aria-hidden>
      <div className="rounded-xl border border-paper/10 bg-paper/[0.04] px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">Mobile number (optional)</p>
        <p className="tnum mt-0.5 h-5 font-mono text-[13px] text-fg">
          {phase >= 1 ? '+91 98450 12345' : <span className="text-muted/60">Mobile number (optional)</span>}
        </p>
      </div>
      <div className={cn('flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors duration-300', ticked ? 'border-mint/40 bg-mint/[0.06]' : 'border-paper/10')}>
        <span className={cn('relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-300', ticked ? 'border-mint bg-mint text-white' : 'border-paper/30')}>
          <AnimatePresence>
            {ticked && (
              <motion.span key="tick" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 24 }}>
                <Check className="h-3 w-3" strokeWidth={3.5} />
              </motion.span>
            )}
          </AnimatePresence>
          {phase === 2 && !reduce && <span className="absolute -inset-2 rounded-full border-2 border-ember/60 animate-pulse-ring" />}
        </span>
        <p className="text-[11px] leading-snug text-fg/80">{marketingConsentText(MOCK_RESTAURANT.name)}</p>
      </div>
      <p className={cn('flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-300', phase === 3 ? 'text-mint' : 'text-muted')}>
        <ShieldCheck className="h-3 w-3" />
        {phase === 3 ? 'Consent saved · wording + time' : 'Unticked until the guest ticks it'}
      </p>
    </div>
  );
}
