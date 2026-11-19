'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Gift, Webhook } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { useLoop, useOnScreen } from '../hooks';

/* Illustrative shapes only: no real restaurant's numbers. */
const DAYS = [
  { d: 'Mon', h: 42 },
  { d: 'Tue', h: 38 },
  { d: 'Wed', h: 51 },
  { d: 'Thu', h: 47 },
  { d: 'Fri', h: 74 },
  { d: 'Sat', h: 96 },
  { d: 'Sun', h: 88 },
];

const EVENTS = ['Order placed', 'Dishes added', 'Status changed', 'Payment changed'];
const VISITS_FOR_REWARD = 5;

/** Premium, the owner's side: a reports card, a loyalty card that fills up and unlocks, and a webhook delivery line. */
export function PremiumBoard({ className }: { className?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const visits = useLoop(VISITS_FOR_REWARD + 2, 900, inView && !reduce);
  const filled = reduce ? VISITS_FOR_REWARD : Math.min(visits, VISITS_FOR_REWARD);
  const unlocked = filled >= VISITS_FOR_REWARD;
  const event = useLoop(EVENTS.length, 1800, inView && !reduce);

  return (
    <div ref={ref} className={cn('relative grid w-full max-w-md gap-4', className)} aria-hidden>
      <div className="rounded-[28px] border border-paper/10 bg-ink-2 p-5 shadow-lift">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">Reports</p>
            <p className="mt-1 font-display text-lg font-bold leading-tight">Revenue by day</p>
          </div>
          <span className="rounded-full bg-paper/10 px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.14em] text-muted">Illustrative</span>
        </div>
        <div className="flex h-28 items-end gap-2">
          {DAYS.map((x, i) => (
            <div key={x.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <motion.span
                className={cn('block w-full origin-bottom rounded-t-md', x.h > 80 ? 'bg-ember' : 'bg-paper/20')}
                style={{ height: `${x.h}%` }}
                initial={reduce ? false : { scaleY: 0 }}
                animate={inView || reduce ? { scaleY: 1 } : { scaleY: 0 }}
                transition={{ duration: 0.7, delay: 0.05 * i, ease: EASE_OUT }}
              />
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{x.d}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-paper/10 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          vs previous period · CSV export
        </p>
      </div>

      <div className="ml-auto w-[88%] rounded-[24px] border border-paper/10 bg-ink-2 p-5 shadow-lift">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Loyalty</p>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Every {VISITS_FOR_REWARD}th visit</span>
        </div>
        <div className="mt-3 flex gap-2">
          {Array.from({ length: VISITS_FOR_REWARD }, (_, i) => (
            <span
              key={i}
              className={cn(
                'flex h-8 flex-1 items-center justify-center rounded-lg border font-mono text-[11px] transition-colors duration-300',
                i < filled ? 'border-ember bg-ember/15 text-ember' : 'border-paper/10 text-muted',
              )}
            >
              {i + 1}
            </span>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={unlocked ? 'on' : 'off'}
            className={cn('mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]', unlocked ? 'text-mint' : 'text-muted')}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
          >
            <Gift className="h-3 w-3" />
            {unlocked ? 'Reward unlocked · free dessert · code on their phone' : 'Visits so far'}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="w-[92%] rounded-[20px] border border-paper/10 bg-ink-2 px-4 py-3 shadow-lift">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          <Webhook className="h-3.5 w-3.5 text-ember" />
          <span className="min-w-0 flex-1 truncate text-fg/85">Webhook · {EVENTS[event]}</span>
          <span className="rounded-full bg-mint/15 px-2 py-0.5 text-mint">Signed · delivered</span>
        </p>
      </div>
    </div>
  );
}
