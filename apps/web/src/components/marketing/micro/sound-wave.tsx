'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

/** Animated equaliser bars — the "the kitchen hears it" motif. Transform-only. */
export function SoundWave({
  bars = 5,
  height = 16,
  className,
  barClassName,
  active = true,
}: {
  bars?: number;
  height?: number;
  className?: string;
  barClassName?: string;
  active?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <span className={cn('inline-flex items-center gap-[3px]', className)} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <motion.span
          key={i}
          className={cn('block w-[3px] rounded-full bg-current', barClassName)}
          style={{ height, originY: 0.5 }}
          animate={active && !reduce ? { scaleY: [0.3, 1, 0.45, 0.9, 0.3] } : { scaleY: 0.5 }}
          transition={{ duration: 1.1, repeat: active && !reduce ? Infinity : 0, ease: 'easeInOut', delay: i * 0.12 }}
        />
      ))}
    </span>
  );
}
