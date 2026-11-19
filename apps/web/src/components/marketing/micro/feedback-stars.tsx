'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';

const RATINGS = [5, 3, 2] as const;

/** The rating changes, the Google review link does not: no gating. */
export function FeedbackStars({ className }: { className?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const i = useLoop(RATINGS.length, 1900, inView);
  const rating = RATINGS[i] ?? 5;
  return (
    <div ref={ref} className={cn('flex h-full flex-col justify-end gap-3', className)} aria-hidden>
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, s) => (
          <Star
            key={s}
            className={cn('h-6 w-6 transition-colors duration-300', s < rating ? 'fill-saffron text-saffron' : 'text-paper/15')}
            style={{ transitionDelay: `${s * 50}ms` }}
            strokeWidth={1.6}
          />
        ))}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={rating}
            className="tnum ml-2 font-mono text-xs text-muted"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            {rating} of 5
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="flex h-9 w-fit items-center gap-1.5 rounded-full bg-paper px-4 text-[12px] font-semibold text-ink">
        Review us on Google <ExternalLink className="h-3 w-3" />
      </span>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mint">Shown for every rating</p>
    </div>
  );
}
